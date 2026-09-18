import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Database, Server, ShieldCheck, CheckCircle2, RefreshCw, ArrowUpRight } from 'lucide-react';
import { fetchClusterOverview } from '../../../services/api';

export default function ClusterOverviewView({ onNavigate }) {
  const [clusterData, setClusterData] = useState(null);

  useEffect(() => {
    fetchClusterOverview().then((data) => setClusterData(data));

    const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 menit
    const intervalId = setInterval(() => {
      fetchClusterOverview().then((data) => setClusterData(data));
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  if (!clusterData) return <div style={{ padding: '20px', color: '#64748B' }}>Loading Cluster Telemetry...</div>;

  const notReadyNodes = clusterData.nodes.filter((n) => n.status !== 'Ready');
  const allNodesReady = notReadyNodes.length === 0;
  const podsMax = clusterData.podsCapacity.max || 0;
  const podsPercent = podsMax > 0 ? (clusterData.podsCapacity.active / podsMax) * 100 : 0;

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Cluster Overview & Aggregated Capacity</h2>
          <p>Real-time telemetry and node health across VM 141 & VM 142 (Production)</p>
        </div>
        <div className="view-actions-group">
          <span className={`k8s-badge ${allNodesReady ? 'badge-success' : 'badge-danger'}`}>
            <ShieldCheck style={{ width: '13px', height: '13px' }} />
            {allNodesReady ? 'Failover Quorum OK' : `${notReadyNodes.length} Node${notReadyNodes.length > 1 ? 's' : ''} Down`}
          </span>
          <button onClick={() => fetchClusterOverview().then(setClusterData)} className="btn-dash btn-dash-secondary btn-dash-sm">
            <RefreshCw style={{ width: '13px', height: '13px' }} /> Sync Metrics
          </button>
        </div>
      </div>

      {/* Fitur 1: Aggregated Resource Capacity (Dynamic Data) */}
      <div className="metrics-stat-grid">
        {/* CPU */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Total CPU Usage</span><Cpu style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.cpu.used} / {clusterData.cpu.total} <span style={{ fontSize: '0.9rem', color: '#64748B' }}>{clusterData.cpu.unit}</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${clusterData.cpu.percent}%`, backgroundColor: '#284C6E' }} /></div>
          <div className="metric-card-subtext">
            {clusterData.metricsAvailable
              ? <><strong>{clusterData.cpu.percent}%</strong> capacity utilized</>
              : <span style={{ color: '#B45309' }}>metrics-server not installed — usage unavailable</span>}
          </div>
        </div>

        {/* RAM */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Aggregated Memory</span><Activity style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.ram.used} / {clusterData.ram.total} <span style={{ fontSize: '0.9rem', color: '#64748B' }}>{clusterData.ram.unit}</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${clusterData.ram.percent}%`, backgroundColor: '#0284C7' }} /></div>
          <div className="metric-card-subtext">
            {clusterData.metricsAvailable
              ? <><strong>{clusterData.ram.percent}%</strong> in use ({clusterData.ram.available} available)</>
              : <span style={{ color: '#B45309' }}>metrics-server not installed — usage unavailable</span>}
          </div>
        </div>

        {/* Cluster Disk Capacity: total dari ephemeral-storage node, usage dari node-exporter */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Cluster Disk Capacity</span><HardDrive style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.disk.used} / {clusterData.disk.total} <span style={{ fontSize: '0.9rem', color: '#64748B' }}>{clusterData.disk.unit}</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${clusterData.disk.percent}%`, backgroundColor: '#10B981' }} /></div>
          <div className="metric-card-subtext">
            {clusterData.metricsAvailable
              ? <><strong>{clusterData.disk.percent}%</strong> {clusterData.disk.source}</>
              : <span style={{ color: '#B45309' }}>node-exporter unavailable — usage unavailable</span>}
          </div>
        </div>

        {/* Persistent Volume Allocation: metrik terpisah dari kapasitas disk node di atas */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Persistent Volume Allocation</span><Database style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.storage.used} / {clusterData.storage.total} <span style={{ fontSize: '0.9rem', color: '#64748B' }}>{clusterData.storage.unit}</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${clusterData.storage.percent}%`, backgroundColor: '#7C3AED' }} /></div>
          <div className="metric-card-subtext"><strong>{clusterData.storage.percent}%</strong> {clusterData.storage.source}</div>
        </div>

        {/* Pods Count */}
        <div className="metric-stat-card">
          <div className="metric-card-top"><span className="metric-card-title">Pods Capacity</span><Server style={{ width: '18px', height: '18px' }} /></div>
          <div className="metric-card-value">{clusterData.podsCapacity.active} / {clusterData.podsCapacity.max} <span style={{ fontSize: '0.9rem', color: '#64748B' }}>Pods</span></div>
          <div className="metric-progress-track"><div className="metric-progress-fill" style={{ width: `${podsPercent}%`, backgroundColor: '#F59E0B' }} /></div>
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
            <div key={node.name} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px', backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server style={{ width: '18px', height: '18px', color: '#284C6E' }} />
                    <span style={{ fontWeight: 700 }}>{node.name}</span>
                    <span className="k8s-badge badge-info">{node.role}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px', fontFamily: 'monospace' }}>IP: {node.ip}</div>
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
    </div>
  );
}
