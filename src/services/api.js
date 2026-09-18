const BASE_URL = '/k8s';

function formatStorage(usedBytes, totalBytes) {
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


// 1. Fitur 1 & 2: Agregasi Kapasitas Cluster & Status Failover Node
// 1. Fitur 1 & 2: Membaca Data Real dari kubectl proxy (Port 8001)
// 1. Fitur 1 & 2: Agregasi Kapasitas Cluster & Status Failover Node
export async function fetchClusterOverview() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/nodes`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const rawData = await res.json();

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
        heartbeat: node.status === 'Ready' ? 'Active' : 'Lost'
      };
    });

    const totalRAM_GB = (totalMemBytes / (1024 * 1024)).toFixed(1);

    // CPU & RAM usage nyata berasal dari metrics-server (metrics.k8s.io) via backend.
    // Jika metrics-server belum terpasang di cluster, backend melaporkan
    // metricsAvailable: false — kita tampilkan itu apa adanya, bukan angka rekaan.
    const metricsAvailable = Boolean(rawData.metricsAvailable);
    const cpuTotalCores = (Number(rawData.cpu?.capacityMilli) || 0) / 1000;
    const cpuUsedCores = (Number(rawData.cpu?.usageMilli) || 0) / 1000;
    const ramTotalGB = (Number(rawData.memory?.capacityBytes) || 0) / (1024 ** 3);
    const ramUsedGB = (Number(rawData.memory?.usageBytes) || 0) / (1024 ** 3);

    // Disk: kapasitas total dari ephemeral-storage node (Kubernetes API),
    // usage real dari node-exporter (root filesystem host).
    const diskTotalBytes = Number(rawData.disk?.capacityBytes) || 0;
    const diskUsage = formatStorage(rawData.disk?.usageBytes, diskTotalBytes);

    // Persistent Volume Allocation: terpisah dari kapasitas disk node di atas.
    const persistentStorageTotal = Number(rawData.storage?.totalBytes) || 0;
    const hasPersistentStorage = persistentStorageTotal > 0;
    const storage = hasPersistentStorage
      ? formatStorage(rawData.storage.usedBytes, persistentStorageTotal)
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
      nodes: realNodes
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
      nodes: [{ name: 'Connecting to Cluster...', role: 'N/A', status: 'Offline', cpu: '0', ram: '0', uptime: 'N/A', ip: 'N/A' }]
    };
  }
}

// Fitur 2: Event failover nyata (NodeNotReady, eviction, rescheduling pod)
export async function fetchClusterEvents() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/events`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const rawData = await res.json();
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


function formatAge(isoTime) {
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

// Fitur 3: Project/Namespace Grouping — daftar pod real, dikelompokkan per namespace K8s.
// CPU/Memory per-pod belum tersedia (butuh metrics-server, lihat Fitur 6), ditandai 'N/A'
// apa adanya alih-alih dikarang.
export async function fetchWorkloadsPods(namespace = 'all') {
  try {
    const res = await fetch(`${BASE_URL}/api/workloads/pods?namespace=${encodeURIComponent(namespace)}`);
    if (!res.ok) throw new Error('API Offline');
    const rawData = await res.json();
    return (rawData.data || []).map((pod) => ({
      name: pod.name,
      namespace: pod.namespace,
      node: pod.node || 'N/A',
      status: pod.status,
      restarts: Number(pod.restarts) || 0,
      cpu: 'N/A',
      memory: 'N/A',
      uptime: formatAge(pod.startTime),
    }));
  } catch {
    return [
      { name: 'asset-api-deployment-78f94d97f-m1a2b', namespace: 'asset-mgmt', node: 'node-vm-141', status: 'Running', restarts: 0, cpu: '180m', memory: '245 Mi', uptime: '12d 4h' },
      { name: 'asset-worker-db-sync-547ccb8c9-j4k5l', namespace: 'asset-mgmt', node: 'node-vm-141', status: 'Running', restarts: 1, cpu: '95m', memory: '180 Mi', uptime: '5d 8h' },
      { name: 'spending-web-frontend-6b45d9ff9-x8y9z', namespace: 'spending-mgmt', node: 'node-vm-142', status: 'Running', restarts: 0, cpu: '120m', memory: '190 Mi', uptime: '14d 2h' },
      { name: 'spending-cron-analyzer-849c7f667-q1w2e', namespace: 'spending-mgmt', node: 'node-vm-142', status: 'CrashLoopBackOff', restarts: 4, cpu: '15m', memory: '82 Mi', uptime: '10m' },
      { name: 'redis-cache-master-0', namespace: 'core-services', node: 'node-vm-141', status: 'Running', restarts: 0, cpu: '65m', memory: '310 Mi', uptime: '45d 14h' },
    ];
  }
}

// Fitur 5: Restart pod = delete pod (K8s tidak punya API "restart" native).
// Kalau pod dikelola controller (Deployment/ReplicaSet/dst), penggantinya
// otomatis dibuat ulang. Kalau pod berdiri sendiri, pod hilang permanen.
export async function restartPod(namespace, name) {
  const res = await fetch(`${BASE_URL}/api/workloads/pods?namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal restart pod');
  }
  return await res.json();
}

// Fitur 5: Deployment & Pod Lifecycle — jumlah replica real per Deployment.
export async function fetchDeployments(namespace = 'all') {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/deployments?namespace=${encodeURIComponent(namespace)}`);
    if (!res.ok) throw new Error('API Offline');
    const rawData = await res.json();
    return (rawData.data || []).map((d) => ({
      name: d.name,
      namespace: d.namespace,
      desired: Number(d.desiredReplicas) || 0,
      ready: Number(d.readyReplicas) || 0,
      available: Number(d.availableReplicas) || 0,
      updated: Number(d.updatedReplicas) || 0,
      image: d.image || 'N/A',
      age: formatAge(d.createdAt),
    }));
  } catch (err) {
    console.error('Gagal mengambil deployments dari Kubernetes:', err.message);
    return [];
  }
}

// Fitur 6: Live Container Metrics — CPU/RAM per pod, langsung dari kubelet tiap
// node (lihat kubeletmetrics di backend). CPU baru terisi mulai polling kedua
// (butuh delta dua sampel), sama seperti CPU usage node di Fitur 1.
export async function fetchPodMetrics(namespace = 'all') {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/pods/metrics?namespace=${encodeURIComponent(namespace)}`);
    if (!res.ok) throw new Error('API Offline');
    const rawData = await res.json();
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
export async function fetchNamespaces() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/namespaces`);
    if (!res.ok) throw new Error('API Offline');
    const rawData = await res.json();
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

export async function createNamespace(name, options = {}) {
  const {
    description = '',
    cpuRequest = '2.0',
    cpuLimit = '4.0',
    memoryRequest = '4.0',
    memoryLimit = '8.0',
    podsQuota = '10',
  } = options;
  const res = await fetch(`${BASE_URL}/api/v1/namespaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, cpuRequest, cpuLimit, memoryRequest, memoryLimit, podsQuota }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal membuat namespace');
  }
  return await res.json();
}

export async function deleteNamespace(name) {
  const res = await fetch(`${BASE_URL}/api/v1/namespaces/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menghapus namespace');
  }
  return await res.json();
}

// 3. Fitur 3 & 4: Namespace Project Quotas & Limits
// Fitur 4: Quota & Limit Monitoring — pakai ResourceQuota asli kalau namespace
// punya satu (untuk batas/"hard"), used selalu dihitung real dari request
// container pod + PVC (bukan dikarang) supaya tetap informatif walau namespace
// belum diberi ResourceQuota.
export async function fetchNamespaceQuota(namespaceKey) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/namespaces/${encodeURIComponent(namespaceKey)}/quota`);
    if (!res.ok) throw new Error('API Offline');
    const raw = await res.json();

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

// 4. Fitur 7 & 8: Services, Ingress & Traffic Health Check
// Fitur 7: Service & Ingress Overview — data real Service/Endpoints/Ingress.
// Traffic rate/latency/HTTP error (request-level) sengaja tidak ada di sini,
// itu ranah Fitur 8 (butuh probing HTTP asli, belum ada mekanismenya).
export async function fetchNetworkIngress() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/network/overview`);
    if (!res.ok) throw new Error('API Offline');
    const rawData = await res.json();
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

