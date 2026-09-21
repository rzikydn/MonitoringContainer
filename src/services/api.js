// ApiClient membungkus semua komunikasi dengan backend Go jadi satu class —
// state (baseUrl) dan perilaku (tiap method fetchX/createX/dst) dibungkus
// jadi satu unit (encapsulation), helper #request/#formatStorage/#formatAge
// private (tidak bisa diakses dari luar class, cuma dipakai method lain di
// dalamnya). Komponen React tetap functional (hooks) — cuma layer data ini
// yang OOP, dipakai lewat instance singleton `apiClient` di bawah.
class ApiClient {
  #baseUrl = '/k8s';

  // #request: satu titik fetch+error-handling untuk semua endpoint, supaya
  // logic "lempar Error kalau !res.ok" tidak diulang di setiap method.
  async #request(path, options = {}) {
    const res = await fetch(`${this.#baseUrl}${path}`, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  #formatStorage(usedBytes, totalBytes) {
    const units = [
      { label: 'TB', value: 1024 ** 4 },
      { label: 'GB', value: 1024 ** 3 },
      { label: 'MB', value: 1024 ** 2 },
    ];
    const used = Number(usedBytes) || 0;
    const total = Number(totalBytes) || 0;
    const unit = units.find(({ value }) => total >= value) || units[0];

    return {
      used: (used / unit.value).toFixed(1),
      total: (total / unit.value).toFixed(1),
      unit: unit.label,
    };
  }

