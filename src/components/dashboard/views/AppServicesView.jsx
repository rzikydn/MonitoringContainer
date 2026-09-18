import React, { useState, useEffect } from 'react';
import {
  Server,
  Play,
  Square,
  RotateCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { fetchDeployments, scaleDeployment, restartDeployment } from '../../../services/api';

function deploymentStatus(d) {
  if (d.desired === 0) return 'Stopped';
  if (d.ready >= d.desired && d.ready > 0) return 'Running';
  return 'Scaling';
}

export default function AppServicesView() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(null); // `${namespace}/${name}` sedang diproses
  const [notice, setNotice] = useState(null);
  const [sliderDraft, setSliderDraft] = useState({}); // nilai slider selama drag, sebelum di-apply

  const load = () => fetchDeployments('all').then((data) => {
    setServices(data);
    setLoading(false);
  });

  useEffect(() => {
    load();
    const REFRESH_MS = 15 * 1000;
    const intervalId = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalId);
  }, []);

  const runAction = async (svc, actionLabel, fn) => {
    const key = `${svc.namespace}/${svc.name}`;
    setPendingAction(key);
    try {
      await fn();
      setNotice({ type: 'success', text: `${svc.name}: ${actionLabel} berhasil.` });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: `${svc.name}: ${actionLabel} gagal — ${err.message}` });
    } finally {
      setPendingAction(null);
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const handleStop = (svc) => runAction(svc, 'Stop', () => scaleDeployment(svc.namespace, svc.name, 0));
  const handleStart = (svc) => runAction(svc, 'Start', () => scaleDeployment(svc.namespace, svc.name, Math.max(svc.desired, 1)));
  const handleRestart = (svc) => runAction(svc, 'Restart', () => restartDeployment(svc.namespace, svc.name));
  const handleScaleCommit = (svc, replicas) => runAction(svc, `Scale ke ${replicas} replica`, () => scaleDeployment(svc.namespace, svc.name, replicas));

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>App Services</h2>
          <p>Start, stop, restart, dan atur jumlah replica Deployment langsung dari sini</p>
        </div>
      </div>

      {notice && (
        <div
          style={{
            backgroundColor: notice.type === 'success' ? '#EFF6FF' : '#FEF2F2',
            border: `1px solid ${notice.type === 'success' ? '#BFDBFE' : '#FECACA'}`,
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: notice.type === 'success' ? '#1E40AF' : '#B91C1C',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 style={{ width: '16px', height: '16px', color: '#2563EB' }} />
          ) : (
            <AlertCircle style={{ width: '16px', height: '16px', color: '#B91C1C' }} />
          )}
          {notice.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px', color: '#64748B' }}>Loading services...</div>
      ) : services.length === 0 ? (
        <div style={{ color: '#64748B', textAlign: 'center', padding: '40px 0', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
          Belum ada Deployment di cluster ini.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {services.map((svc) => {
            const key = `${svc.namespace}/${svc.name}`;
            const status = deploymentStatus(svc);
            const isPending = pendingAction === key;
            const sliderValue = sliderDraft[key] ?? svc.desired;

            return (
              <div
                key={key}
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
                      <span className={`k8s-badge ${status === 'Running' ? 'badge-success' : status === 'Stopped' ? 'badge-danger' : 'badge-warning'}`}>
                        {status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '4px', fontFamily: 'monospace' }}>
                      Image: {svc.image} • Age: {svc.age}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {svc.desired === 0 ? (
                      <button
                        onClick={() => handleStart(svc)}
                        disabled={isPending}
                        className="btn-dash btn-dash-primary btn-dash-sm"
                        title="Start (scale ke 1 replica)"
                      >
                        <Play style={{ width: '12px', height: '12px' }} />
                        Start
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStop(svc)}
                        disabled={isPending}
                        className="btn-dash btn-dash-danger btn-dash-sm"
                        title="Stop (scale ke 0 replica)"
                      >
                        <Square style={{ width: '12px', height: '12px' }} />
                        Stop
                      </button>
                    )}

                    <button
                      onClick={() => handleRestart(svc)}
                      disabled={isPending}
                      className="btn-dash btn-dash-secondary btn-dash-sm"
                      title="Rolling restart semua pod"
                    >
                      <RotateCw style={{ width: '12px', height: '12px' }} />
                      {isPending ? 'Processing...' : 'Restart'}
                    </button>
                  </div>
                </div>

                {/* Scaling Slider Row */}
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
                      Replica Scaling
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                      <span style={{ color: svc.ready < svc.desired ? '#B91C1C' : '#284C6E' }}>{svc.ready}/{svc.desired}</span> Ready
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: '240px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>0</span>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={sliderValue}
                      disabled={isPending}
                      onChange={(e) => setSliderDraft((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                      onMouseUp={(e) => handleScaleCommit(svc, Number(e.target.value))}
                      onTouchEnd={(e) => handleScaleCommit(svc, Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#284C6E', cursor: 'pointer', height: '24px' }}
                    />
                    <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>10</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
