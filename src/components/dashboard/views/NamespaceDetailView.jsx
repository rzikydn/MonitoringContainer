import React from 'react';
import {
  Folder,
  Cpu,
  Activity,
  HardDrive,
  Boxes,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react';

const NAMESPACE_PROFILES = {
  'asset-mgmt': {
    title: 'asset-mgmt',
    subtitle: 'Modul VM 1 (Asset Tracking, Inventory & OCR Scanners)',
    nodeAffinity: 'Primary Node: node-vm-141',
    cpu: { used: '2.8', max: '4.0', unit: 'Cores', pct: 70 },
    memory: { used: '5.6', max: '8.0', unit: 'GB', pct: 70 },
    storage: { used: '140', max: '250', unit: 'GB', pct: 56 },
    pods: { used: '14', max: '20', unit: 'Pods', pct: 70 },
    workloads: [
      { name: 'asset-api-deployment', replicas: '3/3', status: 'Running', cpu: '180m', ram: '245 MiB' },
      { name: 'asset-worker-db-sync', replicas: '1/1', status: 'Running', cpu: '95m', ram: '180 MiB' },
      { name: 'asset-ocr-engine', replicas: '2/2', status: 'Running', cpu: '340m', ram: '620 MiB' },
    ],
  },
  'spending-mgmt': {
    title: 'spending-mgmt',
    subtitle: 'Modul VM 2 (Budgeting, Expense Approvals & Batch Billing)',
    nodeAffinity: 'Primary Node: node-vm-142',
    cpu: { used: '3.1', max: '4.0', unit: 'Cores', pct: 77.5 },
    memory: { used: '6.2', max: '8.0', unit: 'GB', pct: 77.5 },
    storage: { used: '180', max: '300', unit: 'GB', pct: 60 },
    pods: { used: '12', max: '16', unit: 'Pods', pct: 75 },
    workloads: [
      { name: 'spending-web-frontend', replicas: '2/2', status: 'Running', cpu: '120m', ram: '190 MiB' },
      { name: 'spending-cron-analyzer', replicas: '0/1', status: 'CrashLoopBackOff', cpu: '15m', ram: '82 MiB' },
      { name: 'spending-pdf-generator', replicas: '2/2', status: 'Running', cpu: '210m', ram: '410 MiB' },
    ],
  },
  'core-services': {
    title: 'core-services',
    subtitle: 'Cluster Infrastructure (Auth Gateway, Ingress, Shared DB & Redis)',
    nodeAffinity: 'Distributed across VM 141 & 142',
    cpu: { used: '4.2', max: '8.0', unit: 'Cores', pct: 52.5 },
    memory: { used: '12.4', max: '20.0', unit: 'GB', pct: 62 },
    storage: { used: '420', max: '800', unit: 'GB', pct: 52.5 },
    pods: { used: '8', max: '12', unit: 'Pods', pct: 66.7 },
    workloads: [
      { name: 'redis-cache-master', replicas: '1/1', status: 'Running', cpu: '65m', ram: '310 MiB' },
      { name: 'postgres-db-cluster', replicas: '1/1', status: 'Running', cpu: '410m', ram: '1.2 GiB' },
      { name: 'auth-gateway-svc', replicas: '4/4', status: 'Running', cpu: '150m', ram: '280 MiB' },
    ],
  },
};

export default function NamespaceDetailView({ namespaceKey = 'asset-mgmt' }) {
  const profile = NAMESPACE_PROFILES[namespaceKey] || {
    title: namespaceKey,
    subtitle: 'Custom Project Namespace',
    nodeAffinity: 'Cluster Dynamic Allocation',
    cpu: { used: '0.4', max: '2.0', unit: 'Cores', pct: 20 },
    memory: { used: '1.0', max: '4.0', unit: 'GB', pct: 25 },
    storage: { used: '20', max: '100', unit: 'GB', pct: 20 },
    pods: { used: '2', max: '10', unit: 'Pods', pct: 20 },
    workloads: [
      { name: `${namespaceKey}-base-service`, replicas: '1/1', status: 'Running', cpu: '50m', ram: '120 MiB' }
    ],
  };

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder style={{ width: '22px', height: '22px', color: '#284C6E' }} />
            <h2>Namespace: {profile.title}</h2>
            <span className="k8s-badge badge-info">{profile.nodeAffinity}</span>
          </div>
          <p>{profile.subtitle}</p>
        </div>
      </div>

      {/* Fitur 4: Quota & Limit Monitoring Cards */}
      <div>
        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
          Resource Quota & Hard Limits (Fitur 4)
        </div>

        <div className="metrics-stat-grid">
          {/* CPU Quota */}
          <div className="metric-stat-card">
            <div className="metric-card-top">
              <span className="metric-card-title">CPU Quota</span>
              <div className="metric-card-icon-wrap">
                <Cpu style={{ width: '18px', height: '18px' }} />
              </div>
            </div>
            <div className="metric-card-value">
              {profile.cpu.used} / {profile.cpu.max}{' '}
              <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{profile.cpu.unit}</span>
            </div>
            <div className="metric-progress-track">
              <div
                className="metric-progress-fill"
                style={{
                  width: `${profile.cpu.pct}%`,
                  backgroundColor: profile.cpu.pct > 80 ? '#EF4444' : '#284C6E',
                }}
              />
            </div>
            <div className="metric-card-subtext">
              <strong>{profile.cpu.pct}%</strong> limit consumed
            </div>
          </div>

          {/* Memory Limit */}
          <div className="metric-stat-card">
            <div className="metric-card-top">
              <span className="metric-card-title">Memory Limit</span>
              <div className="metric-card-icon-wrap">
                <Activity style={{ width: '18px', height: '18px' }} />
              </div>
            </div>
            <div className="metric-card-value">
              {profile.memory.used} / {profile.memory.max}{' '}
              <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{profile.memory.unit}</span>
            </div>
            <div className="metric-progress-track">
              <div
                className="metric-progress-fill"
                style={{
                  width: `${profile.memory.pct}%`,
                  backgroundColor: profile.memory.pct > 80 ? '#EF4444' : '#0284C7',
                }}
              />
            </div>
            <div className="metric-card-subtext">
              <strong>{profile.memory.pct}%</strong> memory allocated
            </div>
          </div>

          {/* Storage PVC */}
          <div className="metric-stat-card">
            <div className="metric-card-top">
              <span className="metric-card-title">Storage PVC</span>
              <div className="metric-card-icon-wrap">
                <HardDrive style={{ width: '18px', height: '18px' }} />
              </div>
            </div>
            <div className="metric-card-value">
              {profile.storage.used} / {profile.storage.max}{' '}
              <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{profile.storage.unit}</span>
            </div>
            <div className="metric-progress-track">
              <div
                className="metric-progress-fill"
                style={{ width: `${profile.storage.pct}%`, backgroundColor: '#10B981' }}
              />
            </div>
            <div className="metric-card-subtext">
              <strong>{profile.storage.pct}%</strong> volume quota
            </div>
          </div>

          {/* Pods Quota */}
          <div className="metric-stat-card">
            <div className="metric-card-top">
              <span className="metric-card-title">Max Pods Quota</span>
              <div className="metric-card-icon-wrap">
                <Boxes style={{ width: '18px', height: '18px' }} />
              </div>
            </div>
            <div className="metric-card-value">
              {profile.pods.used} / {profile.pods.max}{' '}
              <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{profile.pods.unit}</span>
            </div>
            <div className="metric-progress-track">
              <div
                className="metric-progress-fill"
                style={{ width: `${profile.pods.pct}%`, backgroundColor: '#F59E0B' }}
              />
            </div>
            <div className="metric-card-subtext">
              {profile.pods.used} of {profile.pods.max} active pods in namespace
            </div>
          </div>
        </div>
      </div>

      {/* Workloads Table in this namespace */}
      <div className="node-box">
        <div className="node-box-header">
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
            Workloads Active in [{profile.title}]
          </h3>
          <span className="k8s-badge badge-info">{profile.workloads.length} Deployments</span>
        </div>

        <div className="table-responsive-wrapper">
          <table className="k8s-table">
            <thead>
              <tr>
                <th>Deployment Name</th>
                <th>Replicas</th>
                <th>Status</th>
                <th>CPU Used</th>
                <th>RAM Used</th>
              </tr>
            </thead>
            <tbody>
              {profile.workloads.map((wl) => (
                <tr key={wl.name}>
                  <td style={{ fontWeight: 600, color: '#0F172A' }}>{wl.name}</td>
                  <td>{wl.replicas}</td>
                  <td>
                    {wl.status === 'Running' ? (
                      <span className="k8s-badge badge-success">
                        <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                        Running
                      </span>
                    ) : (
                      <span className="k8s-badge badge-danger">
                        <AlertTriangle style={{ width: '12px', height: '12px' }} />
                        {wl.status}
                      </span>
                    )}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{wl.cpu}</td>
                  <td style={{ fontFamily: 'monospace' }}>{wl.ram}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
