import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Send,
} from 'lucide-react';
import { fetchAlerts, sendTestAlert } from '../../../services/api';

export default function ClusterSettingsView() {
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchAlerts().then((data) => {
      setWebhookConfigured(data.webhookConfigured);
      setTelegramConfigured(data.telegramConfigured);
    });
  }, []);

  const handleTestAlert = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await sendTestAlert();
      setTestResult(result.sent
        ? { type: 'success', text: 'Test alert berhasil dikirim ke channel yang dikonfigurasi.' }
        : { type: 'error', text: result.message || 'Belum ada channel yang dikonfigurasi.' });
    } catch (err) {
      setTestResult({ type: 'error', text: err.message });
    } finally {
      setTesting(false);
    }
  };

  const anyConfigured = webhookConfigured || telegramConfigured;

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Alert Notification Settings</h2>
          <p>Status channel notifikasi untuk alert cluster (node down, pod restart, resource threshold)</p>
        </div>
      </div>

      {testResult && (
        <div
          style={{
            backgroundColor: testResult.type === 'success' ? '#DCFCE7' : '#FEF2F2',
            border: `1px solid ${testResult.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
            borderRadius: '10px',
            padding: '12px 16px',
            color: testResult.type === 'success' ? '#15803D' : '#B91C1C',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 500,
          }}
        >
          {testResult.type === 'success' ? (
            <CheckCircle2 style={{ width: '16px', height: '16px' }} />
          ) : (
            <AlertCircle style={{ width: '16px', height: '16px' }} />
          )}
          {testResult.text}
        </div>
      )}

      <div className="node-box">
        <div className="node-box-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell style={{ width: '18px', height: '18px', color: '#284C6E' }} />
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
              Incident Alert Channels
            </h3>
          </div>
          <button
            type="button"
            onClick={handleTestAlert}
            disabled={testing || !anyConfigured}
            className="btn-dash btn-dash-secondary btn-dash-sm"
            title={anyConfigured ? 'Kirim test alert ke channel yang aktif' : 'Belum ada channel dikonfigurasi'}
          >
            <Send style={{ width: '12px', height: '12px' }} />
            {testing ? 'Sending...' : 'Send Test Alert'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #E2E8F0' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#0F172A' }}>Generic Webhook</div>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Slack, Discord, Microsoft Teams, atau webhook JSON generik lainnya</div>
            </div>
            <span className={`k8s-badge ${webhookConfigured ? 'badge-success' : 'badge-muted'}`}>
              {webhookConfigured ? 'Configured' : 'Not Configured'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#0F172A' }}>Telegram Bot</div>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Kirim ke chat/group/channel Telegram lewat bot</div>
            </div>
            <span className={`k8s-badge ${telegramConfigured ? 'badge-success' : 'badge-muted'}`}>
              {telegramConfigured ? 'Configured' : 'Not Configured'}
            </span>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: '#64748B', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px', marginTop: '4px' }}>
          Channel dikonfigurasi lewat environment variable di backend (bukan lewat form ini — kredensial sensitif seperti ini
          sengaja tidak disimpan dari browser). Set salah satu atau kedua, lalu restart backend:
          <div style={{ fontFamily: 'monospace', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...</span>
            <span>TELEGRAM_BOT_TOKEN=123456789:ABC...</span>
            <span>TELEGRAM_CHAT_ID=-1001234567890</span>
          </div>
        </div>
      </div>
    </div>
  );
}
