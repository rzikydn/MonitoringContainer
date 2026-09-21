package main

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"k8s-dashboard-backend/pkg/nodeexporter"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// cpuSample menyimpan hasil scrape node_cpu_seconds_total sebelumnya per node,
// dipakai untuk menghitung delta (usage = 1 - idleDelta/totalDelta) antar request,
// karena node_cpu_seconds_total adalah counter kumulatif, bukan nilai instan.
type cpuSample struct {
	timestamp    time.Time
	totalSeconds float64
	idleSeconds  float64
}

// NodeService: Fitur 1 & 2 (Aggregated Resource Capacity, Node Status & Failover).
// State yang dulunya variabel global (clusterOverviewCache, cpuSampleCache)
// sekarang jadi field privat milik service ini — encapsulation, tidak ada lagi
// mutable state yang bisa diakses/diubah sembarangan dari file lain.
type NodeService struct {
	clientset *kubernetes.Clientset
	cfg       *Config

	overviewMu   sync.RWMutex
	overviewData gin.H

	cpuSampleMu sync.Mutex
	cpuSamples  map[string]cpuSample
}

func NewNodeService(clientset *kubernetes.Clientset, cfg *Config) *NodeService {
	return &NodeService{
		clientset:  clientset,
		cfg:        cfg,
		cpuSamples: make(map[string]cpuSample),
	}
}

func (s *NodeService) RegisterRoutes(r *gin.Engine) {
	r.GET("/api/v1/nodes", s.handleGetOverview)
}

// LatestOverview mengembalikan snapshot cluster overview terakhir yang berhasil
// diambil. Dipakai AlertService untuk cek threshold CPU/RAM/Disk >85% tanpa
// perlu tahu detail cache internal NodeService (abstraction).
func (s *NodeService) LatestOverview() gin.H {
	s.overviewMu.RLock()
	defer s.overviewMu.RUnlock()
	return s.overviewData
}

func (s *NodeService) handleGetOverview(c *gin.Context) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	nodes, err := s.clientset.CoreV1().Nodes().List(requestContext, metav1.ListOptions{})
	if err != nil {
		if cached := s.LatestOverview(); cached != nil {
			log.Printf("Kubernetes API tidak tersedia, mengembalikan overview terakhir: %v", err)
			c.JSON(http.StatusOK, cached)
			return
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	var totalStorageBytes int64
	var allocatedStorageBytes int64
	persistentVolumes, err := s.clientset.CoreV1().PersistentVolumes().List(requestContext, metav1.ListOptions{})
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
	port := s.cfg.NodeExporterPort()

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

				s.cpuSampleMu.Lock()
				prev, hasPrev := s.cpuSamples[node.Name]
				s.cpuSamples[node.Name] = cpuSample{
					timestamp:    time.Now(),
					totalSeconds: snap.CPUTotalSeconds,
					idleSeconds:  snap.CPUIdleSeconds,
				}
				s.cpuSampleMu.Unlock()

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
	allPods, podsErr := s.clientset.CoreV1().Pods("").List(requestContext, metav1.ListOptions{})
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

	s.overviewMu.Lock()
	s.overviewData = overview
	s.overviewMu.Unlock()

	c.JSON(http.StatusOK, overview)
}
