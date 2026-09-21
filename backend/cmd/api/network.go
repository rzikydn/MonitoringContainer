package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"k8s-dashboard-backend/pkg/ingressmetrics"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// nginxSample: sampel counter terakhir dari ingress-nginx-controller, dipakai
// untuk menghitung delta (request rate, error rate) antar request — sama
// seperti pola cpuSample di nodes.go. Fitur 8 (Traffic In/Out & Health Check).
type nginxSample struct {
	timestamp          time.Time
	totalRequests      float64
	errorRequests      float64
	durationSumSeconds float64
	durationCount      float64
}

// NetworkService: Fitur 7 (Service & Ingress Overview) & Fitur 8 (Traffic
// In/Out & Health Check).
type NetworkService struct {
	clientset *kubernetes.Clientset
	cfg       *Config

	sampleMu sync.Mutex
	sample   *nginxSample
}

func NewNetworkService(clientset *kubernetes.Clientset, cfg *Config) *NetworkService {
	return &NetworkService{clientset: clientset, cfg: cfg}
}

func (s *NetworkService) RegisterRoutes(r *gin.Engine) {
	r.GET("/api/v1/network/overview", s.handleGetOverview)
	r.GET("/api/v1/network/traffic", s.handleGetTraffic)
}

// handleGetOverview: sumber data untuk Fitur 7. Status "Healthy"/"No Endpoints"
// dihitung dari Endpoints asli (bukan ditebak), dan status TLS Ingress dari
// Spec.TLS asli.
func (s *NetworkService) handleGetOverview(c *gin.Context) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	services, svcErr := s.clientset.CoreV1().Services("").List(requestContext, metav1.ListOptions{})
	if svcErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": svcErr.Error()})
		return
	}

	endpointsByKey := map[string]corev1.Endpoints{}
	if endpointsList, epErr := s.clientset.CoreV1().Endpoints("").List(requestContext, metav1.ListOptions{}); epErr != nil {
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
	ingresses, ingErr := s.clientset.NetworkingV1().Ingresses("").List(requestContext, metav1.ListOptions{})
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
}

// handleGetTraffic: sumber data untuk Fitur 8. Scrape langsung metrics
// Prometheus bawaan ingress-nginx-controller lewat Service NodePort
// (pod IP overlay Flannel terbukti tidak terjangkau dari tempat backend ini
// berjalan — lihat Config.IngressMetricsServiceName).
func (s *NetworkService) handleGetTraffic(c *gin.Context) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	ingressNamespace := s.cfg.IngressControllerNamespace()
	metricsServiceName := s.cfg.IngressMetricsServiceName()

	svc, svcErr := s.clientset.CoreV1().Services(ingressNamespace).Get(requestContext, metricsServiceName, metav1.GetOptions{})
	if svcErr != nil {
		c.JSON(http.StatusOK, gin.H{"metricsAvailable": false, "error": fmt.Sprintf("Service %s/%s belum ada — buat dulu: kubectl expose deployment ingress-nginx-controller -n %s --type=NodePort --port=10254 --target-port=10254 --name=%s (detail: %v)", ingressNamespace, metricsServiceName, ingressNamespace, metricsServiceName, svcErr)})
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
		c.JSON(http.StatusOK, gin.H{"metricsAvailable": false, "error": fmt.Sprintf("Service %s/%s ditemukan tapi bukan NodePort (tidak ada nodePort di spec.ports)", ingressNamespace, metricsServiceName)})
		return
	}

	nodes, nodesErr := s.clientset.CoreV1().Nodes().List(requestContext, metav1.ListOptions{})
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

	s.sampleMu.Lock()
	prev := s.sample
	now := time.Now()
	s.sample = &nginxSample{
		timestamp:          now,
		totalRequests:      snap.TotalRequests,
		errorRequests:      snap.ErrorRequests,
		durationSumSeconds: snap.DurationSumSeconds,
		durationCount:      snap.DurationCount,
	}
	s.sampleMu.Unlock()

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
}