  #formatAge(isoTime) {
    if (!isoTime) return 'N/A';
    const start = new Date(isoTime).getTime();
    if (Number.isNaN(start)) return 'N/A';
    const diffSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const days = Math.floor(diffSeconds / 86400);
    const hours = Math.floor((diffSeconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Agregasi kapasitas cluster (CPU/RAM/Disk) + status Ready/NotReady per node.
  async fetchClusterOverview() {
    try {
      const rawData = await this.#request('/api/v1/nodes');

      let totalMemBytes = 0;

      const realNodes = (rawData.data || []).map((node) => {
        const memKi = parseInt(node.memory || '0', 10);
        const memGB = (memKi / (1024 * 1024)).toFixed(1);
        totalMemBytes += memKi;

        const hasUsage = node.cpuUsageMilli !== undefined && node.memoryUsageBytes !== undefined;

        return {
          name: node.name,
          role: node.role || 'Worker',
          status: node.status || 'Unknown',
          cpu: `${parseInt(node.cpu || '0', 10)} Cores`,
          ram: `${memGB} GB Capacity`,
          cpuUsage: hasUsage ? `${(node.cpuUsageMilli / 1000).toFixed(2)} Cores` : 'N/A',
          ramUsage: hasUsage ? `${(node.memoryUsageBytes / (1024 ** 3)).toFixed(2)} GB` : 'N/A',
          uptime: 'Live',
          ip: node.ip || 'N/A',
          heartbeat: node.status === 'Ready' ? 'Active' : 'Lost',
        };
      });

      const totalRAM_GB = (totalMemBytes / (1024 * 1024)).toFixed(1);

      // CPU & RAM usage nyata berasal dari node-exporter via backend. Jika
      // node-exporter belum terpasang, backend melaporkan metricsAvailable:
      // false — kita tampilkan itu apa adanya, bukan angka rekaan.
      const metricsAvailable = Boolean(rawData.metricsAvailable);
      const cpuTotalCores = (Number(rawData.cpu?.capacityMilli) || 0) / 1000;
      const cpuUsedCores = (Number(rawData.cpu?.usageMilli) || 0) / 1000;
      const ramTotalGB = (Number(rawData.memory?.capacityBytes) || 0) / (1024 ** 3);
      const ramUsedGB = (Number(rawData.memory?.usageBytes) || 0) / (1024 ** 3);

      // Disk: kapasitas total dari ephemeral-storage node (Kubernetes API),
      // usage real dari node-exporter (root filesystem host).
      const diskTotalBytes = Number(rawData.disk?.capacityBytes) || 0;
      const diskUsage = this.#formatStorage(rawData.disk?.usageBytes, diskTotalBytes);

      // Persistent Volume Allocation: terpisah dari kapasitas disk node di atas.
      const persistentStorageTotal = Number(rawData.storage?.totalBytes) || 0;
      const hasPersistentStorage = persistentStorageTotal > 0;
      const storage = hasPersistentStorage
        ? this.#formatStorage(rawData.storage.usedBytes, persistentStorageTotal)
        : { used: '0.0', total: '0.0', unit: 'GB' };
      const storagePercent = hasPersistentStorage
        ? Number(rawData.storage.percent || 0).toFixed(1)
        : '0.0';

      return {
        cpu: metricsAvailable
          ? { used: cpuUsedCores.toFixed(2), total: cpuTotalCores.toFixed(1), percent: Number(rawData.cpu.percent || 0).toFixed(1), unit: 'Cores' }
          : { used: 'N/A', total: cpuTotalCores.toFixed(1), percent: 0, unit: 'Cores', source: 'metrics-server unavailable' },
        ram: metricsAvailable
          ? { used: ramUsedGB.toFixed(1), total: ramTotalGB.toFixed(1), percent: Number(rawData.memory.percent || 0).toFixed(1), unit: 'GB', available: (ramTotalGB - ramUsedGB).toFixed(1) + ' GB' }
          : { used: 'N/A', total: totalRAM_GB, percent: 0, unit: 'GB', available: 'N/A', source: 'metrics-server unavailable' },
        disk: metricsAvailable && diskTotalBytes > 0
          ? { used: diskUsage.used, total: diskUsage.total, percent: Number(rawData.disk.percent || 0).toFixed(1), unit: diskUsage.unit, source: 'Node ephemeral-storage (host disk)' }
          : { used: 'N/A', total: diskUsage.total, percent: 0, unit: diskUsage.unit, source: 'node-exporter unavailable' },
        storage: {
          used: storage.used,
          total: storage.total,
          percent: storagePercent,
          unit: storage.unit,
          source: hasPersistentStorage ? 'Persistent volume allocation' : 'No PersistentVolumes found',
        },
        metricsAvailable,
        podsCapacity: {
          active: Number(rawData.pods?.total) || 0,
          max: Number(rawData.pods?.capacity) || 0,
          running: Number(rawData.pods?.running) || 0,
          crash: Number(rawData.pods?.crash) || 0,
        },
        nodes: realNodes,
      };
    } catch (err) {
      console.error('Gagal mengambil data dari Kubernetes:', err.message);
      return {
        cpu: { used: 0, total: 0, percent: 0, unit: 'Cores' },
        ram: { used: 0, total: 0, percent: 0, unit: 'GB', available: '0 GB' },
        disk: { used: 0, total: 0, percent: 0, unit: 'GB', source: 'Unavailable' },
        storage: { used: 0, total: 0, percent: 0, unit: 'TB', source: 'Unavailable' },
        metricsAvailable: false,
        podsCapacity: { active: 0, max: 0, running: 0, crash: 0 },
        nodes: [{ name: 'Connecting to Cluster...', role: 'N/A', status: 'Offline', cpu: '0', ram: '0', uptime: 'N/A', ip: 'N/A' }],
      };
    }
  }

  // Fitur 2: Event failover nyata (NodeNotReady, eviction, rescheduling pod)
  async fetchClusterEvents() {
    try {
      const rawData = await this.#request('/api/v1/events');
      return (rawData.data || []).map((ev, idx) => ({
        id: idx,
        type: ev.type || 'Normal',
        reason: ev.reason || '',
        message: ev.message || '',
        object: ev.object || '',
        node: ev.node || '',
        time: ev.time || null,
      }));
    } catch (err) {
      console.error('Gagal mengambil events dari Kubernetes:', err.message);
      return [];
    }
  }

  // Fitur 3: Project/Namespace Grouping — daftar pod real, dikelompokkan per
  // namespace K8s. CPU/Memory per-pod ada di fetchPodMetrics (Fitur 6),
  // ditandai 'N/A' di sini alih-alih dikarang.
  async fetchWorkloadsPods(namespace = 'all') {
    try {
      const rawData = await this.#request(`/api/workloads/pods?namespace=${encodeURIComponent(namespace)}`);
      return (rawData.data || []).map((pod) => ({
        name: pod.name,
        namespace: pod.namespace,
        node: pod.node || 'N/A',
        status: pod.status,
        restarts: Number(pod.restarts) || 0,
        cpu: 'N/A',
        memory: 'N/A',
        uptime: this.#formatAge(pod.startTime),
        hasLivenessProbe: Boolean(pod.hasLivenessProbe),
        hasReadinessProbe: Boolean(pod.hasReadinessProbe),
        ready: Boolean(pod.ready),
        containers: pod.containers || [],
      }));
    } catch (err) {
      console.error('Gagal mengambil pods dari Kubernetes:', err.message);
      return [];
    }
  }

  // Fitur 5: Restart pod = delete pod (K8s tidak punya API "restart" native).
  // Kalau pod dikelola controller (Deployment/ReplicaSet/dst), penggantinya
  // otomatis dibuat ulang. Kalau pod berdiri sendiri, pod hilang permanen.
  async restartPod(namespace, name) {
    return this.#request(`/api/workloads/pods?namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  // Fitur 5: Deployment & Pod Lifecycle — jumlah replica real per Deployment.
  async fetchDeployments(namespace = 'all') {
    try {
      const rawData = await this.#request(`/api/v1/deployments?namespace=${encodeURIComponent(namespace)}`);
      return (rawData.data || []).map((d) => ({
        name: d.name,
        namespace: d.namespace,
        desired: Number(d.desiredReplicas) || 0,
        ready: Number(d.readyReplicas) || 0,
        available: Number(d.availableReplicas) || 0,
        updated: Number(d.updatedReplicas) || 0,
        image: d.image || 'N/A',
        age: this.#formatAge(d.createdAt),
      }));
    } catch (err) {
      console.error('Gagal mengambil deployments dari Kubernetes:', err.message);
      return [];
    }
  }

  // App Services: scale (Start/Stop/slider) dan restart (rolling restart) Deployment real.
  async scaleDeployment(namespace, name, replicas) {
    return this.#request(`/api/v1/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replicas }),
    });
  }

  async restartDeployment(namespace, name) {
    return this.#request(`/api/v1/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/restart`, {
      method: 'POST',
    });
  }

  // Fitur 6: Live Container Metrics — CPU/RAM per pod, langsung dari kubelet tiap
  // node (lihat kubeletmetrics di backend). CPU baru terisi mulai polling kedua
  // (butuh delta dua sampel), sama seperti CPU usage node di Fitur 1.
  async fetchPodMetrics(namespace = 'all') {
    try {
      const rawData = await this.#request(`/api/v1/pods/metrics?namespace=${encodeURIComponent(namespace)}`);
      const metricsAvailable = Boolean(rawData.metricsAvailable);
      const byKey = {};
      for (const m of rawData.data || []) {
        byKey[`${m.namespace}/${m.pod}`] = {
          cpuMilli: Number(m.cpuMilli) || 0,
          memoryBytes: Number(m.memoryBytes) || 0,
        };
      }
      return { metricsAvailable, byKey };
    } catch (err) {
      console.error('Gagal mengambil pod metrics dari Kubernetes:', err.message);
      return { metricsAvailable: false, byKey: {} };
    }
  }

  // Fitur 3: Namespace = project. List/create/delete langsung ke Kubernetes API.
  async fetchNamespaces() {
    try {
      const rawData = await this.#request('/api/v1/namespaces');
      return (rawData.data || []).map((ns) => ({
        name: ns.name,
        status: ns.status || 'Unknown',
        description: ns.description || '',
        podCount: Number(ns.podCount) || 0,
        createdAt: ns.createdAt || null,
      }));
    } catch (err) {
      console.error('Gagal mengambil namespaces dari Kubernetes:', err.message);
      return [];
    }
  }

  async createNamespace(name, options = {}) {
    const {
      description = '',
      cpuRequest = '2.0',
      cpuLimit = '4.0',
      memoryRequest = '4.0',
      memoryLimit = '8.0',
      podsQuota = '10',
    } = options;
    return this.#request('/api/v1/namespaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, cpuRequest, cpuLimit, memoryRequest, memoryLimit, podsQuota }),
    });
  }

  async deleteNamespace(name) {
    return this.#request(`/api/v1/namespaces/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  // Fitur 4: Quota & Limit Monitoring — pakai ResourceQuota asli kalau namespace
  // punya satu (untuk batas/"hard"), used selalu dihitung real dari request
  // container pod + PVC (bukan dikarang) supaya tetap informatif walau namespace
  // belum diberi ResourceQuota.
  async fetchNamespaceQuota(namespaceKey) {
    try {
      const raw = await this.#request(`/api/v1/namespaces/${encodeURIComponent(namespaceKey)}/quota`);

      const buildResource = (data, divisor, unit) => {
        const used = (Number(data?.usedMilli ?? data?.usedBytes ?? data?.used) || 0) / divisor;
        const hasHard = Boolean(data?.hasHard);
        const hard = hasHard ? (Number(data?.hardMilli ?? data?.hardBytes ?? data?.hard) || 0) / divisor : null;
        return {
          used: unit === 'Pods' ? used : used.toFixed(2),
          max: hard === null ? null : (unit === 'Pods' ? hard : hard.toFixed(1)),
          unit,
          pct: Number(data?.percent || 0).toFixed(1),
          hasHard,
        };
      };

      return {
        hasResourceQuota: Boolean(raw.hasResourceQuota),
        cpu: buildResource(raw.cpu, 1000, 'Cores'),
        memory: buildResource(raw.memory, 1024 ** 3, 'GB'),
        storage: buildResource(raw.storage, 1024 ** 3, 'GB'),
        pods: buildResource(raw.pods, 1, 'Pods'),
      };
    } catch (err) {
      console.error('Gagal mengambil quota namespace dari Kubernetes:', err.message);
      return null;
    }
  }

  // Fitur 7: Service & Ingress Overview — data real Service/Endpoints/Ingress.
  // Traffic rate/latency/HTTP error (request-level) sengaja tidak ada di sini,
  // itu ranah Fitur 8 (butuh probing HTTP asli, belum ada mekanismenya).
  async fetchNetworkIngress() {
    try {
      const rawData = await this.#request('/api/v1/network/overview');
      return {
        services: (rawData.services || []).map((svc) => ({
          name: svc.name,
          namespace: svc.namespace,
          type: svc.type,
          clusterIp: svc.clusterIP,
          port: svc.ports || 'N/A',
          targetPod: svc.targetPod || 'N/A',
          endpoints: `${svc.endpointsReady ?? 0}/${svc.endpointsTotal ?? 0} Endpoints Ready`,
          status: svc.status,
        })),
        ingress: (rawData.ingress || []).map((ing) => ({
          namespace: ing.namespace,
          host: ing.host || '*',
          path: ing.path || '/',
          service: ing.service || 'N/A',
          tls: ing.tls ? 'TLS Enabled' : 'TLS Disabled',
        })),
      };
    } catch (err) {
      console.error('Gagal mengambil network overview dari Kubernetes:', err.message);
      return { services: [], ingress: [] };
    }
  }

  // Fitur 8: Traffic In/Out — request rate, error rate (4xx/5xx), latency,
  // dari metrics Prometheus bawaan ingress-nginx-controller. Perlu 2x polling
  // sebelum rate terisi (delta counter), sama seperti pola CPU di fitur lain.
  async fetchTrafficOverview() {
    try {
      const rawData = await this.#request('/api/v1/network/traffic');
      return {
        metricsAvailable: Boolean(rawData.metricsAvailable),
        hasRate: Boolean(rawData.hasRate),
        requestRatePerMin: Number(rawData.requestRatePerMin) || 0,
        errorRatePercent: Number(rawData.errorRatePercent) || 0,
        avgLatencyMs: Number(rawData.avgLatencyMs) || 0,
        error: rawData.error || null,
      };
    } catch (err) {
      console.error('Gagal mengambil traffic overview dari Kubernetes:', err.message);
      return { metricsAvailable: false, hasRate: false, requestRatePerMin: 0, errorRatePercent: 0, avgLatencyMs: 0, error: err.message };
    }
  }

  // Fitur 9: Centralized Log Viewer — streaming asli (SSE) langsung dari Kubernetes
  // API (setara `kubectl logs -f`), bukan polling atau simulasi. Dipakai dengan
  // `new EventSource(apiClient.buildLogStreamUrl(...))` di komponen, karena
  // EventSource tidak bisa dipakai lewat fetch/async biasa.
  buildLogStreamUrl(namespace, pod, container, tailLines = 200) {
    const params = new URLSearchParams({ namespace, pod, tailLines: String(tailLines) });
    if (container) params.set('container', container);
    return `${this.#baseUrl}/api/workloads/logs?${params.toString()}`;
  }

  // Fitur 10: Alert Notifications — node down, pod sering restart, resource >85%.
  // Dihitung terus-menerus di backend (bukan cuma saat halaman ini dibuka), dan
  // dikirim ke webhook (kalau ALERT_WEBHOOK_URL sudah di-set di backend).
  async fetchAlerts() {
    try {
      const rawData = await this.#request('/api/v1/alerts');
      return {
        alerts: (rawData.data || []).map((a) => ({
          id: a.id,
          severity: a.severity === 'danger' ? 'critical' : a.severity,
          title: a.title,
          message: a.message,
          time: a.time,
        })),
        webhookConfigured: Boolean(rawData.webhookConfigured),
        telegramConfigured: Boolean(rawData.telegramConfigured),
      };
    } catch (err) {
      console.error('Gagal mengambil alerts dari Kubernetes:', err.message);
      return { alerts: [], webhookConfigured: false, telegramConfigured: false };
    }
  }

  async sendTestAlert() {
    return this.#request('/api/v1/alerts/test', { method: 'POST' });
  }

  // Fitur 11: Zero-CLI Deployment — bikin Deployment + Service sungguhan.
  // Tidak ada fallback "sukses palsu" — kalau gagal, error dilempar apa adanya
  // supaya form bisa menampilkan pesan error yang jujur ke user.
  async deployApplication(payload) {
    return this.#request('/api/v1/apps/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // Autentikasi user — lihat catatan di LoginPage.jsx & backend auth.go: belum
  // ada validasi kredensial sungguhan (masih stub, ditandai jelas di UI login).
  async loginUser(username, password) {
    try {
      return await this.#request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error('Username atau Password salah!');
    }
  }
}

export const apiClient = new ApiClient();
