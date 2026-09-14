import React, { useState } from 'react';
import {
  Boxes,
  RotateCw,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

const INITIAL_PODS = [
  {
    name: 'asset-api-deployment-78f94d97f-m1a2b',
    namespace: 'asset-mgmt',
    node: 'node-vm-141',
    status: 'Running',
    restarts: 0,
    cpu: '180m',
    memory: '245 Mi',
    uptime: '12d 4h',
  },
  {
    name: 'asset-worker-db-sync-547ccb8c9-j4k5l',
    namespace: 'asset-mgmt',
    node: 'node-vm-141',
    status: 'Running',
    restarts: 1,
    cpu: '95m',
    memory: '180 Mi',
    uptime: '5d 8h',
  },
  {
    name: 'spending-web-frontend-6b45d9ff9-x8y9z',
    namespace: 'spending-mgmt',
    node: 'node-vm-142',
    status: 'Running',
    restarts: 0,
    cpu: '120m',
    memory: '190 Mi',
    uptime: '14d 2h',
  },
  {
    name: 'spending-cron-analyzer-849c7f667-q1w2e',
    namespace: 'spending-mgmt',
    node: 'node-vm-142',
    status: 'CrashLoopBackOff',
    restarts: 4,
    cpu: '15m',
    memory: '82 Mi',
    uptime: '10m',
  },
  {
    name: 'redis-cache-master-0',
    namespace: 'core-services',
    node: 'node-vm-141',
    status: 'Running',
    restarts: 0,
    cpu: '65m',
    memory: '310 Mi',
    uptime: '45d 14h',
  },
  {
    name: 'postgres-db-cluster-0',
    namespace: 'core-services',
    node: 'node-vm-142',
    status: 'Running',
    restarts: 0,
    cpu: '410m',
    memory: '1.2 Gi',
    uptime: '45d 14h',
  },
];

export default function WorkloadsPodsView({ onNavigateToLogs }) {
  const [search, setSearch] = useState('');
  const [filterNamespace, setFilterNamespace] = useState('All');
  const [pods, setPods] = useState(INITIAL_PODS);

  const filteredPods = pods.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.namespace.toLowerCase().includes(search.toLowerCase());
    const matchNamespace =
      filterNamespace === 'All' || p.namespace === filterNamespace;
    return matchSearch && matchNamespace;
  });

  const handleRestart = (podName) => {
    setPods((prev) =>
      prev.map((p) =>
        p.name === podName
          ? { ...p, status: 'Running', restarts: p.restarts + 1 }
          : p
      )
    );
  };

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Workloads & Pods Live Metrics</h2>
          <p>
            Real-time status, restart counters, and resource telemetry per container pod
          </p>
        </div>
        <div className="view-actions-group">
          <span className="k8s-badge badge-warning">
            <AlertTriangle style={{ width: '13px', height: '13px' }} />
            1 CrashLoopBackOff Pod Detected
          </span>
        </div>
      </div>

      {/* Filter Row */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: '#F8FAFC',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '15px',
              height: '15px',
              color: '#94A3B8',
            }}
          />
          <input
            type="text"
            placeholder="Search pod by name or namespace..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="dash-form-input"
            style={{ width: '100%', paddingLeft: '34px', boxSizing: 'border-box' }}
          />
        </div>

        <select
          value={filterNamespace}
          onChange={(e) => setFilterNamespace(e.target.value)}
          className="dash-form-select"
          style={{ width: '180px' }}
        >
          <option value="All">All Namespaces</option>
          <option value="asset-mgmt">asset-mgmt (VM 1)</option>
          <option value="spending-mgmt">spending-mgmt (VM 2)</option>
          <option value="core-services">core-services</option>
        </select>
      </div>

      {/* Pods Table (Fitur 5 & 6) */}
      <div className="table-responsive-wrapper">
        <table className="k8s-table">
          <thead>
            <tr>
              <th>Pod Name & Deployment</th>
              <th>Namespace</th>
              <th>Node</th>
              <th>Status</th>
              <th>Restarts</th>
              <th>CPU Live</th>
              <th>Memory Live</th>
              <th>Age</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPods.map((pod) => (
              <tr key={pod.name}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Boxes style={{ width: '16px', height: '16px', color: '#284C6E', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{pod.name}</span>
                  </div>
                </td>
                <td>
                  <span className="k8s-badge badge-muted">{pod.namespace}</span>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748B' }}>
                  {pod.node}
                </td>
                <td>
                  {pod.status === 'Running' ? (
                    <span className="k8s-badge badge-success">
                      <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                      Running
                    </span>
                  ) : (
                    <span className="k8s-badge badge-danger">
                      <AlertTriangle style={{ width: '12px', height: '12px' }} />
                      CrashLoopBackOff
                    </span>
                  )}
                </td>
                <td>
                  <span
                    style={{
                      fontWeight: 600,
                      color: pod.restarts > 0 ? '#B91C1C' : '#15803D',
                    }}
                  >
                    {pod.restarts}x
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>
                      {pod.cpu}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>
                      {pod.memory}
                    </span>
                  </div>
                </td>
                <td style={{ color: '#64748B', fontSize: '0.8rem' }}>{pod.uptime}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleRestart(pod.name)}
                      className="btn-dash btn-dash-secondary btn-dash-sm"
                      title="Quick Restart Pod"
                    >
                      <RotateCw style={{ width: '12px', height: '12px' }} />
                      Restart
                    </button>
                    <button
                      onClick={() => onNavigateToLogs && onNavigateToLogs(pod.name)}
                      className="btn-dash btn-dash-primary btn-dash-sm"
                      title="Stream Container Live Logs"
                    >
                      <Terminal style={{ width: '12px', height: '12px' }} />
                      Logs
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
