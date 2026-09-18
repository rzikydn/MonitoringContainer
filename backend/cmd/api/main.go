package main

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"k8s-dashboard-backend/pkg/k8s"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var clusterOverviewCache struct {
	sync.RWMutex
	data gin.H
}

func main() {
	// 1. Inisialisasi K8s Client
	clientset, err := k8s.InitClient()
	if err != nil {
		log.Fatalf("Gagal terhubung ke Kubernetes: %v", err)
	}

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

		var nodeList []map[string]interface{}
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

			nodeList = append(nodeList, map[string]interface{}{
				"name":         node.Name,
				"role":         nodeRole,
				"cpu":          node.Status.Capacity.Cpu().String(),
				"memory":       node.Status.Capacity.Memory().String(),
				"storageBytes": nodeStorageBytes,
				"ip":           nodeIP,
				// Kamu bisa menambahkan logika untuk mengecek kondisi Ready di sini
			})
		}

		storagePercent := 0.0
		if totalStorageBytes > 0 {
			storagePercent = float64(allocatedStorageBytes) / float64(totalStorageBytes) * 100
		}

		overview := gin.H{
			"data": nodeList,
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
