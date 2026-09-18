package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"k8s-dashboard-backend/pkg/k8s"
	"k8s-dashboard-backend/pkg/nodeexporter"
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

	// 3. Endpoint Get Pods (Contoh)
	r.GET("/api/workloads/pods", func(c *gin.Context) {
		pods, err := clientset.CoreV1().Pods("default").List(context.TODO(), metav1.ListOptions{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var podList []map[string]interface{}
		for _, pod := range pods.Items {
			podList = append(podList, map[string]interface{}{
				"name":      pod.Name,
				"namespace": pod.Namespace,
				"status":    pod.Status.Phase,
			})
		}

		c.JSON(http.StatusOK, gin.H{"data": podList})
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
