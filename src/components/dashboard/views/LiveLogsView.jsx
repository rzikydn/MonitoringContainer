import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  Trash2,
  Search,
} from 'lucide-react';
import { fetchNamespaces, fetchWorkloadsPods, buildLogStreamUrl } from '../../../services/api';

export default function LiveLogsView({ initialTarget }) {
  const [namespaces, setNamespaces] = useState([]);
  const [pods, setPods] = useState([]);
  const [selectedNamespace, setSelectedNamespace] = useState(initialTarget?.namespace || '');
  const [selectedPod, setSelectedPod] = useState(initialTarget?.name || '');
  const [selectedContainer, setSelectedContainer] = useState('');
  const [logs, setLogs] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [search, setSearch] = useState('');
  const logEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    fetchNamespaces().then((data) => setNamespaces(data));
  }, []);

  useEffect(() => {
    if (!selectedNamespace) {
      setPods([]);
      return;
    }
    fetchWorkloadsPods(selectedNamespace).then((data) => setPods(data));
  }, [selectedNamespace]);

  useEffect(() => {
    const pod = pods.find((p) => p.name === selectedPod);
    setSelectedContainer(pod?.containers?.[0] || '');
  }, [selectedPod, pods]);

  const stopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  };

  const startStream = () => {
    if (!selectedNamespace || !selectedPod) return;
    stopStream();
    setLogs([]);

    const url = buildLogStreamUrl(selectedNamespace, selectedPod, selectedContainer);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setIsStreaming(true);
    es.onmessage = (event) => {
      setLogs((prev) => [...prev.slice(-500), { id: `${Date.now()}-${Math.random()}`, line: event.data }]);
    };
    es.onerror = () => {
      stopStream();
    };
  };

  // Auto-connect kalau navigasi dari tombol "Logs" di Workloads & Pods
  useEffect(() => {
    if (initialTarget?.namespace && initialTarget?.name) {
      setSelectedNamespace(initialTarget.namespace);
      setSelectedPod(initialTarget.name);
      stopStream();
      const url = buildLogStreamUrl(initialTarget.namespace, initialTarget.name, '');
      const es = new EventSource(url);
      eventSourceRef.current = es;
      setLogs([]);
      es.onopen = () => setIsStreaming(true);
      es.onmessage = (event) => {
        setLogs((prev) => [...prev.slice(-500), { id: `${Date.now()}-${Math.random()}`, line: event.data }]);
      };
      es.onerror = () => stopStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget]);

  useEffect(() => {
    return () => stopStream();
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const filteredLogs = logs.filter((log) =>
    search === '' || log.line.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Centralized Live Log Viewer</h2>
          <p>
            Real-time streaming stdout/stderr log feed langsung dari container cluster, tanpa SSH
          </p>
        </div>
        <div className="view-actions-group">
          {isStreaming ? (
            <button onClick={stopStream} className="btn-dash btn-dash-primary btn-dash-sm">
              <Square style={{ width: '12px', height: '12px' }} />
              Stop Stream
            </button>
          ) : (
            <button
              onClick={startStream}
              disabled={!selectedNamespace || !selectedPod}
              className="btn-dash btn-dash-secondary btn-dash-sm"
            >
              <Play style={{ width: '12px', height: '12px' }} />
              Start Stream
            </button>
          )}
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
        <select
          value={selectedNamespace}
          onChange={(e) => {
            setSelectedNamespace(e.target.value);
            setSelectedPod('');
            stopStream();
          }}
          className="dash-form-select"
          style={{ width: '190px' }}
        >
          <option value="">Select Namespace</option>
          {namespaces.map((ns) => (
            <option key={ns.name} value={ns.name}>{ns.name}</option>
          ))}
        </select>

        <select
          value={selectedPod}
          onChange={(e) => {
            setSelectedPod(e.target.value);
            stopStream();
          }}
          className="dash-form-select"
          style={{ width: '220px' }}
          disabled={!selectedNamespace}
        >
          <option value="">Select Pod</option>
          {pods.map((pod) => (
            <option key={pod.name} value={pod.name}>{pod.name}</option>
          ))}
        </select>

        {(pods.find((p) => p.name === selectedPod)?.containers?.length || 0) > 1 && (
          <select
            value={selectedContainer}
            onChange={(e) => {
              setSelectedContainer(e.target.value);
              stopStream();
            }}
            className="dash-form-select"
            style={{ width: '160px' }}
          >
            {pods.find((p) => p.name === selectedPod)?.containers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

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
            placeholder="Filter buffered logs by keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="dash-form-input"
            style={{ width: '100%', paddingLeft: '32px', boxSizing: 'border-box' }}
          />
        </div>
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
            {selectedNamespace && selectedPod
              ? `stream://${selectedNamespace}/${selectedPod}${selectedContainer ? `/${selectedContainer}` : ''}`
              : 'No pod selected'}
            {' • '}
            {isStreaming ? '● LIVE STREAMING' : '❚❚ STOPPED'}
          </div>
          <div style={{ color: '#64748B', fontSize: '0.74rem' }}>
            {filteredLogs.length} lines buffered
          </div>
        </div>

        <div className="terminal-body">
          {!selectedNamespace || !selectedPod ? (
            <div style={{ color: '#64748B', textAlign: 'center', padding: '40px 0' }}>
              Pilih namespace dan pod, lalu klik "Start Stream" untuk melihat log real-time.
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ color: '#64748B', textAlign: 'center', padding: '40px 0' }}>
              {isStreaming ? 'Menunggu log baru...' : 'Belum ada log. Klik "Start Stream" untuk mulai.'}
            </div>
          ) : (
            filteredLogs.map((item) => (
              <div key={item.id} className="log-entry">
                <span style={{ color: '#E2E8F0' }}>{item.line}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
