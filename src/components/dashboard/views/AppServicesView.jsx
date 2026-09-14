import React, { useState } from 'react';
import {
  Server,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

const INITIAL_SERVICES = [
  {
    id: 'asset-api-v1',
    name: 'asset-api-v1',
    namespace: 'asset-mgmt',
    image: 'harbor.bsmr.internal/prod/asset-api:v2.1.0',
    status: 'Running',
    replicas: 3,
    targetPort: 8080,
    health: '100% OK',
  },
  {
    id: 'spending-tracker-svc',
    name: 'spending-tracker-svc',
    namespace: 'spending-mgmt',
    image: 'harbor.bsmr.internal/prod/spending-app:v1.4.2',
    status: 'Running',
    replicas: 2,
    targetPort: 3000,
    health: '100% OK',
  },
  {
    id: 'core-auth-gateway',
    name: 'core-auth-gateway',
    namespace: 'core-services',
    image: 'harbor.bsmr.internal/core/auth-gateway:v3.0.1',
    status: 'Running',
    replicas: 4,
    targetPort: 8000,
    health: '100% OK',
  },
];

export default function AppServicesView() {
  const [services, setServices] = useState(INITIAL_SERVICES);
  const [actionNotice, setActionNotice] = useState(null);

  const handleAction = (serviceId, action) => {
    setServices((prev) =>
      prev.map((s) => {
        if (s.id !== serviceId) return s;
        if (action === 'stop') return { ...s, status: 'Stopped', replicas: 0 };
        if (action === 'start') return { ...s, status: 'Running', replicas: 1 };
        if (action === 'restart' || action === 'redeploy') return { ...s, status: 'Running' };
        return s;
      })
    );

    setActionNotice(`Service "${serviceId}" executed ${action.toUpperCase()} action.`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleSliderScale = (serviceId, newReplicas) => {
    setServices((prev) =>
      prev.map((s) =>
        s.id === serviceId
          ? { ...s, replicas: newReplicas, status: newReplicas > 0 ? 'Running' : 'Stopped' }
          : s
      )
    );
    setActionNotice(`Scaling "${serviceId}" to ${newReplicas} replicas in real-time.`);
    setTimeout(() => setActionNotice(null), 3000);
  };

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>App Services Lifecycle & Scaling Controls</h2>
          <p>
            One-click operational control (Start, Stop, Restart, Re-deploy) and live visual scaling sliders
          </p>
        </div>
      </div>

      {actionNotice && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#1E40AF',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          <CheckCircle2 style={{ width: '16px', height: '16px', color: '#2563EB' }} />
          {actionNotice}
        </div>
      )}

      {/* Services Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {services.map((svc) => (
          <div
            key={svc.id}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Server style={{ width: '18px', height: '18px', color: '#284C6E' }} />
                  <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0F172A' }}>
                    {svc.name}
                  </span>
                  <span className="k8s-badge badge-muted">{svc.namespace}</span>
                  <span
                    className={`k8s-badge ${
                      svc.status === 'Running' ? 'badge-success' : 'badge-danger'
                    }`}
                  >
                    {svc.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px', fontFamily: 'monospace' }}>
                  Image: {svc.image} • Target Port: {svc.targetPort}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {svc.status === 'Running' ? (
                  <button
                    onClick={() => handleAction(svc.id, 'stop')}
                    className="btn-dash btn-dash-danger btn-dash-sm"
                    title="Stop Service (scale 0)"
                  >
                    <Square style={{ width: '12px', height: '12px' }} />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction(svc.id, 'start')}
                    className="btn-dash btn-dash-primary btn-dash-sm"
                    title="Start Service"
                  >
                    <Play style={{ width: '12px', height: '12px' }} />
                    Start
                  </button>
                )}

                <button
                  onClick={() => handleAction(svc.id, 'restart')}
                  className="btn-dash btn-dash-secondary btn-dash-sm"
                  title="Rolling Restart Pods"
                >
                  <RotateCw style={{ width: '12px', height: '12px' }} />
                  Restart
                </button>

                <button
                  onClick={() => handleAction(svc.id, 'redeploy')}
                  className="btn-dash btn-dash-secondary btn-dash-sm"
                  title="Pull latest image & re-deploy"
                >
                  <RefreshCw style={{ width: '12px', height: '12px' }} />
                  Re-deploy
                </button>
              </div>
            </div>

            {/* Visual Scaling Slider Row */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div style={{ minWidth: '180px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                  Visual Replica Scaling
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                  Current: <span style={{ color: '#284C6E' }}>{svc.replicas} Replicas</span>
                </div>
              </div>

              {/* Slider Control */}
              <div style={{ flex: 1, minWidth: '240px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>0</span>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={svc.replicas}
                  onChange={(e) => handleSliderScale(svc.id, Number(e.target.value))}
                  style={{
                    flex: 1,
                    accentColor: '#284C6E',
                    cursor: 'pointer',
                    height: '24px',
                  }}
                />
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>10</span>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                Health Check: <strong style={{ color: '#15803D' }}>{svc.health}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
