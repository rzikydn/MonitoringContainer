package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"k8s-dashboard-backend/pkg/kubeletmetrics"

	"github.com/gin-gonic/gin"
	authenticationv1 "k8s.io/api/authentication/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// containerCPUSample: sama seperti cpuSample (nodes.go) tapi per-container
// (key: "namespace/pod/container"), dipakai untuk hitung delta CPU usage
// per pod di Fitur 6 (Live Container Metrics).
type containerCPUSample struct {
	timestamp  time.Time
	cpuSeconds float64
}

// PodService: Fitur 3/5/6/9 — daftar pod, restart (delete), live log streaming
// (SSE), dan live CPU/RAM metrics per pod (lewat kubelet langsung, lihat
// kubeletmetrics package).
type PodService struct {
	clientset *kubernetes.Clientset

	tokenMu     sync.Mutex
	kubeletTok  string
	tokenExpiry time.Time

	cpuSampleMu sync.Mutex
	cpuSamples  map[string]containerCPUSample
}

func NewPodService(clientset *kubernetes.Clientset) *PodService {
	return &PodService{
		clientset:  clientset,
		cpuSamples: make(map[string]containerCPUSample),
	}
}

func (s *PodService) RegisterRoutes(r *gin.Engine) {
	r.GET("/api/workloads/pods", s.handleList)
	r.DELETE("/api/workloads/pods", s.handleDelete)
	r.GET("/api/workloads/logs", s.handleStreamLogs)
	r.GET("/api/v1/pods/metrics", s.handleGetMetrics)
}

// handleList: sumber data untuk Fitur 3 (Project/Namespace Grouping) & Fitur 5
// (Pod Lifecycle). Lintas semua namespace, atau satu namespace lewat ?namespace=.
func (s *PodService) handleList(c *gin.Context) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	namespace := c.Query("namespace")
	if namespace == "all" || namespace == "All" {
		namespace = ""
	}

	pods, err := s.clientset.CoreV1().Pods(namespace).List(requestContext, metav1.ListOptions{})
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
}

// handleDelete: restart pod = delete pod (K8s tidak punya API "restart" native).
// Kalau pod dikelola controller (Deployment/ReplicaSet/StatefulSet/DaemonSet),
// controller otomatis membuat penggantinya (= restart). Kalau pod berdiri
// sendiri, pod akan hilang permanen, bukan dibuat ulang.
func (s *PodService) handleDelete(c *gin.Context) {
	namespace := c.Query("namespace")
	name := c.Query("name")
	if namespace == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace dan name wajib diisi"})
		return
	}

	requestContext, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if err := s.clientset.CoreV1().Pods(namespace).Delete(requestContext, name, metav1.DeleteOptions{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "pod deleted", "name": name, "namespace": namespace})
}

// handleStreamLogs: Fitur 9 (Centralized Log Viewer). Streaming asli (SSE)
// langsung dari Kubernetes API (setara `kubectl logs -f`), bukan polling atau
// simulasi — supaya benar-benar "tanpa perlu SSH ke server".
func (s *PodService) handleStreamLogs(c *gin.Context) {
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

	logRequest := s.clientset.CoreV1().Pods(namespace).GetLogs(podName, logOptions)
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
}

// kubeletToken mengembalikan token ServiceAccount "metrics-server" (sudah ada di
// cluster dengan RBAC nodes/metrics) yang dipakai untuk autentikasi langsung ke
// kubelet tiap node. Dibuat lewat TokenRequest API dan di-cache di memory (field
// privat, bukan lagi variabel global) supaya tidak mint token baru tiap request.
func (s *PodService) kubeletToken(ctx context.Context) (string, error) {
	s.tokenMu.Lock()
	defer s.tokenMu.Unlock()

	if s.kubeletTok != "" && time.Now().Before(s.tokenExpiry) {
		return s.kubeletTok, nil
	}

	expirationSeconds := int64(3600)
	tr, err := s.clientset.CoreV1().ServiceAccounts("kube-system").CreateToken(ctx, "metrics-server", &authenticationv1.TokenRequest{
		Spec: authenticationv1.TokenRequestSpec{ExpirationSeconds: &expirationSeconds},
	}, metav1.CreateOptions{})
	if err != nil {
		return "", err
	}

	s.kubeletTok = tr.Status.Token
	s.tokenExpiry = tr.Status.ExpirationTimestamp.Time.Add(-5 * time.Minute)
	return s.kubeletTok, nil
}

// handleGetMetrics: Fitur 6 (Live Container Metrics). Query langsung ke
// /metrics/resource tiap kubelet (bukan lewat metrics.k8s.io, yang tidak
// pernah bisa diakses karena Service metrics-server tak pernah Ready) pakai
// token ServiceAccount "metrics-server" yang sudah ada RBAC-nya.
func (s *PodService) handleGetMetrics(c *gin.Context) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	namespaceFilter := c.Query("namespace")
	if namespaceFilter == "all" || namespaceFilter == "All" {
		namespaceFilter = ""
	}

	token, tokenErr := s.kubeletToken(requestContext)
	if tokenErr != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": tokenErr.Error(), "metricsAvailable": false})
		return
	}

	nodes, nodesErr := s.clientset.CoreV1().Nodes().List(requestContext, metav1.ListOptions{})
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

	s.cpuSampleMu.Lock()
	now := time.Now()
	for _, smp := range allSamples {
		if namespaceFilter != "" && smp.Namespace != namespaceFilter {
			continue
		}

		key := smp.Namespace + "/" + smp.Pod + "/" + smp.Container
		prev, hasPrev := s.cpuSamples[key]
		s.cpuSamples[key] = containerCPUSample{timestamp: now, cpuSeconds: smp.CPUSeconds}

		podKey := smp.Namespace + "/" + smp.Pod
		u := usageByPod[podKey]
		u.memoryBytes += int64(smp.MemoryBytes)
		if hasPrev {
			elapsedSeconds := now.Sub(prev.timestamp).Seconds()
			if elapsedSeconds > 0 {
				cpuDelta := smp.CPUSeconds - prev.cpuSeconds
				if cpuDelta < 0 {
					cpuDelta = 0
				}
				u.cpuMilli += int64((cpuDelta / elapsedSeconds) * 1000)
			}
		}
		usageByPod[podKey] = u
	}
	s.cpuSampleMu.Unlock()

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
}
