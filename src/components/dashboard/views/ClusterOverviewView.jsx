import React from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Server,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';

export default function ClusterOverviewView({ onNavigate }) {
  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Cluster Overview & Aggregated Capacity</h2>
          <p>Real-time telemetry and node health across VM 141 & VM 142 (Production)</p>
        </div>
        <div className="view-actions-group">
          <span className="k8s-badge badge-success">
            <ShieldCheck style={{ width: '13px', height: '13px' }} />
            Failover Quorum OK
          </span>
          <button className="btn-dash btn-dash-secondary btn-dash-sm">
            <RefreshCw style={{ width: '13px', height: '13px' }} />
            Sync Metrics
          </button>
        </div>
      </div>

      {/* Fitur 1: Aggregated Resource Capacity */}
      <div className="metrics-stat-grid">
        {/* CPU Capacity */}
        <div className="metric-stat-card">
          <div className="metric-card-top">
            <span className="metric-card-title">Total CPU Usage</span>
            <div className="metric-card-icon-wrap">
              <Cpu style={{ width: '18px', height: '18px' }} />
            </div>
          </div>
          <div className="metric-card-value">16.4 / 24 <span style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 500 }}>Cores</span></div>
          <div className="metric-progress-track">
            <div
              className="metric-progress-fill"
              style={{ width: '68.3%', backgroundColor: '#284C6E' }}
            />
          </div>
          <div className="metric-card-subtext">
            <strong>68.3%</strong> capacity across VM 141 & 142
          </div>
        </div>

        {/* RAM Capacity */}
        <div className="metric-stat-card">
          <div className="metric-card-top">
            <span className="metric-card-title">Aggregated Memory</span>
            <div className="metric-card-icon-wrap">
              <Activity style={{ width: '18px', height: '18px' }} />
            </div>
          </div>
          <div className="metric-card-value">42.8 / 64 <span style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 500 }}>GB</span></div>
          <div className="metric-progress-track">
            <div
              className="metric-progress-fill"
              style={{ width: '66.8%', backgroundColor: '#0284C7' }}
            />
          </div>
          <div className="metric-card-subtext">
            <strong>66.8%</strong> in use (21.2 GB available)
          </div>
        </div>

        {/* Storage Capacity */}
        <div className="metric-stat-card">
          <div className="metric-card-top">
            <span className="metric-card-title">Persistent Storage</span>
            <div className="metric-card-icon-wrap">
              <HardDrive style={{ width: '18px', height: '18px' }} />
            </div>
          </div>
          <div className="metric-card-value">1.2 / 2.0 <span style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 500 }}>TB</span></div>
          <div className="metric-progress-track">
            <div
              className="metric-progress-fill"
              style={{ width: '60%', backgroundColor: '#10B981' }}
            />
          </div>
          <div className="metric-card-subtext">
            <strong>60.0%</strong> NVMe Storage utilized
          </div>
        </div>

        {/* Active Pods Count */}
        <div className="metric-stat-card">
          <div className="metric-card-top">
            <span className="metric-card-title">Pods Capacity</span>
            <div className="metric-card-icon-wrap">
              <Server style={{ width: '18px', height: '18px' }} />
            </div>
          </div>
          <div className="metric-card-value">38 / 50 <span style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 500 }}>Pods</span></div>
          <div className="metric-progress-track">
            <div
              className="metric-progress-fill"
              style={{ width: '76%', backgroundColor: '#F59E0B' }}
            />
          </div>
          <div className="metric-card-subtext">
            37 Running • 1 CrashLoopBackOff
          </div>
        </div>
      </div>

      {/* Fitur 2: Node Status & Failover Indicator */}
      <div className="node-box">
        <div className="node-box-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
              Cluster Nodes & Failover Readiness
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
              High-Availability Dual-Node Setup (VM 141 Leader & VM 142 Standby / Worker)
            </p>
          </div>
          <span className="k8s-badge badge-success">
            <CheckCircle2 style={{ width: '13px', height: '13px' }} />
            All Nodes Ready
          </span>
        </div>

        <div className="nodes-grid">
          {/* Node 141 */}
          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '16px',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server style={{ width: '18px', height: '18px', color: '#284C6E' }} />
                  <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.96rem' }}>
                    node-vm-141
                  </span>
                  <span className="k8s-badge badge-info">Active Leader</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px', fontFamily: 'monospace' }}>
                  IP: 192.168.1.141 • Ubuntu 24.04 LTS
                </div>
              </div>
              <span className="k8s-badge badge-success">
                <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                Ready
              </span>
            </div>

            <div className="node-specs-row">
              <div className="node-spec-item">
                <span className="label">CPU Usage</span>
                <span className="val">8.6 / 12 Cores (72%)</span>
              </div>
              <div className="node-spec-item">
                <span className="label">RAM Usage</span>
                <span className="val">21.8 / 32 GB (68%)</span>
              </div>
              <div className="node-spec-item">
                <span className="label">Uptime</span>
                <span className="val">45d 14h 22m</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748B' }}>
              <span>Role: Control Plane & Worker (asset-mgmt)</span>
              <span style={{ color: '#10B981', fontWeight: 600 }}>Heartbeat: 2s ago</span>
            </div>
          </div>

          {/* Node 142 */}
          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '16px',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server style={{ width: '18px', height: '18px', color: '#0284C7' }} />
                  <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.96rem' }}>
                    node-vm-142
                  </span>
                  <span className="k8s-badge badge-muted">Worker / Failover</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px', fontFamily: 'monospace' }}>
                  IP: 192.168.1.142 • Ubuntu 24.04 LTS
                </div>
              </div>
              <span className="k8s-badge badge-success">
                <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                Ready
              </span>
            </div>

            <div className="node-specs-row">
              <div className="node-spec-item">
                <span className="label">CPU Usage</span>
                <span className="val">7.8 / 12 Cores (65%)</span>
              </div>
              <div className="node-spec-item">
                <span className="label">RAM Usage</span>
                <span className="val">21.0 / 32 GB (65%)</span>
              </div>
              <div className="node-spec-item">
                <span className="label">Uptime</span>
                <span className="val">45d 14h 18m</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748B' }}>
              <span>Role: Worker (spending-mgmt & core)</span>
              <span style={{ color: '#10B981', fontWeight: 600 }}>Failover Sync: Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Access to Workloads & Namespaces */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#0F172A' }}>
              Workloads & Live Pods
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
              37 Pods Healthy, 1 Pod in CrashLoopBackOff
            </div>
          </div>
          <button
            onClick={() => onNavigate && onNavigate('workloads-pods')}
            className="btn-dash btn-dash-primary btn-dash-sm"
          >
            View Workloads
            <ArrowUpRight style={{ width: '14px', height: '14px' }} />
          </button>
        </div>

        <div
          style={{
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#0F172A' }}>
              Zero-CLI Deploy
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
              Deploy containerized apps in 3 clicks
            </div>
          </div>
          <button
            onClick={() => onNavigate && onNavigate('deploy-app')}
            className="btn-dash btn-dash-secondary btn-dash-sm"
          >
            Deploy App
            <ArrowUpRight style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
