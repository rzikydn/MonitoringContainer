package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"k8s-dashboard-backend/pkg/k8s"
	"k8s-dashboard-backend/pkg/nodeexporter"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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

func nodeExporterPort() int {
	if v := os.Getenv("NODE_EXPORTER_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			return port
		}
	}
	return 9100
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

			podList = append(podList, map[string]interface{}{
				"name":      pod.Name,
				"namespace": pod.Namespace,
				"node":      pod.Spec.NodeName,
				"status":    status,
				"restarts":  restarts,
				"startTime": pod.CreationTimestamp.Time,
			})
		}

		c.JSON(http.StatusOK, gin.H{"data": podList})
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
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nama namespace wajib diisi"})
			return
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

		c.JSON(http.StatusCreated, gin.H{"name": created.Name, "status": string(created.Status.Phase)})
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
