import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Database, Server, ShieldCheck, CheckCircle2, RefreshCw, History, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { apiClient } from '../../../services/api';

const EVENT_REASON_STYLE = {
  NodeNotReady: { badge: 'badge-danger', icon: AlertTriangle, label: 'Node Down' },
  NodeReady: { badge: 'badge-success', icon: CheckCircle2, label: 'Node Recovered' },
  NodeNotSchedulable: { badge: 'badge-warning', icon: AlertTriangle, label: 'Node Cordoned' },
  NodeSchedulable: { badge: 'badge-success', icon: CheckCircle2, label: 'Node Uncordoned' },
  Killing: { badge: 'badge-warning', icon: AlertTriangle, label: 'Pod Terminated' },
  Preempted: { badge: 'badge-warning', icon: AlertTriangle, label: 'Pod Preempted' },
  Evicted: { badge: 'badge-danger', icon: AlertTriangle, label: 'Pod Evicted' },
  TaintManagerEviction: { badge: 'badge-danger', icon: AlertTriangle, label: 'Evicted (Node Taint)' },
  FailedScheduling: { badge: 'badge-danger', icon: AlertTriangle, label: 'Scheduling Failed' },
  Scheduled: { badge: 'badge-success', icon: ArrowRightLeft, label: 'Rescheduled' },
};

