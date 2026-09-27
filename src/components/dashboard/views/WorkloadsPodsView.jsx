import React, { useState, useEffect } from 'react';
import {
  Boxes,
  RotateCw,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { apiClient } from '../../../services/api';

const POD_STATUS_STYLE = {
  Running: 'badge-success',
  CrashLoopBackOff: 'badge-danger',
  Failed: 'badge-danger',
  Pending: 'badge-warning',
  Succeeded: 'badge-info',
};

export default function WorkloadsPodsView({ onNavigateToLogs }) {
  const [search, setSearch] = useState('');
  const [filterNamespace, setFilterNamespace] = useState('All');
  const [pods, setPods] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [restartingPod, setRestartingPod] = useState(null);
  const [podMetrics, setPodMetrics] = useState({ metricsAvailable: false, byKey: {} });
  const [loading, setLoading] = useState(true);

  const loadPods = () => apiClient.fetchWorkloadsPods().then((data) => setPods(data));

  useEffect(() => {
    Promise.all([loadPods(), apiClient.fetchDeployments().then((data) => setDeployments(data))]).finally(() => setLoading(false));
    apiClient.fetchNamespaces().then((data) => setNamespaces(data));

    const loadMetrics = () => apiClient.fetchPodMetrics().then((data) => setPodMetrics(data));
    loadMetrics();
    const METRICS_REFRESH_MS = 15 * 1000; // "live" — polling lebih sering dari cluster overview
    const intervalId = setInterval(loadMetrics, METRICS_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, []);

  const filteredPods = pods.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.namespace.toLowerCase().includes(search.toLowerCase());
    const matchNamespace =
      filterNamespace === 'All' || p.namespace === filterNamespace;
    return matchSearch && matchNamespace;
  });

  const filteredDeployments = deployments.filter((d) =>
    filterNamespace === 'All' || d.namespace === filterNamespace
  );

  const crashCount = pods.filter((p) => p.status === 'CrashLoopBackOff').length;

  const handleRestart = async (pod) => {
    if (!window.confirm(`Restart pod "${pod.name}"? Kalau pod ini dikelola Deployment/ReplicaSet, penggantinya otomatis dibuat. Kalau pod berdiri sendiri, pod akan hilang permanen.`)) {
      return;
    }
    setRestartingPod(pod.name);
    try {
      await apiClient.restartPod(pod.namespace, pod.name);
      await loadPods();
    } catch (err) {
      alert(`Gagal restart pod: ${err.message}`);
    } finally {
      setRestartingPod(null);
    }
  };

  if (loading) return <div style={{ padding: '20px', color: '#64748B' }}>Loading workloads...</div>;

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
          {crashCount > 0 && (
            <span className="k8s-badge badge-warning">
              <AlertTriangle style={{ width: '13px', height: '13px' }} />
              {crashCount} CrashLoopBackOff Pod{crashCount > 1 ? 's' : ''} Detected
            </span>
          )}
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
          {namespaces.map((ns) => (
            <option key={ns.name} value={ns.name}>{ns.name} ({ns.podCount} pods)</option>
          ))}
        </select>
      </div>

      {/* Deployments Table — jumlah replica real (Fitur 5) */}
      <div className="node-box">
        <div className="node-box-header">
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>Deployments</h3>
          <span className="k8s-badge badge-info">{filteredDeployments.length} Deployments</span>
        </div>
        <div className="table-responsive-wrapper">
          <table className="k8s-table">
            <thead>
              <tr>
                <th>Deployment Name</th>
                <th>Namespace</th>
                <th>Replicas (Ready/Desired)</th>
                <th>Image</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeployments.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: '#64748B', textAlign: 'center', padding: '16px' }}>
                    No deployments found.
                  </td>
                </tr>
              ) : (
                filteredDeployments.map((d) => (
                  <tr key={`${d.namespace}/${d.name}`}>
                    <td style={{ fontWeight: 600, color: '#0F172A' }}>{d.name}</td>
                    <td><span className="k8s-badge badge-muted">{d.namespace}</span></td>
                    <td>
                      <span style={{ fontWeight: 600, color: d.ready < d.desired ? '#B91C1C' : '#15803D' }}>
                        {d.ready}/{d.desired}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748B' }}>{d.image}</td>
                    <td style={{ color: '#64748B', fontSize: '0.8rem' }}>{d.age}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pods Table (Fitur 5 & 6) */}
      <div className="node-box">
        <div className="node-box-header">
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>Pods</h3>
          <span className="k8s-badge badge-info">{filteredPods.length} Pods</span>
        </div>
        <div className="table-responsive-wrapper">
        <table className="k8s-table">
          <thead>
            <tr>
              <th>Pod Name & Deployment</th>
              <th>Namespace</th>
              <th>Node</th>
              <th>Status</th>
              <th>Restarts</th>
              <th>Probes</th>
              <th>CPU Live</th>
              <th>Memory Live</th>
              <th>Age</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPods.map((pod) => {
              const metric = podMetrics.byKey[`${pod.namespace}/${pod.name}`];
              const cpuDisplay = podMetrics.metricsAvailable && metric ? `${(metric.cpuMilli / 1000).toFixed(2)} Cores` : 'N/A';
              const memoryDisplay = podMetrics.metricsAvailable && metric ? `${(metric.memoryBytes / (1024 ** 2)).toFixed(0)} Mi` : 'N/A';
              return (
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
                  <span className={`k8s-badge ${POD_STATUS_STYLE[pod.status] || 'badge-muted'}`}>
                    {pod.status === 'Running' ? (
                      <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                    ) : (
                      <AlertTriangle style={{ width: '12px', height: '12px' }} />
                    )}
                    {pod.status}
                  </span>
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
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span
                      title={pod.hasLivenessProbe ? 'Liveness probe configured' : 'No liveness probe configured'}
                      className={`k8s-badge ${pod.hasLivenessProbe ? (pod.ready ? 'badge-success' : 'badge-danger') : 'badge-muted'}`}
                      style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                    >
                      L
                    </span>
                    <span
                      title={pod.hasReadinessProbe ? 'Readiness probe configured' : 'No readiness probe configured'}
                      className={`k8s-badge ${pod.hasReadinessProbe ? (pod.ready ? 'badge-success' : 'badge-danger') : 'badge-muted'}`}
                      style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                    >
                      R
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>
                      {cpuDisplay}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>
                      {memoryDisplay}
                    </span>
                  </div>
                </td>
                <td style={{ color: '#64748B', fontSize: '0.8rem' }}>{pod.uptime}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleRestart(pod)}
                      className="btn-dash btn-dash-secondary btn-dash-sm"
                      title="Restart Pod (delete → dibuat ulang otomatis kalau dikelola controller)"
                      disabled={restartingPod === pod.name}
                    >
                      <RotateCw style={{ width: '12px', height: '12px' }} />
                      {restartingPod === pod.name ? 'Restarting...' : 'Restart'}
                    </button>
                    <button
                      onClick={() => onNavigateToLogs && onNavigateToLogs(pod.namespace, pod.name)}
                      className="btn-dash btn-dash-primary btn-dash-sm"
                      title="Stream Container Live Logs"
                    >
                      <Terminal style={{ width: '12px', height: '12px' }} />
                      Logs
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
