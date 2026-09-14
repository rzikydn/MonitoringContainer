import React, { useState } from 'react';
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Filter,
  Clock,
  ShieldAlert,
} from 'lucide-react';

const ALERTS_DATA = [
  {
    id: 1,
    severity: 'critical',
    title: 'Pod in CrashLoopBackOff detected',
    target: 'pod/spending-cron-analyzer-849c7f667-q1w2e',
    namespace: 'spending-mgmt',
    node: 'node-vm-142',
    time: '12 minutes ago',
    details: 'Container exited with code 1 (Connection refused to RabbitMQ). Restart count has exceeded 4x.',
  },
  {
    id: 2,
    severity: 'warning',
    title: 'Resource Limit Threshold Warning (> 85%)',
    target: 'node/node-vm-141 (Memory)',
    namespace: 'cluster-wide',
    node: 'node-vm-141',
    time: '45 minutes ago',
    details: 'Node RAM consumption peaked at 86.4% (27.6 GB / 32 GB). Automated pod throttling engaged.',
  },
  {
    id: 3,
    severity: 'info',
    title: 'Cluster Node Failover Heartbeat Synced',
    target: 'node/node-vm-142',
    namespace: 'kube-system',
    node: 'node-vm-142',
    time: '2 hours ago',
    details: 'Secondary failover node synchronized with Master 141 quorum successfully.',
  },
  {
    id: 4,
    severity: 'warning',
    title: 'High Ingress Latency Spike Detected',
    target: 'ingress/spending-frontend-ingress',
    namespace: 'spending-mgmt',
    node: 'node-vm-142',
    time: '3 hours ago',
    details: 'HTTP latency exceeded 250ms threshold for 90 seconds during batch report export.',
  },
  {
    id: 5,
    severity: 'info',
    title: 'Automated Snapshot & Backup Completed',
    target: 'etcd-cluster-state',
    namespace: 'cluster-wide',
    node: 'node-vm-141',
    time: '6 hours ago',
    details: 'Encrypted snapshot saved to /var/backups/k8s_state_20260913_0400.tar.gz.',
  },
];

export default function AlertsEventsView() {
  const [filterSeverity, setFilterSeverity] = useState('all');

  const filteredAlerts = ALERTS_DATA.filter((item) => {
    if (filterSeverity === 'all') return true;
    return item.severity === filterSeverity;
  });

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Cluster Alerts & Event History</h2>
          <p>
            Audit log of security incidents, threshold breaches, and node health state transitions
          </p>
        </div>
        <div className="view-actions-group">
          <span className="k8s-badge badge-danger">
            <AlertTriangle style={{ width: '12px', height: '12px' }} />
            1 Critical
          </span>
          <span className="k8s-badge badge-warning">
            <AlertCircle style={{ width: '12px', height: '12px' }} />
            2 Warnings
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {['all', 'critical', 'warning', 'info'].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilterSeverity(lvl)}
            className={`btn-dash ${filterSeverity === lvl ? 'btn-dash-primary' : 'btn-dash-secondary'} btn-dash-sm`}
            style={{ textTransform: 'capitalize' }}
          >
            {lvl === 'all' ? 'All Alerts' : lvl}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredAlerts.map((alert) => (
          <div
            key={alert.id}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderLeft:
                alert.severity === 'critical'
                  ? '4px solid #EF4444'
                  : alert.severity === 'warning'
                  ? '4px solid #F59E0B'
                  : '4px solid #3B82F6',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {alert.severity === 'critical' ? (
                  <span className="k8s-badge badge-danger">CRITICAL</span>
                ) : alert.severity === 'warning' ? (
                  <span className="k8s-badge badge-warning">WARNING</span>
                ) : (
                  <span className="k8s-badge badge-info">INFO</span>
                )}
                <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#0F172A' }}>
                  {alert.title}
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock style={{ width: '12px', height: '12px' }} />
                {alert.time}
              </span>
            </div>

            <div style={{ fontSize: '0.84rem', color: '#334155' }}>
              {alert.details}
            </div>

            <div style={{ display: 'flex', gap: '16px', fontSize: '0.78rem', color: '#64748B' }}>
              <span>Target: <strong style={{ fontFamily: 'monospace', color: '#0F172A' }}>{alert.target}</strong></span>
              <span>Namespace: <strong style={{ color: '#0F172A' }}>{alert.namespace}</strong></span>
              <span>Node: <strong style={{ fontFamily: 'monospace', color: '#0F172A' }}>{alert.node}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
