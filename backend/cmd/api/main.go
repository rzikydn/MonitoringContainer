package main

import (
	"log"

	"k8s-dashboard-backend/pkg/k8s"
)

func main() {
	clientset, _, err := k8s.InitClient()
	if err != nil {
		log.Fatalf("Gagal terhubung ke Kubernetes: %v", err)
	}

	server := NewServer(clientset, LoadConfig())
	if err := server.Run(":8080"); err != nil {
		log.Fatalf("Server gagal berjalan: %v", err)
	}
}
