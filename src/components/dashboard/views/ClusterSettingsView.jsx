import React, { useState } from 'react';
import {
  Sliders,
  Settings,
  Bell,
  Shield,
  HardDrive,
  Save,
  CheckCircle2,
  Lock,
  Send,
} from 'lucide-react';

export default function ClusterSettingsView() {
  const [telegramToken, setTelegramToken] = useState('7129841294:AAHq_m71...');
  const [telegramChatId, setTelegramChatId] = useState('-10018928172');
  const [discordWebhook, setDiscordWebhook] = useState('https://discord.com/api/webhooks/12837192...');
  const [registryUrl, setRegistryUrl] = useState('harbor.bsmr.internal');
  const [registryUser, setRegistryUser] = useState('robot$container-monitor');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testedWebhook, setTestedWebhook] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleTestWebhook = () => {
    setTestedWebhook(true);
    setTimeout(() => setTestedWebhook(false), 3000);
  };

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Cluster Configuration & Integrations</h2>
          <p>
            Configure automated incident alert webhooks, private image registry credentials, and cluster state backup
          </p>
        </div>
      </div>

      {savedSuccess && (
        <div
          style={{
            backgroundColor: '#DCFCE7',
            border: '1px solid #BBF7D0',
            borderRadius: '10px',
            padding: '12px 16px',
            color: '#15803D',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 500,
          }}
        >
          <CheckCircle2 style={{ width: '16px', height: '16px' }} />
          Cluster settings and credentials successfully updated!
        </div>
      )}

      {testedWebhook && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '10px',
            padding: '12px 16px',
            color: '#1E40AF',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 500,
          }}
        >
          <Send style={{ width: '16px', height: '16px' }} />
          Test alert dispatched to Telegram & Discord successfully!
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* 1. Alert Webhook Integration */}
        <div className="node-box">
          <div className="node-box-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell style={{ width: '18px', height: '18px', color: '#284C6E' }} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                Incident Alert Webhooks (Telegram & Discord)
              </h3>
            </div>
            <button
              type="button"
              onClick={handleTestWebhook}
              className="btn-dash btn-dash-secondary btn-dash-sm"
            >
              <Send style={{ width: '12px', height: '12px' }} />
              Send Test Notification
            </button>
          </div>

          <div className="dash-form-grid">
            <div className="dash-form-group">
              <label className="dash-form-label">Telegram Bot Token</label>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                className="dash-form-input"
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              />
            </div>

            <div className="dash-form-group">
              <label className="dash-form-label">Telegram Chat ID / Channel</label>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="dash-form-input"
                placeholder="-1001234567890"
              />
            </div>
          </div>

          <div className="dash-form-group">
            <label className="dash-form-label">Discord Webhook URL</label>
            <input
              type="text"
              value={discordWebhook}
              onChange={(e) => setDiscordWebhook(e.target.value)}
              className="dash-form-input"
              placeholder="https://discord.com/api/webhooks/..."
            />
          </div>
        </div>

        {/* 2. Private Registry Credentials */}
        <div className="node-box">
          <div className="node-box-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield style={{ width: '18px', height: '18px', color: '#284C6E' }} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                Private Image Registry Authentication (Harbor / Docker Hub)
              </h3>
            </div>
          </div>

          <div className="dash-form-grid">
            <div className="dash-form-group">
              <label className="dash-form-label">Registry Domain URL</label>
              <input
                type="text"
                value={registryUrl}
                onChange={(e) => setRegistryUrl(e.target.value)}
                className="dash-form-input"
              />
            </div>

            <div className="dash-form-group">
              <label className="dash-form-label">Registry Robot Account / Username</label>
              <input
                type="text"
                value={registryUser}
                onChange={(e) => setRegistryUser(e.target.value)}
                className="dash-form-input"
              />
            </div>
          </div>

          <div className="dash-form-group">
            <label className="dash-form-label">Secret Token / Password</label>
            <input
              type="password"
              defaultValue="••••••••••••••••••••••••"
              className="dash-form-input"
            />
          </div>
        </div>

        {/* 3. Cluster State Backup */}
        <div className="node-box">
          <div className="node-box-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HardDrive style={{ width: '18px', height: '18px', color: '#284C6E' }} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                ETCD Snapshot & Cluster State Backup
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0F172A' }}>
                Automated Daily Snapshot
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                Last snapshot: 6 hours ago • Destination: /var/backups/k8s_state_latest.tar.gz
              </div>
            </div>
            <button
              type="button"
              onClick={() => alert('Snapshot backup dispatched to ETCD!')}
              className="btn-dash btn-dash-secondary btn-dash-sm"
            >
              Backup State Now
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn-dash btn-dash-primary" style={{ minWidth: '160px' }}>
            <Save style={{ width: '14px', height: '14px' }} />
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
}
