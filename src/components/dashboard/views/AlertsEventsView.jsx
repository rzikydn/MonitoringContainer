import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Webhook,
} from 'lucide-react';
import { fetchAlerts } from '../../../services/api';

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

export default function AlertsEventsView() {
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [alerts, setAlerts] = useState([]);
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => fetchAlerts().then((data) => {
      setAlerts(data.alerts);
      setWebhookConfigured(data.webhookConfigured);
      setLoading(false);
    });
    load();
    const ALERTS_REFRESH_MS = 30 * 1000; // sama seperti interval evaluasi di backend
    const intervalId = setInterval(load, ALERTS_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, []);

  const filteredAlerts = alerts.filter((item) => filterSeverity === 'all' || item.severity === filterSeverity);
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  if (loading) return <div style={{ padding: '20px', color: '#64748B' }}>Loading alerts...</div>;

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Cluster Alerts & Event History</h2>
          <p>
            Node down, pod sering restart, dan resource threshold &gt;85% — dievaluasi tiap 30 detik
          </p>
        </div>
        <div className="view-actions-group">
          {criticalCount > 0 && (
            <span className="k8s-badge badge-danger">
              <AlertTriangle style={{ width: '12px', height: '12px' }} />
              {criticalCount} Critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="k8s-badge badge-warning">
              <AlertCircle style={{ width: '12px', height: '12px' }} />
              {warningCount} Warning{warningCount > 1 ? 's' : ''}
            </span>
          )}
          <span className={`k8s-badge ${webhookConfigured ? 'badge-success' : 'badge-muted'}`}>
            <Webhook style={{ width: '12px', height: '12px' }} />
            {webhookConfigured ? 'Webhook Active' : 'Webhook Not Configured'}
          </span>
        </div>
      </div>

      {!webhookConfigured && (
        <div style={{ fontSize: '0.8rem', color: '#B45309', backgroundColor: '#FFFBEB', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
          Alert belum dikirim ke webhook/chat platform manapun. Set environment variable <code>ALERT_WEBHOOK_URL</code> di backend
          (mendukung Slack/Discord/Teams/generic webhook JSON) untuk mengaktifkan notifikasi keluar.
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {['all', 'critical', 'warning'].map((lvl) => (
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
      {filteredAlerts.length === 0 ? (
        <div style={{ color: '#64748B', textAlign: 'center', padding: '40px 0', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
          <Info style={{ width: '20px', height: '20px', margin: '0 auto 8px', display: 'block', color: '#94A3B8' }} />
          Tidak ada alert aktif — cluster dalam kondisi sehat.
        </div>
      ) : (
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
                borderLeft: alert.severity === 'critical' ? '4px solid #EF4444' : '4px solid #F59E0B',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {alert.severity === 'critical' ? (
                    <span className="k8s-badge badge-danger">CRITICAL</span>
                  ) : (
                    <span className="k8s-badge badge-warning">WARNING</span>
                  )}
                  <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#0F172A' }}>
                    {alert.title}
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock style={{ width: '12px', height: '12px' }} />
                  {formatRelativeTime(alert.time)}
                </span>
              </div>

              <div style={{ fontSize: '0.84rem', color: '#334155' }}>
                {alert.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
