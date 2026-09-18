package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"k8s-dashboard-backend/pkg/ingressmetrics"
	"k8s-dashboard-backend/pkg/k8s"
	"k8s-dashboard-backend/pkg/kubeletmetrics"
	"k8s-dashboard-backend/pkg/nodeexporter"
	authenticationv1 "k8s.io/api/authentication/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

var clusterOverviewCache struct {
	sync.RWMutex
	data gin.H
}

// cpuSample menyimpan hasil scrape node_cpu_seconds_total sebelumnya per node,
// dipakai untuk menghitung delta (usage = 1 - idleDelta/totalDelta) antar request,
// karena node_cpu_seconds_total adalah counter kumulatif, bukan nilai instan.
type cpuSample struct {
	timestamp    time.Time
	totalSeconds float64
	idleSeconds  float64
}

var cpuSampleCache struct {
	sync.Mutex
	samples map[string]cpuSample
}

// containerCPUSampleCache: sama seperti cpuSampleCache tapi per-container
// (key: "namespace/pod/container"), dipakai untuk hitung delta CPU usage
// per pod di Fitur 6 (Live Container Metrics).
type containerCPUSample struct {
	timestamp  time.Time
	cpuSeconds float64
}

var containerCPUSampleCache struct {
	sync.Mutex
	samples map[string]containerCPUSample
}

func nodeExporterPort() int {
	if v := os.Getenv("NODE_EXPORTER_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			return port
		}
	}
	return 9100
}

// kubeletTokenCache menyimpan token ServiceAccount "metrics-server" (sudah ada di
// cluster dengan RBAC nodes/metrics) yang dipakai untuk autentikasi langsung ke
// kubelet tiap node. Dibuat lewat TokenRequest API dan di-cache di memory supaya
// tidak mint token baru di setiap request dashboard.
var kubeletTokenCache struct {
	sync.Mutex
	token  string
	expiry time.Time
}

func kubeletToken(ctx context.Context, clientset *kubernetes.Clientset) (string, error) {
	kubeletTokenCache.Lock()
	defer kubeletTokenCache.Unlock()

	if kubeletTokenCache.token != "" && time.Now().Before(kubeletTokenCache.expiry) {
		return kubeletTokenCache.token, nil
	}

	expirationSeconds := int64(3600)
	tr, err := clientset.CoreV1().ServiceAccounts("kube-system").CreateToken(ctx, "metrics-server", &authenticationv1.TokenRequest{
		Spec: authenticationv1.TokenRequestSpec{ExpirationSeconds: &expirationSeconds},
	}, metav1.CreateOptions{})
	if err != nil {
		return "", err
	}

	kubeletTokenCache.token = tr.Status.Token
	kubeletTokenCache.expiry = tr.Status.ExpirationTimestamp.Time.Add(-5 * time.Minute)
	return kubeletTokenCache.token, nil
}

// ingressControllerNamespace: namespace tempat ingress controller berjalan, dipakai
// NetworkPolicy isolasi supaya traffic dari ingress tetap bisa masuk ke namespace
// tenant. Override lewat env kalau nama namespace ingress controller di cluster
// berbeda dari default k3s/ingress-nginx ("ingress-nginx" atau "kube-system").
func ingressControllerNamespace() string {
	if v := os.Getenv("INGRESS_CONTROLLER_NAMESPACE"); v != "" {
		return v
	}
	return "ingress-nginx"
}

// ingressMetricsServiceName: nama Service NodePort yang meng-expose port metrics
// ingress-nginx-controller (10254) supaya bisa diakses lewat <node-ip>:<nodePort> —
// pod IP overlay Flannel (10.42.x.x) terbukti tidak terjangkau dari tempat backend
// ini berjalan, jadi harus lewat NodePort, sama seperti node-exporter/kubelet.
// Buat service ini manual: kubectl expose deployment ingress-nginx-controller
// -n ingress-nginx --type=NodePort --port=10254 --target-port=10254
// --name=ingress-nginx-controller-metrics
func ingressMetricsServiceName() string {
	if v := os.Getenv("INGRESS_METRICS_SERVICE"); v != "" {
		return v
	}
	return "ingress-nginx-controller-metrics"
}

// Fitur 10: Alert Notifications — node down, pod sering restart, resource >85%.
// Dievaluasi berkala oleh goroutine background (bukan cuma saat frontend buka
// halaman Alerts), supaya webhook benar-benar terkirim proaktif saat kejadian,
// bukan cuma saat ada yang kebetulan melihat dashboard.
type alertItem struct {
	ID       string    `json:"id"`
	Severity string    `json:"severity"`
	Title    string    `json:"title"`
	Message  string    `json:"message"`
	Time     time.Time `json:"time"`
}

var alertsState struct {
	sync.RWMutex
	items  []alertItem
	active map[string]bool // key alert yang sedang aktif, dipakai untuk dedup notifikasi
}

const (
	podRestartThreshold      = 5
	resourceThresholdPercent = 85.0
)

// alertWebhookURL: endpoint webhook (Slack/Discord/Teams/generic — apapun yang
// terima POST JSON {"text": "..."}). Kosong secara default; tanpa ini alert
// tetap dihitung & ditampilkan di dashboard, cuma tidak dikirim keluar.
func alertWebhookURL() string {
	return os.Getenv("ALERT_WEBHOOK_URL")
}

// telegramBotToken/telegramChatID: kredensial bot Telegram, dipakai terpisah dari
// ALERT_WEBHOOK_URL karena format API Telegram beda (butuh chat_id, bukan cuma
// text, dan endpoint-nya sudah termasuk token bot-nya).
func telegramBotToken() string {
	return os.Getenv("TELEGRAM_BOT_TOKEN")
}

func telegramChatID() string {
	return os.Getenv("TELEGRAM_CHAT_ID")
}

func postJSON(url string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}

// sendAlertWebhook mengirim notifikasi ke semua channel yang sudah dikonfigurasi
// (webhook generik Slack/Discord/Teams DAN/ATAU Telegram, keduanya independen).
// Kalau tidak ada satupun yang di-set, tidak mengirim kemana-mana.
func sendAlertWebhook(item alertItem) {
	text := fmt.Sprintf("[%s] %s\n%s", strings.ToUpper(item.Severity), item.Title, item.Message)

	if url := alertWebhookURL(); url != "" {
		if err := postJSON(url, gin.H{"text": text}); err != nil {
			log.Printf("Gagal mengirim alert webhook: %v", err)
		}
	}

	if token, chatID := telegramBotToken(), telegramChatID(); token != "" && chatID != "" {
		telegramURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
		if err := postJSON(telegramURL, gin.H{"chat_id": chatID, "text": text}); err != nil {
			log.Printf("Gagal mengirim alert ke Telegram: %v", err)
		}
	}
}

