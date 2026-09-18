import React, { useState, useEffect } from 'react';
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
import { fetchWorkloadsPods } from '../../../services/api';

const NAMESPACE_PROFILES = {
  'asset-mgmt': {
    title: 'asset-mgmt',
    subtitle: 'Modul VM 1 (Asset Tracking, Inventory & OCR Scanners)',
    nodeAffinity: 'Primary Node: node-vm-141',
    cpu: { used: '2.8', max: '4.0', unit: 'Cores', pct: 70 },
    memory: { used: '5.6', max: '8.0', unit: 'GB', pct: 70 },
    storage: { used: '140', max: '250', unit: 'GB', pct: 56 },
    pods: { used: '14', max: '20', unit: 'Pods', pct: 70 },
  },
  'spending-mgmt': {
    title: 'spending-mgmt',
    subtitle: 'Modul VM 2 (Budgeting, Expense Approvals & Batch Billing)',
    nodeAffinity: 'Primary Node: node-vm-142',
    cpu: { used: '3.1', max: '4.0', unit: 'Cores', pct: 77.5 },
    memory: { used: '6.2', max: '8.0', unit: 'GB', pct: 77.5 },
    storage: { used: '180', max: '300', unit: 'GB', pct: 60 },
    pods: { used: '12', max: '16', unit: 'Pods', pct: 75 },
  },
  'core-services': {
    title: 'core-services',
    subtitle: 'Cluster Infrastructure (Auth Gateway, Ingress, Shared DB & Redis)',
    nodeAffinity: 'Distributed across VM 141 & 142',
    cpu: { used: '4.2', max: '8.0', unit: 'Cores', pct: 52.5 },
    memory: { used: '12.4', max: '20.0', unit: 'GB', pct: 62 },
    storage: { used: '420', max: '800', unit: 'GB', pct: 52.5 },
    pods: { used: '8', max: '12', unit: 'Pods', pct: 66.7 },
  },
};

export default function NamespaceDetailView({ namespaceKey = 'asset-mgmt' }) {
  const [pods, setPods] = useState([]);

  useEffect(() => {
    fetchWorkloadsPods(namespaceKey).then((data) => setPods(data));
  }, [namespaceKey]);

  const profile = NAMESPACE_PROFILES[namespaceKey] || {
    title: namespaceKey,
    subtitle: 'Custom Project Namespace',
    nodeAffinity: 'Cluster Dynamic Allocation',
    cpu: { used: '0.4', max: '2.0', unit: 'Cores', pct: 20 },
    memory: { used: '1.0', max: '4.0', unit: 'GB', pct: 25 },
    storage: { used: '20', max: '100', unit: 'GB', pct: 20 },
    pods: { used: '2', max: '10', unit: 'Pods', pct: 20 },
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

      {/* Workloads Table in this namespace — data pod real (Fitur 3: Namespace Grouping) */}
      <div className="node-box">
        <div className="node-box-header">
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
            Pods Active in [{profile.title}]
          </h3>
          <span className="k8s-badge badge-info">{pods.length} Pods</span>
        </div>

        <div className="table-responsive-wrapper">
          <table className="k8s-table">
            <thead>
              <tr>
                <th>Pod Name</th>
                <th>Node</th>
                <th>Status</th>
                <th>Restarts</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {pods.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: '#64748B', textAlign: 'center', padding: '16px' }}>
                    No pods found in this namespace.
                  </td>
                </tr>
              ) : (
                pods.map((pod) => (
                  <tr key={pod.name}>
                    <td style={{ fontWeight: 600, color: '#0F172A' }}>{pod.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748B' }}>{pod.node}</td>
                    <td>
                      {pod.status === 'Running' ? (
                        <span className="k8s-badge badge-success">
                          <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                          Running
                        </span>
                      ) : (
                        <span className="k8s-badge badge-danger">
                          <AlertTriangle style={{ width: '12px', height: '12px' }} />
                          {pod.status}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: pod.restarts > 0 ? '#B91C1C' : '#15803D' }}>{pod.restarts}x</td>
                    <td style={{ color: '#64748B', fontSize: '0.8rem' }}>{pod.uptime}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
