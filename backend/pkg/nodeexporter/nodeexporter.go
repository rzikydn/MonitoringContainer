// Package nodeexporter membaca metrik CPU/RAM node langsung dari node_exporter
// (format teks Prometheus) sebagai alternatif metrics.k8s.io, karena usage
// CPU/RAM lewat kubelet (cAdvisor/CRI stats) terbukti tidak terisi di cluster ini.
// node_exporter membaca /proc/stat dan /proc/meminfo langsung dari kernel host,
// jalur yang terpisah dari cgroup per-container yang bermasalah.
package nodeexporter

import (
	"bufio"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Snapshot struct {
	MemTotalBytes     float64
	MemAvailableBytes float64
	CPUTotalSeconds   float64 // dijumlahkan lintas semua core, semua mode
	CPUIdleSeconds    float64 // dijumlahkan lintas semua core, mode idle saja
}

func Fetch(nodeIP string, port int, timeout time.Duration) (Snapshot, error) {
	client := http.Client{Timeout: timeout}
	url := fmt.Sprintf("http://%s:%d/metrics", nodeIP, port)

	resp, err := client.Get(url)
	if err != nil {
		return Snapshot{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Snapshot{}, fmt.Errorf("node-exporter mengembalikan HTTP %d", resp.StatusCode)
	}

	var snap Snapshot
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		switch {
		case strings.HasPrefix(line, "node_memory_MemTotal_bytes "):
			snap.MemTotalBytes = parseValue(line)
		case strings.HasPrefix(line, "node_memory_MemAvailable_bytes "):
			snap.MemAvailableBytes = parseValue(line)
		case strings.HasPrefix(line, "node_cpu_seconds_total{"):
			value := parseValue(line)
			snap.CPUTotalSeconds += value
			if strings.Contains(line, `mode="idle"`) {
				snap.CPUIdleSeconds += value
			}
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