func evaluateAlerts(requestContext context.Context, clientset *kubernetes.Clientset) []alertItem {
	var items []alertItem
	now := time.Now()

	if nodes, err := clientset.CoreV1().Nodes().List(requestContext, metav1.ListOptions{}); err == nil {
		for _, node := range nodes.Items {
			ready := false
			for _, cond := range node.Status.Conditions {
				if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
					ready = true
				}
			}
			if !ready {
				items = append(items, alertItem{
					ID:       "node-down-" + node.Name,
					Severity: "danger",
					Title:    "Node Down",
					Message:  fmt.Sprintf("Node %s berstatus NotReady", node.Name),
					Time:     now,
				})
			}
		}
	}

	if pods, err := clientset.CoreV1().Pods("").List(requestContext, metav1.ListOptions{}); err == nil {
		for _, pod := range pods.Items {
			var restarts int32
			crashLoop := false
			for _, cs := range pod.Status.ContainerStatuses {
				restarts += cs.RestartCount
				if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
					crashLoop = true
				}
			}
			if crashLoop || restarts >= podRestartThreshold {
				suffix := ""
				if crashLoop {
					suffix = " (CrashLoopBackOff)"
				}
				items = append(items, alertItem{
					ID:       "pod-restart-" + pod.Namespace + "/" + pod.Name,
					Severity: "warning",
					Title:    "Pod Sering Restart",
					Message:  fmt.Sprintf("%s/%s sudah restart %dx%s", pod.Namespace, pod.Name, restarts, suffix),
					Time:     now,
				})
			}
		}
	}

	clusterOverviewCache.RLock()
	overview := clusterOverviewCache.data
	clusterOverviewCache.RUnlock()
	if overview != nil {
		metricsAvailable, _ := overview["metricsAvailable"].(bool)
		checkThreshold := func(label string, section interface{}) {
			m, ok := section.(gin.H)
			if !ok {
				return
			}
			percent, _ := m["percent"].(float64)
			if metricsAvailable && percent > resourceThresholdPercent {
				items = append(items, alertItem{
					ID:       "resource-" + label,
					Severity: "warning",
					Title:    fmt.Sprintf("%s Threshold > %.0f%%", label, resourceThresholdPercent),
					Message:  fmt.Sprintf("Cluster %s usage %.1f%%", label, percent),
					Time:     now,
				})
			}
		}
		checkThreshold("CPU", overview["cpu"])
		checkThreshold("Memory", overview["memory"])
		checkThreshold("Disk", overview["disk"])
	}

	return items
}

func startAlertLoop(clientset *kubernetes.Clientset) {
	alertsState.Lock()
	alertsState.active = map[string]bool{}
	alertsState.Unlock()

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			requestContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			items := evaluateAlerts(requestContext, clientset)
			cancel()

			newActive := map[string]bool{}
			alertsState.Lock()
			for _, item := range items {
				newActive[item.ID] = true
				if !alertsState.active[item.ID] {
					sendAlertWebhook(item)
				}
			}
			alertsState.items = items
			alertsState.active = newActive
			alertsState.Unlock()

			<-ticker.C
		}
	}()
}

// nginxSampleCache: sampel counter terakhir dari ingress-nginx-controller,
// dipakai untuk menghitung delta (request rate, error rate) antar request —
// sama seperti pola cpuSampleCache. Fitur 8 (Traffic In/Out & Health Check).
type nginxSample struct {
	timestamp          time.Time
	totalRequests      float64
	errorRequests      float64
	durationSumSeconds float64
	durationCount      float64
}

var nginxSampleCache struct {
	sync.Mutex
	sample *nginxSample
}

// firstMilli/firstValue mencari key pertama yang ada di ResourceList (mis. Status.Hard
// sebuah ResourceQuota) dari beberapa kemungkinan penamaan resource (requests.cpu vs
// limits.cpu vs cpu), karena cluster berbeda bisa memakai konvensi ResourceQuota berbeda.
func firstMilli(list corev1.ResourceList, keys ...corev1.ResourceName) (int64, bool) {
	for _, k := range keys {
		if q, ok := list[k]; ok {
			return q.MilliValue(), true
		}
	}
	return 0, false
}

func firstValue(list corev1.ResourceList, keys ...corev1.ResourceName) (int64, bool) {
	for _, k := range keys {
		if q, ok := list[k]; ok {
			return q.Value(), true
		}
	}
	return 0, false
}

type quotaResourceSpec struct {
	label    string
	hardKeys []corev1.ResourceName
	useMilli bool
}

var quotaResourceSpecs = []quotaResourceSpec{
	{"cpu", []corev1.ResourceName{corev1.ResourceRequestsCPU, corev1.ResourceLimitsCPU, corev1.ResourceCPU}, true},
	{"memory", []corev1.ResourceName{corev1.ResourceRequestsMemory, corev1.ResourceLimitsMemory, corev1.ResourceMemory}, false},
	{"storage", []corev1.ResourceName{corev1.ResourceRequestsStorage}, false},
	{"pods", []corev1.ResourceName{corev1.ResourcePods}, false},
}

