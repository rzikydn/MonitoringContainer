package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// alertItem: satu alert — node down, pod sering restart, atau resource >85%.
type alertItem struct {
	ID       string    `json:"id"`
	Severity string    `json:"severity"`
	Title    string    `json:"title"`
	Message  string    `json:"message"`
	Time     time.Time `json:"time"`
}

const (
	podRestartThreshold      = 5
	resourceThresholdPercent = 85.0
)

// AlertService: Fitur 10 (Alert Notifications). Dievaluasi berkala oleh
// goroutine background (bukan cuma saat frontend buka halaman Alerts),
// supaya webhook/Telegram benar-benar terkirim proaktif saat kejadian.
// Bergantung ke NodeService lewat method LatestOverview() (dependency
// diinjeksikan lewat constructor) untuk cek threshold CPU/RAM/Disk, tanpa
// perlu tahu detail cache internal NodeService.
type AlertService struct {
	clientset *kubernetes.Clientset
	nodes     *NodeService
	cfg       *Config

	mu     sync.RWMutex
	items  []alertItem
	active map[string]bool // key alert yang sedang aktif, dipakai untuk dedup notifikasi
}

func NewAlertService(clientset *kubernetes.Clientset, nodes *NodeService, cfg *Config) *AlertService {
	return &AlertService{
		clientset: clientset,
		nodes:     nodes,
		cfg:       cfg,
		active:    map[string]bool{},
	}
}

func (s *AlertService) RegisterRoutes(r *gin.Engine) {
	r.GET("/api/v1/alerts", s.handleList)
	r.POST("/api/v1/alerts/test", s.handleTest)
}

// handleList: endpoint ini cuma membaca hasil evaluasi terakhir dari loop
// background — bukan menghitung ulang tiap request.
func (s *AlertService) handleList(c *gin.Context) {
	s.mu.RLock()
	items := s.items
	s.mu.RUnlock()

	telegramConfigured := s.cfg.TelegramBotToken() != "" && s.cfg.TelegramChatID() != ""
	c.JSON(http.StatusOK, gin.H{
		"data":               items,
		"webhookConfigured":  s.cfg.AlertWebhookURL() != "" || telegramConfigured,
		"telegramConfigured": telegramConfigured,
	})
}

// handleTest: dipakai tombol "Send Test Alert" — membuktikan webhook/Telegram
// yang dikonfigurasi benar-benar terkirim, bukan cuma simulasi UI.
func (s *AlertService) handleTest(c *gin.Context) {
	configured := s.cfg.AlertWebhookURL() != "" || (s.cfg.TelegramBotToken() != "" && s.cfg.TelegramChatID() != "")
	if !configured {
		c.JSON(http.StatusOK, gin.H{"sent": false, "message": "Tidak ada webhook/Telegram yang dikonfigurasi (ALERT_WEBHOOK_URL / TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID)"})
		return
	}

	s.sendNotification(alertItem{
		ID:       "test-alert",
		Severity: "warning",
		Title:    "Test Alert",
		Message:  "Ini adalah test notifikasi dari Container Monitoring Dashboard.",
		Time:     time.Now(),
	})

	c.JSON(http.StatusOK, gin.H{"sent": true})
}

// StartLoop menjalankan evaluasi alert setiap 30 detik di background, dan
// mengirim notifikasi hanya untuk alert yang BARU muncul (edge-triggered
// lewat map `active`, bukan spam tiap siklus).
func (s *AlertService) StartLoop() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			requestContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			items := s.evaluate(requestContext)
			cancel()

			newActive := map[string]bool{}
			s.mu.Lock()
			for _, item := range items {
				newActive[item.ID] = true
				if !s.active[item.ID] {
					s.sendNotification(item)
				}
			}
			s.items = items
			s.active = newActive
			s.mu.Unlock()

			<-ticker.C
		}
	}()
}

// evaluate mengecek tiga kondisi real: Node NotReady, pod CrashLoopBackOff
// atau restart berlebihan, dan cluster CPU/RAM/Disk usage >85%.
func (s *AlertService) evaluate(ctx context.Context) []alertItem {
	var items []alertItem
	now := time.Now()

	if nodes, err := s.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{}); err == nil {
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

	if pods, err := s.clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{}); err == nil {
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

	if overview := s.nodes.LatestOverview(); overview != nil {
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

// sendNotification mengirim ke semua channel yang sudah dikonfigurasi
// (webhook generik Slack/Discord/Teams DAN/ATAU Telegram, keduanya
// independen). Kalau tidak ada satupun yang di-set, tidak mengirim kemana-mana.
func (s *AlertService) sendNotification(item alertItem) {
	text := fmt.Sprintf("[%s] %s\n%s", strings.ToUpper(item.Severity), item.Title, item.Message)

	if url := s.cfg.AlertWebhookURL(); url != "" {
		if err := postJSON(url, gin.H{"text": text}); err != nil {
			log.Printf("Gagal mengirim alert webhook: %v", err)
		}
	}

	if token, chatID := s.cfg.TelegramBotToken(), s.cfg.TelegramChatID(); token != "" && chatID != "" {
		telegramURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
		if err := postJSON(telegramURL, gin.H{"chat_id": chatID, "text": text}); err != nil {
			log.Printf("Gagal mengirim alert ke Telegram: %v", err)
		}
	}
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
