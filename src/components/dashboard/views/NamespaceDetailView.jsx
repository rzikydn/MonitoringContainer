import React, { useState, useEffect } from 'react';
import {
  Folder,
  Cpu,
  Activity,
  HardDrive,
  Boxes,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '../../../services/api';

function QuotaCard({ title, icon: Icon, data, color, noQuotaHint }) {
  if (!data) {
    return (
      <div className="metric-stat-card">
        <div className="metric-card-top">
          <span className="metric-card-title">{title}</span>
          <div className="metric-card-icon-wrap"><Icon style={{ width: '18px', height: '18px' }} /></div>
        </div>
        <div className="metric-card-value">—</div>
        <div className="metric-card-subtext">Loading...</div>
      </div>
    );
  }

  return (
    <div className="metric-stat-card">
      <div className="metric-card-top">
        <span className="metric-card-title">{title}</span>
        <div className="metric-card-icon-wrap"><Icon style={{ width: '18px', height: '18px' }} /></div>
      </div>
      <div className="metric-card-value">
        {data.used} {data.hasHard ? `/ ${data.max}` : ''}{' '}
        <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{data.unit}</span>
      </div>
      <div className="metric-progress-track">
        <div
          className="metric-progress-fill"
          style={{
            width: data.hasHard ? `${data.pct}%` : '0%',
            backgroundColor: data.hasHard && data.pct >= 85 ? '#EF4444' : color,
          }}
        />
      </div>
      <div className="metric-card-subtext">
        {data.hasHard
          ? <><strong>{data.pct}%</strong> quota consumed</>
          : <span style={{ color: '#B45309' }}>No ResourceQuota configured — {noQuotaHint}</span>}
      </div>
    </div>
  );
}

export default function NamespaceDetailView({ namespaceKey, namespaceMeta }) {
  const [pods, setPods] = useState([]);
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    setQuota(null);
    apiClient.fetchWorkloadsPods(namespaceKey).then((data) => setPods(data));
    apiClient.fetchNamespaceQuota(namespaceKey).then((data) => setQuota(data));
  }, [namespaceKey]);

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder style={{ width: '22px', height: '22px', color: '#284C6E' }} />
            <h2>Namespace: {namespaceKey}</h2>
            {quota && (
              <span className={`k8s-badge ${quota.hasResourceQuota ? 'badge-success' : 'badge-warning'}`}>
                {quota.hasResourceQuota ? 'ResourceQuota Active' : 'No ResourceQuota'}
              </span>
            )}
          </div>
          <p>{namespaceMeta?.description || 'Kubernetes Project Namespace'}</p>
        </div>
      </div>

      {/* Fitur 4: Quota & Limit Monitoring Cards */}
      <div>
        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
          Resource Quota & Hard Limits
        </div>

        <div className="metrics-stat-grid">
          <QuotaCard title="CPU Quota" icon={Cpu} data={quota?.cpu} color="#284C6E" noQuotaHint="showing requested CPU" />
          <QuotaCard title="Memory Limit" icon={Activity} data={quota?.memory} color="#284C6E" noQuotaHint="showing requested memory" />
          <QuotaCard title="Storage PVC" icon={HardDrive} data={quota?.storage} color="#284C6E" noQuotaHint="showing PVC requested" />
          <QuotaCard title="Max Pods Quota" icon={Boxes} data={quota?.pods} color="#284C6E" noQuotaHint="showing current pod count" />
        </div>
      </div>

      {/* Workloads Table in this namespace — data pod real (Fitur 3: Namespace Grouping) */}
      <div className="node-box">
        <div className="node-box-header">
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
            Pods Active in [{namespaceKey}]
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