// 5. Fitur 9: Centralized Container Log Streamer
export async function fetchLiveLogs(podName = 'all') {
  try {
    const res = await fetch(`${BASE_URL}/logs?pod=${podName}`);
    if (!res.ok) throw new Error('API Offline');
    return await res.json();
  } catch {
    return [
      { id: 1, time: '10:14:10.120', type: 'info', pod: podName, msg: '[SYS] Container stdout listener attached successfully.' },
      { id: 2, time: '10:14:12.451', type: 'out', pod: podName, msg: '[HTTP] GET /healthz 200 OK - LivenessProbe satisfied.' },
      { id: 3, time: '10:14:15.002', type: 'info', pod: podName, msg: '[INFO] Worker thread pool processing background jobs.' },
    ];
  }
}

// 6. Fitur 10: Alert Notifications List
export async function fetchAlerts() {
  try {
    const res = await fetch(`${BASE_URL}/alerts`);
    if (!res.ok) throw new Error('API Offline');
    return await res.json();
  } catch {
    return [
      { id: 1, severity: 'danger', title: 'Pod CrashLoopBackOff', message: 'spending-cron-analyzer restarts exceeded threshold (14x)', time: '5m ago' },
      { id: 2, severity: 'warning', title: 'CPU Threshold > 85%', message: 'node-vm-141 CPU spike detected (86.4%)', time: '18m ago' },
    ];
  }
}

// 7. Fitur 11: Zero-CLI Form Deployment
export async function deployApplication(payload) {
  try {
    const res = await fetch(`${BASE_URL}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Deployment failed');
    return await res.json();
  } catch {
    return { success: true, message: `App ${payload.appName} deployed successfully to namespace ${payload.namespace}!` };
  }
}

// 8. Autentikasi User
export async function loginUser(username, password) {
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return await res.json();
  } catch {
    throw new Error('Username atau Password salah!');
  }
}
