import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Play,
  Square,
  Trash2,
  Download,
  Filter,
  Search,
  CheckCircle2,
} from 'lucide-react';

const INITIAL_LOGS = [
  { id: 1, time: '10:14:02.120', type: 'out', pod: 'asset-api-78f9', msg: '[INFO] Initializing Gin HTTP router on port :8080' },
  { id: 2, time: '10:14:03.450', type: 'out', pod: 'asset-api-78f9', msg: '[INFO] Connected to PostgreSQL pool at 10.96.15.12:5432 (max_conn=25)' },
  { id: 3, time: '10:14:05.890', type: 'out', pod: 'spending-web-6b45', msg: '[INFO] Next.js v14.2 SSR server listening on 0.0.0.0:3000' },
  { id: 4, time: '10:14:10.231', type: 'err', pod: 'spending-cron-849c', msg: '[WARN] RabbitMQ channel timeout, attempting re-connection in 5000ms...' },
  { id: 5, time: '10:14:15.304', type: 'err', pod: 'spending-cron-849c', msg: '[FATAL] Failed to connect to amqp://guest:guest@10.96.10.50: connection refused' },
  { id: 6, time: '10:14:16.002', type: 'out', pod: 'asset-api-78f9', msg: '[HTTP] GET /api/v1/assets?status=active 200 in 14.2ms (client=192.168.1.10)' },
  { id: 7, time: '10:14:20.671', type: 'out', pod: 'core-postgres-0', msg: '[DB] checkpoint starting: time, wal seq 0/1A94000' },
  { id: 8, time: '10:14:25.812', type: 'out', pod: 'asset-worker-547c', msg: '[SYNC] Synchronized 142 asset items to Elasticsearch index asset_prod_v2' },
];

export default function LiveLogsView({ initialPod }) {
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [selectedPod, setSelectedPod] = useState(initialPod || 'all');
  const [selectedStream, setSelectedStream] = useState('all'); // 'all', 'out', 'err'
  const [isStreaming, setIsStreaming] = useState(true);
  const [search, setSearch] = useState('');
  const logEndRef = useRef(null);

  // Simulate incoming real-time logs if streaming is active
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
      const pods = ['asset-api-78f9', 'spending-web-6b45', 'core-postgres-0', 'asset-worker-547c'];
      const randomPod = pods[Math.floor(Math.random() * pods.length)];
      const sampleMessages = [
        `[HTTP] GET /healthz 200 in ${(Math.random() * 8 + 2).toFixed(1)}ms`,
        `[METRICS] Scraped Prometheus telemetry batch from VM 141 (38 series)`,
        `[HEARTBEAT] Node 142 failover keepalive ACK received`,
        `[CACHE] Redis key cache:asset_summary refreshed (TTL 300s)`,
      ];
      const randomMsg = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];

      setLogs((prev) => [
        ...prev.slice(-100),
        {
          id: Date.now(),
          time: timeStr,
          type: 'out',
          pod: randomPod,
          msg: randomMsg,
        },
      ]);
    }, 2500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Auto scroll to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    const matchPod = selectedPod === 'all' || log.pod.includes(selectedPod);
    const matchStream = selectedStream === 'all' || log.type === selectedStream;
    const matchSearch = search === '' || log.msg.toLowerCase().includes(search.toLowerCase());
    return matchPod && matchStream && matchSearch;
  });

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Centralized Live Log Viewer</h2>
          <p>
            Real-time streaming stdout/stderr log feed directly from cluster containers without SSH
          </p>
        </div>
        <div className="view-actions-group">
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`btn-dash ${isStreaming ? 'btn-dash-primary' : 'btn-dash-secondary'} btn-dash-sm`}
          >
            {isStreaming ? (
              <>
                <Square style={{ width: '12px', height: '12px' }} />
                Pause Stream
              </>
            ) : (
              <>
                <Play style={{ width: '12px', height: '12px' }} />
                Resume Stream
              </>
            )}
          </button>
          <button
            onClick={() => setLogs([])}
            className="btn-dash btn-dash-secondary btn-dash-sm"
            title="Clear current log output"
          >
            <Trash2 style={{ width: '12px', height: '12px' }} />
            Clear
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: '#F8FAFC',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '14px',
              height: '14px',
              color: '#94A3B8',
            }}
          />
          <input
            type="text"
            placeholder="Filter logs by keywords (e.g. error, 200, db)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="dash-form-input"
            style={{ width: '100%', paddingLeft: '32px', boxSizing: 'border-box' }}
          />
        </div>

        <select
          value={selectedPod}
          onChange={(e) => setSelectedPod(e.target.value)}
          className="dash-form-select"
          style={{ width: '190px' }}
        >
          <option value="all">All Containers / Pods</option>
          <option value="asset-api">asset-api (VM 141)</option>
          <option value="asset-worker">asset-worker (VM 141)</option>
          <option value="spending-web">spending-web (VM 142)</option>
          <option value="spending-cron">spending-cron (VM 142)</option>
          <option value="core-postgres">core-postgres-0</option>
        </select>

        <select
          value={selectedStream}
          onChange={(e) => setSelectedStream(e.target.value)}
          className="dash-form-select"
          style={{ width: '150px' }}
        >
          <option value="all">stdout + stderr</option>
          <option value="out">stdout only</option>
          <option value="err">stderr (Errors) only</option>
        </select>
      </div>

      {/* Terminal View */}
      <div className="terminal-window">
        <div className="terminal-header">
          <div className="terminal-dots">
            <div className="terminal-dot red" />
            <div className="terminal-dot yellow" />
            <div className="terminal-dot green" />
          </div>
          <div style={{ color: '#94A3B8', fontSize: '0.78rem', fontFamily: 'monospace' }}>
            stream://cluster.prod/pods/{selectedPod} • {isStreaming ? '● LIVE STREAMING' : '❚❚ PAUSED'}
          </div>
          <div style={{ color: '#64748B', fontSize: '0.74rem' }}>
            {filteredLogs.length} lines buffered
          </div>
        </div>

        <div className="terminal-body">
          {filteredLogs.length === 0 ? (
            <div style={{ color: '#64748B', textAlign: 'center', padding: '40px 0' }}>
              No log messages match your filter criteria.
            </div>
          ) : (
            filteredLogs.map((item) => (
              <div key={item.id} className="log-entry">
                <span className="log-time">{item.time}</span>
                <span style={{ color: '#A78BFA', fontWeight: 600 }}>[{item.pod}]</span>
                {item.type === 'err' ? (
                  <span className="log-badge-err">stderr</span>
                ) : (
                  <span className="log-badge-out">stdout</span>
                )}
                <span style={{ color: item.type === 'err' ? '#FCA5A5' : '#E2E8F0' }}>
                  {item.msg}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
