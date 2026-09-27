import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Send,
} from 'lucide-react';
import { apiClient } from '../../../services/api';

export default function ClusterSettingsView() {
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    apiClient.fetchAlerts().then((data) => {
      setWebhookConfigured(data.webhookConfigured);
      setTelegramConfigured(data.telegramConfigured);
    });
  }, []);

  const handleTestAlert = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiClient.sendTestAlert();
      setTestResult(result.sent
        ? { type: 'success', text: 'Test alert sent successfully to the configured channel(s).' }
        : { type: 'error', text: result.message || 'No channel is configured yet.' });
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
          <p>Status of the channels used to notify you about cluster issues (node outages, pod restarts, resource limits)</p>
        </div>
      </div>

      {testResult && (
        <div
          style={{
            backgroundColor: testResult.type === 'success' ? 'var(--badge-success-bg)' : 'var(--badge-danger-bg)',
            border: `1px solid ${testResult.type === 'success' ? 'var(--badge-success-border)' : 'var(--badge-danger-border)'}`,
            borderRadius: '10px',
            padding: '12px 16px',
            color: testResult.type === 'success' ? 'var(--success-strong)' : 'var(--danger-strong)',
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
            <Bell style={{ width: '18px', height: '18px', color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-strong)' }}>
              Incident Alert Channels
            </h3>
          </div>
          <button
            type="button"
            onClick={handleTestAlert}
            disabled={testing || !anyConfigured}
            className="btn-dash btn-dash-secondary btn-dash-sm"
            title={anyConfigured ? 'Send a test alert to the active channel(s)' : 'No channel configured yet'}
          >
            <Send style={{ width: '12px', height: '12px' }} />
            {testing ? 'Sending...' : 'Send Test Alert'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>Generic Webhook</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Slack, Discord, Microsoft Teams, or any generic JSON webhook</div>
            </div>
            <span className={`k8s-badge ${webhookConfigured ? 'badge-success' : 'badge-muted'}`}>
              {webhookConfigured ? 'Configured' : 'Not Configured'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>Telegram Bot</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sends alerts to a Telegram chat, group, or channel via a bot</div>
            </div>
            <span className={`k8s-badge ${telegramConfigured ? 'badge-success' : 'badge-muted'}`}>
              {telegramConfigured ? 'Configured' : 'Not Configured'}
            </span>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', marginTop: '4px' }}>
          Channels are configured through environment variables on the backend, not through this form — sensitive
          credentials like these are intentionally never stored from the browser. Set one or both, then restart the backend:
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
