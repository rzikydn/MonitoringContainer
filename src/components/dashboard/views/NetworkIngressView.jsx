import React, { useState, useEffect } from 'react';
import {
  Network,
  Globe,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { fetchNetworkIngress } from '../../../services/api';

export default function NetworkIngressView() {
  const [services, setServices] = useState([]);
  const [ingressRoutes, setIngressRoutes] = useState([]);

  useEffect(() => {
    fetchNetworkIngress().then((data) => {
      setServices(data.services);
      setIngressRoutes(data.ingress);
    });
  }, []);

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Network Topology & Ingress Routes</h2>
          <p>
            Service discovery (ClusterIP/NodePort/LoadBalancer) and Ingress routing rules
          </p>
        </div>
        <div className="view-actions-group">
          <span className="k8s-badge badge-info">
            <Network style={{ width: '13px', height: '13px' }} />
            {services.length} Services • {ingressRoutes.length} Routes
          </span>
        </div>
      </div>

      {/* Services Table */}
      <div className="node-box">
        <div className="node-box-header">
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
            Kubernetes Services (ClusterIP, NodePort & LoadBalancer)
          </h3>
          <span className="k8s-badge badge-info">{services.length} Services</span>
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ color: '#64748B', textAlign: 'center', padding: '16px' }}>
                    No services found.
                  </td>
                </tr>
              ) : (
                services.map((svc) => (
                  <tr key={`${svc.namespace}/${svc.name}`}>
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
                    <td style={{ fontSize: '0.8rem', color: svc.status === 'Healthy' ? '#10B981' : '#B91C1C', fontWeight: 500 }}>
                      {svc.endpoints}
                    </td>
                    <td>
                      <span className={`k8s-badge ${svc.status === 'Healthy' ? 'badge-success' : 'badge-danger'}`}>
                        {svc.status === 'Healthy' ? (
                          <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                        ) : (
                          <AlertCircle style={{ width: '12px', height: '12px' }} />
                        )}
                        {svc.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
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
          <span className="k8s-badge badge-info">
            <Zap style={{ width: '13px', height: '13px' }} />
            {ingressRoutes.length} Routes
          </span>
        </div>
        <div className="table-responsive-wrapper">
          <table className="k8s-table">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Namespace</th>
                <th>Route Path</th>
                <th>Target Backend Service</th>
                <th>TLS</th>
              </tr>
            </thead>
            <tbody>
              {ingressRoutes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: '#64748B', textAlign: 'center', padding: '16px' }}>
                    No Ingress routes found.
                  </td>
                </tr>
              ) : (
                ingressRoutes.map((route, idx) => (
                  <tr key={`${route.namespace}/${route.host}/${route.path}/${idx}`}>
                    <td style={{ fontWeight: 600, color: '#0284C7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Globe style={{ width: '14px', height: '14px' }} />
                      {route.host}
                    </td>
                    <td>
                      <span className="k8s-badge badge-muted">{route.namespace}</span>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{route.path}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{route.service}</td>
                    <td>
                      <span className={`k8s-badge ${route.tls === 'TLS Enabled' ? 'badge-success' : 'badge-muted'}`}>
                        {route.tls}
                      </span>
                    </td>
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
