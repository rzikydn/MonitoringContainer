package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"k8s.io/client-go/kubernetes"
)

// RouteRegistrar diimplementasikan tiap service (NodeService, PodService, dst).
// Server tidak perlu tahu endpoint apa saja yang dipunyai tiap service — cukup
// panggil RegisterRoutes() secara seragam lewat interface ini. Ini polymorphism:
// beberapa tipe konkret berbeda, dipanggil lewat satu bentuk yang sama.
type RouteRegistrar interface {
	RegisterRoutes(r *gin.Engine)
}

// Server mengorkestrasi seluruh service lewat composition dan menjalankan HTTP server.
type Server struct {
	router *gin.Engine

	Nodes       *NodeService
	Pods        *PodService
	Deployments *DeploymentService
	Namespaces  *NamespaceService
	Network     *NetworkService
	Alerts      *AlertService
	Events      *EventService
	Auth        *AuthService
}

// NewServer merakit semua service (dependency wiring) dan mendaftarkan rute-rutenya.
func NewServer(clientset *kubernetes.Clientset, cfg *Config) *Server {
	nodes := NewNodeService(clientset, cfg)

	s := &Server{
		router:      gin.Default(),
		Nodes:       nodes,
		Pods:        NewPodService(clientset),
		Deployments: NewDeploymentService(clientset),
		Namespaces:  NewNamespaceService(clientset, cfg),
		Network:     NewNetworkService(clientset, cfg),
		// AlertService bergantung ke NodeService (lewat method LatestOverview(),
		// bukan akses langsung ke cache internalnya) untuk cek threshold CPU/RAM/Disk.
		Alerts: NewAlertService(clientset, nodes, cfg),
		Events: NewEventService(clientset),
		Auth:   NewAuthService(),
	}

	s.router.Use(corsMiddleware())

	registrars := []RouteRegistrar{
		s.Pods, s.Deployments, s.Alerts, s.Network,
		s.Namespaces, s.Events, s.Auth, s.Nodes,
	}
	for _, reg := range registrars {
		reg.RegisterRoutes(s.router)
	}

	return s
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// Run memulai alert loop di background lalu menjalankan HTTP server (blocking).
func (s *Server) Run(addr string) error {
	s.Alerts.StartLoop()
	log.Printf("Backend API berjalan di http://localhost%s", addr)
	return s.router.Run(addr)
}
