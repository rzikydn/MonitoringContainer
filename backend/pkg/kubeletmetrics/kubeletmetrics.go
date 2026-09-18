// Package kubeletmetrics membaca metrik CPU/RAM per pod/container langsung dari
// endpoint /metrics/resource kubelet (format teks Prometheus) — endpoint yang
// sama dipakai metrics-server v0.9.0, tapi diakses langsung tanpa lewat
// metrics.k8s.io. Ini dilakukan karena metrics-server di cluster ini tidak
// pernah lolos readiness probe (gara-gara data node-nya gagal divalidasi),
// sehingga Service-nya tidak pernah punya endpoint yang bisa dituju sama
// sekali — walau data per-pod-nya sendiri terbukti valid saat diuji manual.
package kubeletmetrics

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type ContainerSample struct {
	Namespace   string
	Pod         string
	Container   string
	CPUSeconds  float64 // dari container_cpu_usage_seconds_total (kumulatif, butuh delta)
	MemoryBytes float64 // dari container_memory_working_set_bytes (instan)
}

// Fetch mengambil seluruh sampel container yang berjalan di satu node.
func Fetch(nodeIP string, token string, timeout time.Duration) ([]ContainerSample, error) {
	client := http.Client{
		Timeout:   timeout,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
	}

	url := fmt.Sprintf("https://%s:10250/metrics/resource", nodeIP)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kubelet mengembalikan HTTP %d", resp.StatusCode)
	}

	samples := map[string]*ContainerSample{}
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		switch {
		case strings.HasPrefix(line, "container_cpu_usage_seconds_total{"):
			ns := extractLabel(line, "namespace")
			pod := extractLabel(line, "pod")
			container := extractLabel(line, "container")
			if ns == "" || pod == "" || container == "" {
				continue
			}
			key := ns + "/" + pod + "/" + container
			s := getOrCreate(samples, key, ns, pod, container)
			s.CPUSeconds = parseValue(line)
		case strings.HasPrefix(line, "container_memory_working_set_bytes{"):
			ns := extractLabel(line, "namespace")
			pod := extractLabel(line, "pod")
			container := extractLabel(line, "container")
			if ns == "" || pod == "" || container == "" {
				continue
			}
			key := ns + "/" + pod + "/" + container
			s := getOrCreate(samples, key, ns, pod, container)
			s.MemoryBytes = parseValue(line)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	result := make([]ContainerSample, 0, len(samples))
	for _, s := range samples {
		result = append(result, *s)
	}
	return result, nil
}

func getOrCreate(m map[string]*ContainerSample, key, ns, pod, container string) *ContainerSample {
	if s, ok := m[key]; ok {
		return s
	}
	s := &ContainerSample{Namespace: ns, Pod: pod, Container: container}
	m[key] = s
	return s
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