func main() {
	// 1. Inisialisasi K8s Client
	clientset, _, err := k8s.InitClient()
	if err != nil {
		log.Fatalf("Gagal terhubung ke Kubernetes: %v", err)
	}

	cpuSampleCache.samples = make(map[string]cpuSample)
	containerCPUSampleCache.samples = make(map[string]containerCPUSample)
	startAlertLoop(clientset)

	// 2. Setup Gin Router
	r := gin.Default()

	// CORS Middleware untuk Frontend React
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 3. Endpoint Get Pods lintas semua namespace (atau satu namespace lewat ?namespace=)
	// Sumber data untuk Fitur 3 (Project/Namespace Grouping) & Fitur 5 (Pod Lifecycle).
	r.GET("/api/workloads/pods", func(c *gin.Context) {
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		namespace := c.Query("namespace")
		if namespace == "all" || namespace == "All" {
			namespace = ""
		}

		pods, err := clientset.CoreV1().Pods(namespace).List(requestContext, metav1.ListOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		podList := make([]map[string]interface{}, 0, len(pods.Items))
		for _, pod := range pods.Items {
			status := string(pod.Status.Phase)
			var restarts int32
			for _, cs := range pod.Status.ContainerStatuses {
				restarts += cs.RestartCount
				if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
					status = "CrashLoopBackOff"
				}
			}

			// Fitur 8: status liveness/readiness probe real, dari config container
			// (apakah probe didefinisikan) + status Ready pod saat ini.
			hasLivenessProbe := false
			hasReadinessProbe := false
			for _, container := range pod.Spec.Containers {
				if container.LivenessProbe != nil {
					hasLivenessProbe = true
				}
				if container.ReadinessProbe != nil {
					hasReadinessProbe = true
				}
			}
			ready := false
			for _, cond := range pod.Status.Conditions {
				if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
					ready = true
				}
			}

			containerNames := make([]string, 0, len(pod.Spec.Containers))
			for _, container := range pod.Spec.Containers {
				containerNames = append(containerNames, container.Name)
			}

			podList = append(podList, map[string]interface{}{
				"name":              pod.Name,
				"namespace":         pod.Namespace,
				"node":              pod.Spec.NodeName,
				"status":            status,
				"restarts":          restarts,
				"startTime":         pod.CreationTimestamp.Time,
				"hasLivenessProbe":  hasLivenessProbe,
				"hasReadinessProbe": hasReadinessProbe,
				"ready":             ready,
				"containers":        containerNames,
			})
		}

		c.JSON(http.StatusOK, gin.H{"data": podList})
	})

	// Restart pod: sumber data untuk Fitur 5 (Deployment & Pod Lifecycle).
	// Tidak ada API "restart" native di Kubernetes — cara standarnya adalah
	// menghapus pod; kalau pod dikelola controller (Deployment/ReplicaSet/
	// StatefulSet/DaemonSet), controller otomatis membuat penggantinya (= restart).
	// Kalau pod berdiri sendiri (bukan dikelola controller), pod akan hilang
	// permanen, bukan dibuat ulang.
	r.DELETE("/api/workloads/pods", func(c *gin.Context) {
		namespace := c.Query("namespace")
		name := c.Query("name")
		if namespace == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace dan name wajib diisi"})
			return
		}

		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		if err := clientset.CoreV1().Pods(namespace).Delete(requestContext, name, metav1.DeleteOptions{}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "pod deleted", "name": name, "namespace": namespace})
	})

	// Endpoint Live Log Streaming: sumber data untuk Fitur 9 (Centralized Log Viewer).
	// Streaming asli (SSE) langsung dari Kubernetes API (setara `kubectl logs -f`),
	// bukan polling atau simulasi — supaya benar-benar "tanpa perlu SSH ke server".
	r.GET("/api/workloads/logs", func(c *gin.Context) {
		namespace := c.Query("namespace")
		podName := c.Query("pod")
		container := c.Query("container")
		if namespace == "" || podName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace dan pod wajib diisi"})
			return
		}

		tailLines := int64(200)
		if v := c.Query("tailLines"); v != "" {
			if n, parseErr := strconv.ParseInt(v, 10, 64); parseErr == nil && n > 0 {
				tailLines = n
			}
		}

		logOptions := &corev1.PodLogOptions{
			Follow:     true,
			TailLines:  &tailLines,
			Timestamps: true,
		}
		if container != "" {
			logOptions.Container = container
		}

		logRequest := clientset.CoreV1().Pods(namespace).GetLogs(podName, logOptions)
		stream, err := logRequest.Stream(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer stream.Close()

		flusher, canFlush := c.Writer.(http.Flusher)
		if !canFlush {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "server tidak mendukung streaming"})
			return
		}

		c.Writer.Header().Set("Content-Type", "text/event-stream")
		c.Writer.Header().Set("Cache-Control", "no-cache")
		c.Writer.Header().Set("Connection", "keep-alive")
		c.Writer.Header().Set("X-Accel-Buffering", "no")
		c.Writer.WriteHeader(http.StatusOK)

		scanner := bufio.NewScanner(stream)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			fmt.Fprintf(c.Writer, "data: %s\n\n", line)
			flusher.Flush()

			select {
			case <-c.Request.Context().Done():
				return
			default:
			}
		}
	})

	// Endpoint Deployments: sumber "jumlah replica" untuk Fitur 5 (Deployment & Pod Lifecycle).
	// Endpoint Alerts: sumber data untuk Fitur 10 (Alert Notifications).
	// Alert dihitung terus-menerus oleh startAlertLoop() di background, endpoint
	// ini cuma membaca hasil terakhirnya.
	r.GET("/api/v1/alerts", func(c *gin.Context) {
		alertsState.RLock()
		items := alertsState.items
		alertsState.RUnlock()
		telegramConfigured := telegramBotToken() != "" && telegramChatID() != ""
		c.JSON(http.StatusOK, gin.H{
			"data":               items,
			"webhookConfigured":  alertWebhookURL() != "" || telegramConfigured,
			"telegramConfigured": telegramConfigured,
		})
	})

	r.GET("/api/v1/deployments", func(c *gin.Context) {
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		namespace := c.Query("namespace")
		if namespace == "all" || namespace == "All" {
			namespace = ""
		}

		deployments, err := clientset.AppsV1().Deployments(namespace).List(requestContext, metav1.ListOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		deployList := make([]map[string]interface{}, 0, len(deployments.Items))
		for _, d := range deployments.Items {
			desired := int32(1)
			if d.Spec.Replicas != nil {
				desired = *d.Spec.Replicas
			}

			image := ""
			if len(d.Spec.Template.Spec.Containers) > 0 {
				image = d.Spec.Template.Spec.Containers[0].Image
			}

			deployList = append(deployList, map[string]interface{}{
				"name":              d.Name,
				"namespace":         d.Namespace,
				"desiredReplicas":   desired,
				"readyReplicas":     d.Status.ReadyReplicas,
				"availableReplicas": d.Status.AvailableReplicas,
				"updatedReplicas":   d.Status.UpdatedReplicas,
				"image":             image,
				"createdAt":         d.CreationTimestamp.Time,
			})
		}

		c.JSON(http.StatusOK, gin.H{"data": deployList})
	})

	// Endpoint Live Container Metrics: sumber data untuk Fitur 6.
	// Query langsung ke /metrics/resource tiap kubelet (bukan lewat metrics.k8s.io,
	// yang tidak pernah bisa diakses karena Service metrics-server tak pernah Ready)
	// pakai token ServiceAccount "metrics-server" yang sudah ada RBAC-nya.
	r.GET("/api/v1/pods/metrics", func(c *gin.Context) {
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		namespaceFilter := c.Query("namespace")
		if namespaceFilter == "all" || namespaceFilter == "All" {
			namespaceFilter = ""
		}

		token, tokenErr := kubeletToken(requestContext, clientset)
		if tokenErr != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": tokenErr.Error(), "metricsAvailable": false})
			return
		}

		nodes, nodesErr := clientset.CoreV1().Nodes().List(requestContext, metav1.ListOptions{})
		if nodesErr != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": nodesErr.Error(), "metricsAvailable": false})
			return
		}

		var allSamples []kubeletmetrics.ContainerSample
		metricsAvailable := false
		for _, node := range nodes.Items {
			nodeIP := ""
			for _, address := range node.Status.Addresses {
				if address.Type == "InternalIP" {
					nodeIP = address.Address
					break
				}
			}
			if nodeIP == "" {
				continue
			}

			samples, fetchErr := kubeletmetrics.Fetch(nodeIP, token, 3*time.Second)
			if fetchErr != nil {
				log.Printf("Gagal mengambil pod metrics dari kubelet %s (%s): %v", nodeIP, node.Name, fetchErr)
				continue
			}
			metricsAvailable = true
			allSamples = append(allSamples, samples...)
		}

		// Agregasi per pod (jumlah semua container di dalamnya), plus hitung delta
		// CPU per container terhadap sampel sebelumnya (counter kumulatif).
		type podUsage struct {
			cpuMilli    int64
			memoryBytes int64
		}
		usageByPod := map[string]podUsage{}

		containerCPUSampleCache.Lock()
		now := time.Now()
		for _, s := range allSamples {
			if namespaceFilter != "" && s.Namespace != namespaceFilter {
				continue
			}

			key := s.Namespace + "/" + s.Pod + "/" + s.Container
			prev, hasPrev := containerCPUSampleCache.samples[key]
			containerCPUSampleCache.samples[key] = containerCPUSample{timestamp: now, cpuSeconds: s.CPUSeconds}

			podKey := s.Namespace + "/" + s.Pod
			u := usageByPod[podKey]
			u.memoryBytes += int64(s.MemoryBytes)
			if hasPrev {
				elapsedSeconds := now.Sub(prev.timestamp).Seconds()
				if elapsedSeconds > 0 {
					cpuDelta := s.CPUSeconds - prev.cpuSeconds
					if cpuDelta < 0 {
						cpuDelta = 0
					}
					u.cpuMilli += int64((cpuDelta / elapsedSeconds) * 1000)
				}
			}
			usageByPod[podKey] = u
		}
		containerCPUSampleCache.Unlock()

		podList := make([]map[string]interface{}, 0, len(usageByPod))
		for podKey, u := range usageByPod {
			parts := strings.SplitN(podKey, "/", 2)
			podList = append(podList, map[string]interface{}{
				"namespace":   parts[0],
				"pod":         parts[1],
				"cpuMilli":    u.cpuMilli,
				"memoryBytes": u.memoryBytes,
			})
		}

		c.JSON(http.StatusOK, gin.H{"data": podList, "metricsAvailable": metricsAvailable})
	})

	// Endpoint Network Overview: sumber data untuk Fitur 7 (Service & Ingress Overview).
	// Status "Healthy"/"No Endpoints" dihitung dari Endpoints asli (bukan ditebak),
	// dan status TLS Ingress dari Spec.TLS asli.
	r.GET("/api/v1/network/overview", func(c *gin.Context) {
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		services, svcErr := clientset.CoreV1().Services("").List(requestContext, metav1.ListOptions{})
		if svcErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": svcErr.Error()})
			return
		}

		endpointsByKey := map[string]corev1.Endpoints{}
		if endpointsList, epErr := clientset.CoreV1().Endpoints("").List(requestContext, metav1.ListOptions{}); epErr != nil {
			log.Printf("Gagal mengambil Endpoints: %v", epErr)
		} else {
			for _, ep := range endpointsList.Items {
				endpointsByKey[ep.Namespace+"/"+ep.Name] = ep
			}
		}

		svcData := make([]map[string]interface{}, 0, len(services.Items))
		for _, svc := range services.Items {
			var portStrs []string
			for _, p := range svc.Spec.Ports {
				if svc.Spec.Type == corev1.ServiceTypeNodePort && p.NodePort != 0 {
					portStrs = append(portStrs, fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, p.Protocol))
				} else {
					portStrs = append(portStrs, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
				}
			}

			readyCount, totalCount := 0, 0
			targetPod := ""
			if ep, ok := endpointsByKey[svc.Namespace+"/"+svc.Name]; ok {
				for _, subset := range ep.Subsets {
					readyCount += len(subset.Addresses)
					totalCount += len(subset.Addresses) + len(subset.NotReadyAddresses)
					if targetPod == "" && len(subset.Addresses) > 0 && subset.Addresses[0].TargetRef != nil {
						targetPod = subset.Addresses[0].TargetRef.Name
					}
				}
			}

			status := "No Endpoints"
			if readyCount > 0 {
				status = "Healthy"
			}

			clusterIP := svc.Spec.ClusterIP
			if clusterIP == "" {
				clusterIP = "None"
			}

			svcData = append(svcData, map[string]interface{}{
				"name":           svc.Name,
				"namespace":      svc.Namespace,
				"type":           string(svc.Spec.Type),
				"clusterIP":      clusterIP,
				"ports":          strings.Join(portStrs, ", "),
				"targetPod":      targetPod,
				"endpointsReady": readyCount,
				"endpointsTotal": totalCount,
				"status":         status,
			})
		}

		var ingData []map[string]interface{}
		ingresses, ingErr := clientset.NetworkingV1().Ingresses("").List(requestContext, metav1.ListOptions{})
		if ingErr != nil {
			log.Printf("Gagal mengambil Ingress: %v", ingErr)
		} else {
			tlsHostSet := map[string]bool{}
			for _, ing := range ingresses.Items {
				for _, tls := range ing.Spec.TLS {
					for _, h := range tls.Hosts {
						tlsHostSet[h] = true
					}
				}
			}

			for _, ing := range ingresses.Items {
				for _, rule := range ing.Spec.Rules {
					if rule.HTTP == nil {
						continue
					}
					for _, path := range rule.HTTP.Paths {
						backendService := ""
						if path.Backend.Service != nil {
							portDesc := ""
							if path.Backend.Service.Port.Number != 0 {
								portDesc = fmt.Sprintf(":%d", path.Backend.Service.Port.Number)
							} else if path.Backend.Service.Port.Name != "" {
								portDesc = ":" + path.Backend.Service.Port.Name
							}
							backendService = path.Backend.Service.Name + portDesc
						}

						pathStr := path.Path
						if pathStr == "" {
							pathStr = "/"
						}

						ingData = append(ingData, map[string]interface{}{
							"namespace": ing.Namespace,
							"host":      rule.Host,
							"path":      pathStr,
							"service":   backendService,
							"tls":       tlsHostSet[rule.Host],
						})
					}
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{"services": svcData, "ingress": ingData})
	})

	// Endpoint Traffic: sumber data untuk Fitur 8 (Traffic In/Out & Health Check).
	// Scrape langsung metrics Prometheus bawaan ingress-nginx-controller (pod IP,
	// bukan lewat metrics.k8s.io). BELUM DIVERIFIKASI apakah pod IP terjangkau dari
	// tempat backend ini berjalan — kalau tidak, endpoint ini akan selalu
	// mengembalikan metricsAvailable:false, bukan berarti kodenya salah.
	r.GET("/api/v1/network/traffic", func(c *gin.Context) {
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		svc, svcErr := clientset.CoreV1().Services(ingressControllerNamespace()).Get(requestContext, ingressMetricsServiceName(), metav1.GetOptions{})
		if svcErr != nil {
			c.JSON(http.StatusOK, gin.H{"metricsAvailable": false, "error": fmt.Sprintf("Service %s/%s belum ada — buat dulu: kubectl expose deployment ingress-nginx-controller -n %s --type=NodePort --port=10254 --target-port=10254 --name=%s (detail: %v)", ingressControllerNamespace(), ingressMetricsServiceName(), ingressControllerNamespace(), ingressMetricsServiceName(), svcErr)})
			return
		}

		nodePort := int32(0)
		for _, p := range svc.Spec.Ports {
			if p.NodePort != 0 {
				nodePort = p.NodePort
				break
			}
		}
		if nodePort == 0 {
			c.JSON(http.StatusOK, gin.H{"metricsAvailable": false, "error": fmt.Sprintf("Service %s/%s ditemukan tapi bukan NodePort (tidak ada nodePort di spec.ports)", ingressControllerNamespace(), ingressMetricsServiceName())})
			return
		}

		nodes, nodesErr := clientset.CoreV1().Nodes().List(requestContext, metav1.ListOptions{})
		if nodesErr != nil {
			c.JSON(http.StatusOK, gin.H{"metricsAvailable": false, "error": nodesErr.Error()})
			return
		}
		var nodeIP string
		for _, node := range nodes.Items {
			for _, address := range node.Status.Addresses {
				if address.Type == corev1.NodeInternalIP {
					nodeIP = address.Address
					break
				}
			}
			if nodeIP != "" {
				break
			}
		}
		if nodeIP == "" {
			c.JSON(http.StatusOK, gin.H{"metricsAvailable": false, "error": "tidak ada node dengan InternalIP"})
			return
		}

		snap, fetchErr := ingressmetrics.Fetch(nodeIP, int(nodePort), 3*time.Second)
		if fetchErr != nil {
			log.Printf("Gagal mengambil metrics ingress-nginx via %s:%d: %v", nodeIP, nodePort, fetchErr)
			c.JSON(http.StatusOK, gin.H{"metricsAvailable": false, "error": fetchErr.Error()})
			return
		}

		nginxSampleCache.Lock()
		prev := nginxSampleCache.sample
		now := time.Now()
		nginxSampleCache.sample = &nginxSample{
			timestamp:          now,
			totalRequests:      snap.TotalRequests,
			errorRequests:      snap.ErrorRequests,
			durationSumSeconds: snap.DurationSumSeconds,
			durationCount:      snap.DurationCount,
		}
		nginxSampleCache.Unlock()

		hasRate := false
		requestRatePerMin := 0.0
		errorRatePercent := 0.0
		avgLatencyMs := 0.0
		if prev != nil {
			elapsedMin := now.Sub(prev.timestamp).Minutes()
			if elapsedMin > 0 {
				reqDelta := snap.TotalRequests - prev.totalRequests
				errDelta := snap.ErrorRequests - prev.errorRequests
				if reqDelta < 0 {
					reqDelta = 0 // counter reset (mis. controller restart)
				}
				if errDelta < 0 {
					errDelta = 0
				}
				requestRatePerMin = reqDelta / elapsedMin
				if reqDelta > 0 {
					errorRatePercent = errDelta / reqDelta * 100
				}

				durSumDelta := snap.DurationSumSeconds - prev.durationSumSeconds
				durCountDelta := snap.DurationCount - prev.durationCount
				if durCountDelta > 0 {
					avgLatencyMs = (durSumDelta / durCountDelta) * 1000
				}
				hasRate = true
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"metricsAvailable":  true,
			"hasRate":           hasRate,
			"requestRatePerMin": requestRatePerMin,
			"errorRatePercent":  errorRatePercent,
			"avgLatencyMs":      avgLatencyMs,
			"totalRequests":     snap.TotalRequests,
		})
	})

	// Endpoint Namespaces: sumber data untuk Fitur 3 (Project/Namespace Grouping).
	// "project baru = namespace baru" — list/create/delete di sini langsung
	// memanggil Kubernetes API, bukan state lokal di frontend.
	r.GET("/api/v1/namespaces", func(c *gin.Context) {
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		nsList, err := clientset.CoreV1().Namespaces().List(requestContext, metav1.ListOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		podCountByNamespace := map[string]int{}
		if podsList, podsErr := clientset.CoreV1().Pods("").List(requestContext, metav1.ListOptions{}); podsErr == nil {
			for _, pod := range podsList.Items {
				podCountByNamespace[pod.Namespace]++
			}
		}

		nsData := make([]map[string]interface{}, 0, len(nsList.Items))
		for _, ns := range nsList.Items {
			nsData = append(nsData, map[string]interface{}{
				"name":        ns.Name,
				"status":      string(ns.Status.Phase),
				"description": ns.Annotations["dashboard.description"],
				"podCount":    podCountByNamespace[ns.Name],
				"createdAt":   ns.CreationTimestamp.Time,
			})
		}

		c.JSON(http.StatusOK, gin.H{"data": nsData})
	})

	r.POST("/api/v1/namespaces", func(c *gin.Context) {
		var body struct {
			Name          string `json:"name"`
			Description   string `json:"description"`
			CPURequest    string `json:"cpuRequest"`
			CPULimit      string `json:"cpuLimit"`
			MemoryRequest string `json:"memoryRequest"`
			MemoryLimit   string `json:"memoryLimit"`
			PodsQuota     string `json:"podsQuota"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nama namespace wajib diisi"})
			return
		}
		if body.CPURequest == "" {
			body.CPURequest = "2.0"
		}
		if body.CPULimit == "" {
			body.CPULimit = "4.0"
		}
		if body.MemoryRequest == "" {
			body.MemoryRequest = "4.0"
		}
		if body.MemoryLimit == "" {
			body.MemoryLimit = "8.0"
		}
		if body.PodsQuota == "" {
			body.PodsQuota = "10"
		}

		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		ns := &corev1.Namespace{
			ObjectMeta: metav1.ObjectMeta{
				Name: body.Name,
				Annotations: map[string]string{
					"dashboard.description": body.Description,
				},
			},
		}

		created, err := clientset.CoreV1().Namespaces().Create(requestContext, ns, metav1.CreateOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Pola "template-tenant": setiap namespace baru langsung dibekali
		// ResourceQuota (batas agregat CPU/RAM/pods sesuai pilihan form) + LimitRange
		// (default request/limit per container). LimitRange penting karena begitu
		// ResourceQuota dengan requests.cpu/requests.memory aktif, semua pod baru
		// WAJIB mencantumkan resource request eksplisit atau ditolak API server.
		// Penamaan mengikuti template yang sudah dipakai manual di namespace
		// spending-mgmt (quota-<ns>, limit-<ns>, dst); semua nilai hard limit-nya
		// sekarang datang langsung dari pilihan dropdown form, bukan rasio tetap.
		quotaApplied := true
		cpuRequestQty, cpuReqErr := resource.ParseQuantity(body.CPURequest)
		cpuLimitQty, cpuLimErr := resource.ParseQuantity(body.CPULimit)
		memRequestQty, memReqErr := resource.ParseQuantity(body.MemoryRequest + "Gi")
		memLimitQty, memLimErr := resource.ParseQuantity(body.MemoryLimit + "Gi")
		podsQty, podsErr := resource.ParseQuantity(body.PodsQuota)
		if cpuReqErr != nil || cpuLimErr != nil || memReqErr != nil || memLimErr != nil || podsErr != nil {
			log.Printf("Nilai quota tidak valid untuk namespace %s: cpuReq=%v cpuLim=%v memReq=%v memLim=%v pods=%v", body.Name, cpuReqErr, cpuLimErr, memReqErr, memLimErr, podsErr)
			quotaApplied = false
		} else {
			rq := &corev1.ResourceQuota{
				ObjectMeta: metav1.ObjectMeta{Name: "quota-" + body.Name},
				Spec: corev1.ResourceQuotaSpec{
					Hard: corev1.ResourceList{
						corev1.ResourceRequestsCPU:    cpuRequestQty,
						corev1.ResourceLimitsCPU:      cpuLimitQty,
						corev1.ResourceRequestsMemory: memRequestQty,
						corev1.ResourceLimitsMemory:   memLimitQty,
						corev1.ResourcePods:           podsQty,
					},
				},
			}
			if _, rqErr := clientset.CoreV1().ResourceQuotas(body.Name).Create(requestContext, rq, metav1.CreateOptions{}); rqErr != nil {
				log.Printf("Gagal membuat ResourceQuota default untuk namespace %s: %v", body.Name, rqErr)
				quotaApplied = false
			}

			lr := &corev1.LimitRange{
				ObjectMeta: metav1.ObjectMeta{Name: "limit-" + body.Name},
				Spec: corev1.LimitRangeSpec{
					Limits: []corev1.LimitRangeItem{
						{
							Type: corev1.LimitTypeContainer,
							Default: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse("250m"),
								corev1.ResourceMemory: resource.MustParse("256Mi"),
							},
							DefaultRequest: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse("100m"),
								corev1.ResourceMemory: resource.MustParse("128Mi"),
							},
						},
					},
				},
			}
			if _, lrErr := clientset.CoreV1().LimitRanges(body.Name).Create(requestContext, lr, metav1.CreateOptions{}); lrErr != nil {
				log.Printf("Gagal membuat LimitRange default untuk namespace %s: %v", body.Name, lrErr)
				quotaApplied = false
			}
		}

		// Isolasi jaringan: pod di namespace tenant hanya bisa diakses dari pod lain
		// di namespace yang sama atau dari ingress controller, tidak dari namespace
		// tenant lain. Mengikuti pola isolate-<namespace> yang sudah dipakai manual
		// di cluster ini. Hanya membatasi Ingress — egress tetap bebas (DNS, API
		// eksternal, dll tetap jalan seperti biasa).
		networkPolicyApplied := true
		netpol := &networkingv1.NetworkPolicy{
			ObjectMeta: metav1.ObjectMeta{Name: "isolate-" + body.Name},
			Spec: networkingv1.NetworkPolicySpec{
				PodSelector: metav1.LabelSelector{},
				PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress},
				Ingress: []networkingv1.NetworkPolicyIngressRule{
					{
						From: []networkingv1.NetworkPolicyPeer{
							{PodSelector: &metav1.LabelSelector{}},
							{NamespaceSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"kubernetes.io/metadata.name": ingressControllerNamespace()},
							}},
						},
					},
				},
			},
		}
		if _, npErr := clientset.NetworkingV1().NetworkPolicies(body.Name).Create(requestContext, netpol, metav1.CreateOptions{}); npErr != nil {
			log.Printf("Gagal membuat NetworkPolicy isolasi untuk namespace %s: %v", body.Name, npErr)
			networkPolicyApplied = false
		}

		// Isolasi RBAC: mengikuti pola yang sudah dipakai manual di namespace
		// spending-mgmt — Role kustom "<namespace>-admin-role" (bukan ClusterRole
		// bawaan), ServiceAccount "dev-<namespace>", diikat lewat RoleBinding
		// "bind-<namespace>-admin". RoleBinding membuat hak aksesnya berlaku HANYA
		// di namespace ini, tidak bisa menyentuh namespace lain. Rules di bawah ini
		// TEBAKAN awal (izin umum level "edit" untuk resource namespaced biasa) —
		// perlu disesuaikan begitu isi Role asli (spending-mgmt-admin-role) dicek.
		// Belum tersambung ke sistem login dashboard (masih dummy auth), ini
		// fondasi identitas per-tenant untuk nanti.
		rbacApplied := true
		roleName := body.Name + "-admin-role"
		role := &rbacv1.Role{
			ObjectMeta: metav1.ObjectMeta{Name: roleName},
			Rules: []rbacv1.PolicyRule{
				{
					APIGroups: []string{""},
					Resources: []string{"pods", "pods/log", "pods/exec", "services", "configmaps", "secrets", "persistentvolumeclaims", "events"},
					Verbs:     []string{"get", "list", "watch", "create", "update", "patch", "delete"},
				},
				{
					APIGroups: []string{"apps"},
					Resources: []string{"deployments", "replicasets", "statefulsets", "daemonsets"},
					Verbs:     []string{"get", "list", "watch", "create", "update", "patch", "delete"},
				},
				{
					APIGroups: []string{"batch"},
					Resources: []string{"jobs", "cronjobs"},
					Verbs:     []string{"get", "list", "watch", "create", "update", "patch", "delete"},
				},
			},
		}
		if _, roleErr := clientset.RbacV1().Roles(body.Name).Create(requestContext, role, metav1.CreateOptions{}); roleErr != nil {
			log.Printf("Gagal membuat Role %s untuk namespace %s: %v", roleName, body.Name, roleErr)
			rbacApplied = false
		}

		saName := "dev-" + body.Name
		sa := &corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: saName}}
		if _, saErr := clientset.CoreV1().ServiceAccounts(body.Name).Create(requestContext, sa, metav1.CreateOptions{}); saErr != nil {
			log.Printf("Gagal membuat ServiceAccount %s untuk namespace %s: %v", saName, body.Name, saErr)
			rbacApplied = false
		} else {
			rb := &rbacv1.RoleBinding{
				ObjectMeta: metav1.ObjectMeta{Name: "bind-" + body.Name + "-admin"},
				RoleRef: rbacv1.RoleRef{
					APIGroup: "rbac.authorization.k8s.io",
					Kind:     "Role",
					Name:     roleName,
				},
				Subjects: []rbacv1.Subject{
					{Kind: "ServiceAccount", Name: saName, Namespace: body.Name},
				},
			}
			if _, rbErr := clientset.RbacV1().RoleBindings(body.Name).Create(requestContext, rb, metav1.CreateOptions{}); rbErr != nil {
				log.Printf("Gagal membuat RoleBinding bind-%s-admin untuk namespace %s: %v", body.Name, body.Name, rbErr)
				rbacApplied = false
			}
		}

		c.JSON(http.StatusCreated, gin.H{
			"name":                 created.Name,
			"status":               string(created.Status.Phase),
			"quotaApplied":         quotaApplied,
			"networkPolicyApplied": networkPolicyApplied,
			"rbacApplied":          rbacApplied,
		})
	})

	// Endpoint Quota: sumber data untuk Fitur 4 (Quota & Limit Monitoring).
	// Pakai ResourceQuota asli kalau namespace punya satu (untuk batas/"hard"),
	// dan selalu hitung actual usage real dari request container pod + PVC di
	// namespace itu (bukan angka rekaan), supaya tetap informatif meski
	// namespace belum diberi ResourceQuota sama sekali.
	r.GET("/api/v1/namespaces/:name/quota", func(c *gin.Context) {
		name := c.Param("name")
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		rqList, rqErr := clientset.CoreV1().ResourceQuotas(name).List(requestContext, metav1.ListOptions{})
		if rqErr != nil {
			log.Printf("Gagal mengambil ResourceQuota di namespace %s: %v", name, rqErr)
		}
		hasResourceQuota := rqErr == nil && len(rqList.Items) > 0

		hard := map[string]int64{}
		hasHard := map[string]bool{}
		if hasResourceQuota {
			for _, rq := range rqList.Items {
				for _, spec := range quotaResourceSpecs {
					if hasHard[spec.label] {
						continue
					}
					var v int64
					var ok bool
					if spec.useMilli {
						v, ok = firstMilli(rq.Status.Hard, spec.hardKeys...)
					} else {
						v, ok = firstValue(rq.Status.Hard, spec.hardKeys...)
					}
					if ok {
						hard[spec.label] = v
						hasHard[spec.label] = true
					}
				}
			}
		}

		var actualPodCount int
		var actualCPURequestMilli, actualMemoryRequestBytes int64
		podsList, podsErr := clientset.CoreV1().Pods(name).List(requestContext, metav1.ListOptions{})
		if podsErr != nil {
			log.Printf("Gagal mengambil Pods di namespace %s: %v", name, podsErr)
		} else {
			actualPodCount = len(podsList.Items)
			for _, pod := range podsList.Items {
				for _, container := range pod.Spec.Containers {
					if q, ok := container.Resources.Requests[corev1.ResourceCPU]; ok {
						actualCPURequestMilli += q.MilliValue()
					}
					if q, ok := container.Resources.Requests[corev1.ResourceMemory]; ok {
						actualMemoryRequestBytes += q.Value()
					}
				}
			}
		}

		var actualStorageBytes int64
		pvcList, pvcErr := clientset.CoreV1().PersistentVolumeClaims(name).List(requestContext, metav1.ListOptions{})
		if pvcErr != nil {
			log.Printf("Gagal mengambil PersistentVolumeClaims di namespace %s: %v", name, pvcErr)
		} else {
			for _, pvc := range pvcList.Items {
				if q, ok := pvc.Spec.Resources.Requests[corev1.ResourceStorage]; ok {
					actualStorageBytes += q.Value()
				}
			}
		}

		percent := func(used, hardVal int64, has bool) float64 {
			if !has || hardVal <= 0 {
				return 0
			}
			return float64(used) / float64(hardVal) * 100
		}

		c.JSON(http.StatusOK, gin.H{
			"namespace":        name,
			"hasResourceQuota": hasResourceQuota,
			"cpu": gin.H{
				"usedMilli": actualCPURequestMilli,
				"hardMilli": hard["cpu"],
				"hasHard":   hasHard["cpu"],
				"percent":   percent(actualCPURequestMilli, hard["cpu"], hasHard["cpu"]),
			},
			"memory": gin.H{
				"usedBytes": actualMemoryRequestBytes,
				"hardBytes": hard["memory"],
				"hasHard":   hasHard["memory"],
				"percent":   percent(actualMemoryRequestBytes, hard["memory"], hasHard["memory"]),
			},
			"storage": gin.H{
				"usedBytes": actualStorageBytes,
				"hardBytes": hard["storage"],
				"hasHard":   hasHard["storage"],
				"percent":   percent(actualStorageBytes, hard["storage"], hasHard["storage"]),
			},
			"pods": gin.H{
				"used":    actualPodCount,
				"hard":    hard["pods"],
				"hasHard": hasHard["pods"],
				"percent": percent(int64(actualPodCount), hard["pods"], hasHard["pods"]),
			},
		})
	})

	r.DELETE("/api/v1/namespaces/:name", func(c *gin.Context) {
		name := c.Param("name")

		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		if err := clientset.CoreV1().Namespaces().Delete(requestContext, name, metav1.DeleteOptions{}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "namespace deleted", "name": name})
	})

	// Endpoint Events: sumber data untuk Fitur 2 (Node Status & Failover Visibility)
	// bagian "workload otomatis berpindah (evicted/rescheduled) ke node sehat" —
	// diambil dari Event asli Kubernetes (NodeNotReady, TaintManagerEviction,
	// Killing, Scheduled, dll), bukan disimulasikan.
	r.GET("/api/v1/events", func(c *gin.Context) {
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		eventsList, err := clientset.CoreV1().Events("").List(requestContext, metav1.ListOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		relevantReasons := map[string]bool{
			"NodeNotReady":         true,
			"NodeReady":            true,
			"NodeNotSchedulable":   true,
			"NodeSchedulable":      true,
			"Killing":              true,
			"Preempted":            true,
			"Evicted":              true,
			"TaintManagerEviction": true,
			"FailedScheduling":     true,
			"Scheduled":            true,
		}

		type simpleEvent struct {
			eventType string
			reason    string
			message   string
			object    string
			nodeName  string
			timestamp time.Time
		}

		var filtered []simpleEvent
		for _, ev := range eventsList.Items {
			if !relevantReasons[ev.Reason] {
				continue
			}

			ts := ev.LastTimestamp.Time
			if ts.IsZero() {
				ts = ev.EventTime.Time
			}

			nodeName := ""
			if ev.InvolvedObject.Kind == "Node" {
				nodeName = ev.InvolvedObject.Name
			} else if ev.Source.Host != "" {
				nodeName = ev.Source.Host
			}

			filtered = append(filtered, simpleEvent{
				eventType: ev.Type,
				reason:    ev.Reason,
				message:   ev.Message,
				object:    fmt.Sprintf("%s/%s", ev.InvolvedObject.Kind, ev.InvolvedObject.Name),
				nodeName:  nodeName,
				timestamp: ts,
			})
		}

		sort.Slice(filtered, func(i, j int) bool {
			return filtered[i].timestamp.After(filtered[j].timestamp)
		})

		if len(filtered) > 50 {
			filtered = filtered[:50]
		}

		eventList := make([]map[string]interface{}, 0, len(filtered))
		for _, ev := range filtered {
			eventList = append(eventList, map[string]interface{}{
				"type":    ev.eventType,
				"reason":  ev.reason,
				"message": ev.message,
				"object":  ev.object,
				"node":    ev.nodeName,
				"time":    ev.timestamp,
			})
		}

		c.JSON(http.StatusOK, gin.H{"data": eventList})
	})

	// 4. Jalankan Server
	// Endpoint untuk Auth Login (Dummy sementara agar frontend bisa masuk)
	r.POST("/auth/login", func(c *gin.Context) {
		// Nantinya ini bisa disambungkan ke database atau LDAP
		c.JSON(http.StatusOK, gin.H{
			"message": "Login successful",
			"token":   "",
			"user": gin.H{
				"username": "superuser",
				"role":     "admin",
			},
		})
	})

	// Endpoint untuk Mengambil Data Nodes (Cluster Overview)
	r.GET("/api/v1/nodes", func(c *gin.Context) {
		requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		nodes, err := clientset.CoreV1().Nodes().List(requestContext, metav1.ListOptions{})
		if err != nil {
			clusterOverviewCache.RLock()
			cachedOverview := clusterOverviewCache.data
			clusterOverviewCache.RUnlock()
			if cachedOverview != nil {
				log.Printf("Kubernetes API tidak tersedia, mengembalikan overview terakhir: %v", err)
				c.JSON(http.StatusOK, cachedOverview)
				return
			}

			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}

		var totalStorageBytes int64
		var allocatedStorageBytes int64
		persistentVolumes, err := clientset.CoreV1().PersistentVolumes().List(requestContext, metav1.ListOptions{})
		if err != nil {
			log.Printf("Gagal mengambil PersistentVolumes: %v", err)
		} else {
			for _, volume := range persistentVolumes.Items {
				capacity, exists := volume.Spec.Capacity["storage"]
				if !exists {
					continue
				}

				capacityBytes := capacity.Value()
				totalStorageBytes += capacityBytes
				if volume.Status.Phase == "Bound" {
					allocatedStorageBytes += capacityBytes
				}
			}
		}

		// Ambil usage CPU/RAM real per node langsung dari node_exporter (/proc di host),
		// bukan dari metrics.k8s.io: kubelet/cAdvisor di cluster ini terbukti tidak
		// mengisi stats cgroup per-container (lihat investigasi metrics-server),
		// sementara node_exporter membaca /proc/stat & /proc/meminfo langsung dari
		// kernel host sehingga tidak terpengaruh masalah tersebut.
		metricsAvailable := false
		port := nodeExporterPort()

		var nodeList []map[string]interface{}
		var totalCpuCapacityMilli int64
		var totalMemoryCapacityBytes int64
		var totalCpuUsageMilli int64
		var totalMemoryUsageBytes int64
		var totalEphemeralStorageBytes int64
		var totalDiskUsedBytes int64
		var totalPodsAllocatable int64
		for _, node := range nodes.Items {
			nodeIP := "N/A"
			nodeRole := "Worker"
			nodeStorageBytes := int64(0)
			if storageQuantity, exists := node.Status.Capacity["ephemeral-storage"]; exists {
				nodeStorageBytes = storageQuantity.Value()
			}
			if _, isControlPlane := node.Labels["node-role.kubernetes.io/control-plane"]; isControlPlane {
				nodeRole = "Master"
			} else if _, isMaster := node.Labels["node-role.kubernetes.io/master"]; isMaster {
				nodeRole = "Master"
			}

			for _, address := range node.Status.Addresses {
				if address.Type == "InternalIP" {
					nodeIP = address.Address
					break
				}
			}

			nodeReady := "Unknown"
			for _, condition := range node.Status.Conditions {
				if condition.Type == "Ready" {
					if condition.Status == "True" {
						nodeReady = "Ready"
					} else {
						nodeReady = "NotReady"
					}
					break
				}
			}

			cpuCapacityMilli := node.Status.Capacity.Cpu().MilliValue()
			memoryCapacityBytes := node.Status.Capacity.Memory().Value()
			totalCpuCapacityMilli += cpuCapacityMilli
			totalMemoryCapacityBytes += memoryCapacityBytes
			totalEphemeralStorageBytes += nodeStorageBytes
			totalPodsAllocatable += node.Status.Allocatable.Pods().Value()

			nodeEntry := map[string]interface{}{
				"name":         node.Name,
				"role":         nodeRole,
				"status":       nodeReady,
				"cpu":          node.Status.Capacity.Cpu().String(),
				"memory":       node.Status.Capacity.Memory().String(),
				"storageBytes": nodeStorageBytes,
				"ip":           nodeIP,
			}

			if nodeIP != "N/A" {
				snap, fetchErr := nodeexporter.Fetch(nodeIP, port, 3*time.Second)
				if fetchErr != nil {
					log.Printf("node-exporter tidak bisa diakses di %s:%d (%s): %v", nodeIP, port, node.Name, fetchErr)
				} else {
					metricsAvailable = true

					memoryUsageBytes := int64(snap.MemTotalBytes - snap.MemAvailableBytes)
					nodeEntry["memoryUsageBytes"] = memoryUsageBytes
					totalMemoryUsageBytes += memoryUsageBytes

					if snap.FilesystemSizeBytes > 0 {
						diskUsageBytes := int64(snap.FilesystemSizeBytes - snap.FilesystemAvailBytes)
						nodeEntry["diskUsageBytes"] = diskUsageBytes
						totalDiskUsedBytes += diskUsageBytes
					}

					cpuSampleCache.Lock()
					prev, hasPrev := cpuSampleCache.samples[node.Name]
					cpuSampleCache.samples[node.Name] = cpuSample{
						timestamp:    time.Now(),
						totalSeconds: snap.CPUTotalSeconds,
						idleSeconds:  snap.CPUIdleSeconds,
					}
					cpuSampleCache.Unlock()

					if hasPrev {
						totalDelta := snap.CPUTotalSeconds - prev.totalSeconds
						idleDelta := snap.CPUIdleSeconds - prev.idleSeconds
						if totalDelta > 0 {
							usedFraction := 1 - (idleDelta / totalDelta)
							if usedFraction < 0 {
								usedFraction = 0
							}
							cpuUsageMilli := int64(usedFraction * float64(cpuCapacityMilli))
							nodeEntry["cpuUsageMilli"] = cpuUsageMilli
							totalCpuUsageMilli += cpuUsageMilli
						}
					}
				}
			}

			nodeList = append(nodeList, nodeEntry)
		}

		// Pods Capacity: hitung dari pod sungguhan lintas semua namespace,
		// bukan estimasi jumlahNode*konstanta.
		var totalPods, runningPods, crashPods int
		allPods, podsErr := clientset.CoreV1().Pods("").List(requestContext, metav1.ListOptions{})
		if podsErr != nil {
			log.Printf("Gagal mengambil daftar Pods: %v", podsErr)
		} else {
			totalPods = len(allPods.Items)
			for _, pod := range allPods.Items {
				if pod.Status.Phase == corev1.PodRunning {
					runningPods++
				}
				for _, cs := range pod.Status.ContainerStatuses {
					if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
						crashPods++
						break
					}
				}
			}
		}

		storagePercent := 0.0
		if totalStorageBytes > 0 {
			storagePercent = float64(allocatedStorageBytes) / float64(totalStorageBytes) * 100
		}

		cpuPercent := 0.0
		memoryPercent := 0.0
		diskPercent := 0.0
		if metricsAvailable && totalCpuCapacityMilli > 0 {
			cpuPercent = float64(totalCpuUsageMilli) / float64(totalCpuCapacityMilli) * 100
		}
		if metricsAvailable && totalMemoryCapacityBytes > 0 {
			memoryPercent = float64(totalMemoryUsageBytes) / float64(totalMemoryCapacityBytes) * 100
		}
		if metricsAvailable && totalEphemeralStorageBytes > 0 {
			diskPercent = float64(totalDiskUsedBytes) / float64(totalEphemeralStorageBytes) * 100
		}

		overview := gin.H{
			"data":             nodeList,
			"metricsAvailable": metricsAvailable,
			"cpu": gin.H{
				"usageMilli":    totalCpuUsageMilli,
				"capacityMilli": totalCpuCapacityMilli,
				"percent":       cpuPercent,
			},
			"memory": gin.H{
				"usageBytes":    totalMemoryUsageBytes,
				"capacityBytes": totalMemoryCapacityBytes,
				"percent":       memoryPercent,
			},
			// disk: kapasitas total diambil dari ephemeral-storage yang dilaporkan
			// Kubernetes per node; usage diambil dari node-exporter (root filesystem host),
			// karena kubelet tidak melaporkan usage ephemeral-storage lewat jalur ini.
			"disk": gin.H{
				"usageBytes":    totalDiskUsedBytes,
				"capacityBytes": totalEphemeralStorageBytes,
				"percent":       diskPercent,
			},
			// storage: alokasi PersistentVolume (PV), terpisah dari kapasitas disk node di atas.
			"storage": gin.H{
				"usedBytes":  allocatedStorageBytes,
				"totalBytes": totalStorageBytes,
				"percent":    storagePercent,
			},
			"pods": gin.H{
				"total":    totalPods,
				"running":  runningPods,
				"crash":    crashPods,
				"capacity": totalPodsAllocatable,
			},
		}

		clusterOverviewCache.Lock()
		clusterOverviewCache.data = overview
		clusterOverviewCache.Unlock()
		c.JSON(http.StatusOK, overview)
	})

	log.Println("Backend API berjalan di http://localhost:8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Server gagal berjalan: %v", err)
	}
}