function formatRelativeTime(isoTime) {
  if (!isoTime) return 'Unknown time';
  const then = new Date(isoTime).getTime();
  if (Number.isNaN(then)) return 'Unknown time';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

// Sama seperti threshold di AlertService (backend): warna cuma berubah jadi
// merah kalau memang mendekati kapasitas, bukan warna hias per-kartu — supaya
// warna berarti "perhatikan ini", bukan sekadar dekorasi (Fitur 1).
const NEAR_CAPACITY_PERCENT = 85;
function fillColor(percent) {
  return percent >= NEAR_CAPACITY_PERCENT ? 'var(--danger-strong)' : 'var(--accent)';
}

export default function ClusterOverviewView() {
  const [clusterData, setClusterData] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const refresh = () => {
      apiClient.fetchClusterOverview().then((data) => setClusterData(data));
      apiClient.fetchClusterEvents().then((data) => setEvents(data));
    };

    refresh();

    const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 menit
    const intervalId = setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  if (!clusterData) return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading cluster overview...</div>;

  const notReadyNodes = clusterData.nodes.filter((n) => n.status !== 'Ready');
  const allNodesReady = notReadyNodes.length === 0;
  const podsMax = clusterData.podsCapacity.max || 0;
  const podsPercent = podsMax > 0 ? (clusterData.podsCapacity.active / podsMax) * 100 : 0;

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Cluster Overview</h2>
          <p>Live resource usage and node health across {clusterData.nodes.length} node{clusterData.nodes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="view-actions-group">
          <span className={`k8s-badge ${allNodesReady ? 'badge-success' : 'badge-danger'}`}>
            <ShieldCheck style={{ width: '13px', height: '13px' }} />
            {allNodesReady ? 'Failover Quorum OK' : `${notReadyNodes.length} Node${notReadyNodes.length > 1 ? 's' : ''} Down`}
          </span>
          <button onClick={() => apiClient.fetchClusterOverview().then(setClusterData)} className="btn-dash btn-dash-secondary btn-dash-sm">
            <RefreshCw style={{ width: '13px', height: '13px' }} /> Sync Metrics
          </button>
        </div>
      </div>

      {/* Fitur 1: Aggregated Resource Capacity (Dynamic Data) */}
      <div className="metrics-stat-grid">
        {/* CPU */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Total CPU Usage</span><Cpu style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.cpu.used} / {clusterData.cpu.total} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{clusterData.cpu.unit}</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${clusterData.cpu.percent}%`, backgroundColor: fillColor(clusterData.cpu.percent) }} /></div>
          <div className="metric-card-subtext">
            {clusterData.metricsAvailable
              ? <><strong>{clusterData.cpu.percent}%</strong> capacity utilized</>
              : <span style={{ color: 'var(--warning-strong)' }}>Usage data unavailable</span>}
          </div>
        </div>

        {/* RAM */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Aggregated Memory</span><Activity style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.ram.used} / {clusterData.ram.total} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{clusterData.ram.unit}</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${clusterData.ram.percent}%`, backgroundColor: fillColor(clusterData.ram.percent) }} /></div>
          <div className="metric-card-subtext">
            {clusterData.metricsAvailable
              ? <><strong>{clusterData.ram.percent}%</strong> in use ({clusterData.ram.available} available)</>
              : <span style={{ color: 'var(--warning-strong)' }}>Usage data unavailable</span>}
          </div>
        </div>

        {/* Cluster Disk Capacity: total dari ephemeral-storage node, usage dari node-exporter */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Cluster Disk Capacity</span><HardDrive style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.disk.used} / {clusterData.disk.total} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{clusterData.disk.unit}</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${clusterData.disk.percent}%`, backgroundColor: fillColor(clusterData.disk.percent) }} /></div>
          <div className="metric-card-subtext">
            {clusterData.metricsAvailable
              ? <><strong>{clusterData.disk.percent}%</strong> {clusterData.disk.source}</>
              : <span style={{ color: 'var(--warning-strong)' }}>Usage data unavailable</span>}
          </div>
        </div>

        {/* Persistent Volume Allocation: metrik terpisah dari kapasitas disk node di atas */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Persistent Volume Allocation</span><Database style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.storage.used} / {clusterData.storage.total} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{clusterData.storage.unit}</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${clusterData.storage.percent}%`, backgroundColor: fillColor(clusterData.storage.percent) }} /></div>
          <div className="metric-card-subtext"><strong>{clusterData.storage.percent}%</strong> {clusterData.storage.source}</div>
        </div>

        {/* Pods Count */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Pods Capacity</span><Server style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.podsCapacity.active} / {clusterData.podsCapacity.max} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Pods</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${podsPercent}%`, backgroundColor: fillColor(podsPercent) }} /></div>
          <div className="metric-card-subtext">{clusterData.podsCapacity.running} Running • {clusterData.podsCapacity.crash} CrashLoopBackOff</div>
        </div>
      </div>

      {/* Fitur 2: Node Status & Failover (Dynamic Loop) */}
      <div className="node-box">
        <div className="node-box-header">
          <div><h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Cluster Nodes & Failover Readiness</h3></div>
          <span className={`k8s-badge ${allNodesReady ? 'badge-success' : 'badge-danger'}`}>
            <CheckCircle2 style={{ width: '13px', height: '13px' }} />
            {allNodesReady ? 'All Nodes Ready' : `${notReadyNodes.length} Node${notReadyNodes.length > 1 ? 's' : ''} NotReady`}
          </span>
        </div>
        <div className="nodes-grid">
          {clusterData.nodes.map((node) => (
            <div key={node.name} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', backgroundColor: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server style={{ width: '18px', height: '18px', color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 700 }}>{node.name}</span>
                    <span className="k8s-badge badge-info">{node.role}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace' }}>IP: {node.ip}</div>
                </div>
                <span className={`k8s-badge ${node.status === 'Ready' ? 'badge-success' : 'badge-danger'}`}><CheckCircle2 style={{ width: '12px', height: '12px' }} /> {node.status}</span>
              </div>
              <div className="node-specs-row">
                <div className="node-spec-item"><span className="label">CPU Usage</span><span className="val">{node.cpu}</span></div>
                <div className="node-spec-item"><span className="label">RAM Usage</span><span className="val">{node.ram}</span></div>
                <div className="node-spec-item"><span className="label">Uptime</span><span className="val">{node.uptime}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fitur 2: Failover & Rescheduling Events (data asli dari K8s Events API) */}
      <div className="node-box">
        <div className="node-box-header">
          <div><h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Recent Failover & Scheduling Events</h3></div>
          <span className="k8s-badge badge-info"><History style={{ width: '13px', height: '13px' }} /> Live from Kubernetes Events</span>
        </div>
        {events.length === 0 ? (
          <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No recent failover or scheduling events.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
            {events.map((ev) => {
              const style = EVENT_REASON_STYLE[ev.reason] || { badge: 'badge-info', icon: History, label: ev.reason || 'Event' };
              const Icon = style.icon;
              return (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <span className={`k8s-badge ${style.badge}`} style={{ flexShrink: 0 }}>
                    <Icon style={{ width: '12px', height: '12px' }} /> {style.label}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{ev.message}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                      {ev.object}{ev.node ? ` · node: ${ev.node}` : ''} · {formatRelativeTime(ev.time)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
