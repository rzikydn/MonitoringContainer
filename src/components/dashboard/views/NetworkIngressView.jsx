import React from 'react';
import {
  Network,
  Globe,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Activity,
  Zap,
} from 'lucide-react';

export default function NetworkIngressView() {
  const services = [
    {
      name: 'asset-mgmt-api-service',
      namespace: 'asset-mgmt',
      type: 'ClusterIP',
      clusterIp: '10.96.12.44',
      port: '8080/TCP',
      endpoints: '2/2 Endpoints Ready',
      status: 'Healthy',
    },
    {
      name: 'asset-frontend-ingress',
      namespace: 'asset-mgmt',
      type: 'NodePort',
      clusterIp: '10.96.14.88',
      port: '80:30080/TCP',
      endpoints: '1/1 Endpoints Ready',
      status: 'Healthy',
    },
    {
      name: 'spending-mgmt-api-service',
      namespace: 'spending-mgmt',
      type: 'ClusterIP',
      clusterIp: '10.96.15.12',
      port: '5000/TCP',
      endpoints: '2/2 Endpoints Ready',
      status: 'Healthy',
    },
    {
      name: 'core-postgres-headless',
      namespace: 'core-services',
      type: 'ClusterIP (Headless)',
      clusterIp: 'None',
      port: '5432/TCP',
      endpoints: '1/1 Endpoints Ready',
      status: 'Healthy',
    },
  ];

  const ingressRoutes = [
    {
      host: 'asset.bsmr.internal',
      path: '/*',
      service: 'asset-mgmt-api-service:8080',
      ssl: 'TLS Active (Let\'s Encrypt)',
      latency: '18ms avg',
      health: 'HTTP 200 OK',
    },
    {
      host: 'spending.bsmr.internal',
      path: '/api/*',
      service: 'spending-mgmt-api-service:5000',
      ssl: 'TLS Active (Internal CA)',
      latency: '24ms avg',
      health: 'HTTP 200 OK',
    },
  ];

  const healthChecks = [
    {
      service: 'asset-mgmt /healthz',
      interval: 'Every 5s',
      status: 200,
      responseTime: '14 ms',
      successRate: '100%',
    },
    {
      service: 'spending-mgmt /api/health',
      interval: 'Every 10s',
      status: 200,
      responseTime: '28 ms',
      successRate: '99.8%',
    },
    {
      service: 'core-postgres probe',
      interval: 'Every 15s',
      status: 200,
      responseTime: '6 ms',
      successRate: '100%',
    },
  ];

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Network Topology, Ingress & HTTP Health Probes</h2>
          <p>
            Service discovery, routing rules, request latency, and automated HTTP health checks
          </p>
        </div>
        <div className="view-actions-group">
          <span className="k8s-badge badge-success">
            <Zap style={{ width: '13px', height: '13px' }} />
            Ingress Controller Active
          </span>
        </div>
      </div>

      {/* HTTP Health Checks Highlights */}
      <div className="metrics-stat-grid">
        {healthChecks.map((hc) => (
          <div key={hc.service} className="metric-stat-card">
            <div className="metric-card-top">
              <span className="metric-card-title">{hc.service}</span>
              <span className="k8s-badge badge-success">
                <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                {hc.status} OK
              </span>
            </div>
            <div className="metric-card-value">{hc.responseTime}</div>
            <div className="metric-card-subtext">
              Success Rate: <strong>{hc.successRate}</strong> • Checked {hc.interval}
            </div>
          </div>
        ))}
      </div>

      {/* Services Table */}
      <div className="node-box">
        <div className="node-box-header">
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
            Kubernetes Services (ClusterIP & NodePort)
          </h3>
          <span className="k8s-badge badge-info">4 Active Services</span>
        </div>
        <div className="table-responsive-wrapper">
          <table className="k8s-table">
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Namespace</th>
                <th>Type</th>
                <th>Cluster IP</th>
                <th>Port Mapping</th>
                <th>Endpoints</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.name}>
                  <td style={{ fontWeight: 600 }}>{svc.name}</td>
                  <td>
                    <span className="k8s-badge badge-muted">{svc.namespace}</span>
                  </td>
                  <td>
                    <span className="k8s-badge badge-info">{svc.type}</span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#475569' }}>
                    {svc.clusterIp}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{svc.port}</td>
                  <td style={{ fontSize: '0.8rem', color: '#10B981', fontWeight: 500 }}>
                    {svc.endpoints}
                  </td>
                  <td>
                    <span className="k8s-badge badge-success">
                      <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                      {svc.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ingress Routing Table */}
      <div className="node-box">
        <div className="node-box-header">
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
            Ingress Routes & Edge Traffic Rules
          </h3>
          <span className="k8s-badge badge-success">Nginx Ingress Ready</span>
        </div>
        <div className="table-responsive-wrapper">
          <table className="k8s-table">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Route Path</th>
                <th>Target Backend Service</th>
                <th>SSL/TLS State</th>
                <th>Average Latency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ingressRoutes.map((route) => (
                <tr key={route.host}>
                  <td style={{ fontWeight: 600, color: '#0284C7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe style={{ width: '14px', height: '14px' }} />
                    {route.host}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{route.path}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{route.service}</td>
                  <td>
                    <span className="k8s-badge badge-success">{route.ssl}</span>
                  </td>
                  <td style={{ fontWeight: 600, color: '#0F172A' }}>{route.latency}</td>
                  <td>
                    <span className="k8s-badge badge-success">{route.health}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
