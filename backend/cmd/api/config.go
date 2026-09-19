package main

import (
	"os"
	"strconv"
)

// Config membungkus semua nilai konfigurasi yang dibaca dari environment
// variable, supaya service-service lain tidak langsung memanggil os.Getenv
// tersebar di banyak tempat — satu titik encapsulation untuk konfigurasi.
type Config struct{}

func LoadConfig() *Config {
	return &Config{}
}

func (c *Config) NodeExporterPort() int {
	if v := os.Getenv("NODE_EXPORTER_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			return port
		}
	}
	return 9100
}

// IngressControllerNamespace: namespace tempat ingress controller berjalan, dipakai
// NetworkPolicy isolasi supaya traffic dari ingress tetap bisa masuk ke namespace
// tenant. Override lewat env kalau nama namespace ingress controller di cluster
// berbeda dari default k3s/ingress-nginx ("ingress-nginx" atau "kube-system").
func (c *Config) IngressControllerNamespace() string {
	if v := os.Getenv("INGRESS_CONTROLLER_NAMESPACE"); v != "" {
		return v
	}
	return "ingress-nginx"
}

// IngressMetricsServiceName: nama Service NodePort yang meng-expose port metrics
// ingress-nginx-controller (10254) supaya bisa diakses lewat <node-ip>:<nodePort> —
// pod IP overlay Flannel (10.42.x.x) terbukti tidak terjangkau dari tempat backend
// ini berjalan, jadi harus lewat NodePort, sama seperti node-exporter/kubelet.
// Buat service ini manual: kubectl expose deployment ingress-nginx-controller
// -n ingress-nginx --type=NodePort --port=10254 --target-port=10254
// --name=ingress-nginx-controller-metrics
func (c *Config) IngressMetricsServiceName() string {
	if v := os.Getenv("INGRESS_METRICS_SERVICE"); v != "" {
		return v
	}
	return "ingress-nginx-controller-metrics"
}

// AlertWebhookURL: endpoint webhook (Slack/Discord/Teams/generic — apapun yang
// terima POST JSON {"text": "..."}). Kosong secara default; tanpa ini alert
// tetap dihitung & ditampilkan di dashboard, cuma tidak dikirim keluar.
func (c *Config) AlertWebhookURL() string {
	return os.Getenv("ALERT_WEBHOOK_URL")
}

// TelegramBotToken/TelegramChatID: kredensial bot Telegram, dipakai terpisah dari
// AlertWebhookURL karena format API Telegram beda (butuh chat_id, bukan cuma
// text, dan endpoint-nya sudah termasuk token bot-nya).
func (c *Config) TelegramBotToken() string {
	return os.Getenv("TELEGRAM_BOT_TOKEN")
}

func (c *Config) TelegramChatID() string {
	return os.Getenv("TELEGRAM_CHAT_ID")
}
