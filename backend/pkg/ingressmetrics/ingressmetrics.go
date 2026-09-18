// Package ingressmetrics membaca metrik traffic (request count per status code,
// request duration) langsung dari endpoint Prometheus bawaan ingress-nginx-controller
// (biasanya port 10254, path /metrics) — sumber data untuk Fitur 8
// (Traffic In/Out & Health Check).
package ingressmetrics

import (
	"bufio"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Snapshot struct {
	TotalRequests      float64 // sum nginx_ingress_controller_requests, semua status
	ErrorRequests      float64 // sum nginx_ingress_controller_requests, status 4xx/5xx
	DurationSumSeconds float64 // sum nginx_ingress_controller_request_duration_seconds_sum
	DurationCount      float64 // sum nginx_ingress_controller_request_duration_seconds_count
}

func Fetch(podIP string, port int, timeout time.Duration) (Snapshot, error) {
	client := http.Client{Timeout: timeout}
	url := fmt.Sprintf("http://%s:%d/metrics", podIP, port)

	resp, err := client.Get(url)
	if err != nil {
		return Snapshot{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Snapshot{}, fmt.Errorf("ingress-nginx metrics mengembalikan HTTP %d", resp.StatusCode)
	}

	var snap Snapshot
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		switch {
		case strings.HasPrefix(line, "nginx_ingress_controller_requests{"):
			value := parseValue(line)
			snap.TotalRequests += value
			status := extractLabel(line, "status")
			if len(status) > 0 && (status[0] == '4' || status[0] == '5') {
				snap.ErrorRequests += value
			}
		case strings.HasPrefix(line, "nginx_ingress_controller_request_duration_seconds_sum{"):
			snap.DurationSumSeconds += parseValue(line)
		case strings.HasPrefix(line, "nginx_ingress_controller_request_duration_seconds_count{"):
			snap.DurationCount += parseValue(line)
		}
	}
	if err := scanner.Err(); err != nil {
		return Snapshot{}, err
	}

	return snap, nil
}

func parseValue(line string) float64 {
	idx := strings.LastIndex(line, " ")
	if idx == -1 {
		return 0
	}
	value, _ := strconv.ParseFloat(line[idx+1:], 64)
	return value
}

func extractLabel(line, key string) string {
	marker := key + `="`
	idx := strings.Index(line, marker)
	if idx == -1 {
		return ""
	}
	start := idx + len(marker)
	end := strings.Index(line[start:], `"`)
	if end == -1 {
		return ""
	}
	return line[start : start+end]
}
