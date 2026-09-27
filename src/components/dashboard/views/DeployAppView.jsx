import React, { useState, useEffect } from 'react';
import {
  Rocket,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { apiClient } from '../../../services/api';


export default function DeployAppView({ onDeployed }) {
  const [appName, setAppName] = useState('');
  const [image, setImage] = useState('');
  const [namespaces, setNamespaces] = useState([]);
  const [namespace, setNamespace] = useState('');
  const [port, setPort] = useState('8080');
  const [replicas, setReplicas] = useState(2);
  const [cpuLimit, setCpuLimit] = useState('500m');
  const [ramLimit, setRamLimit] = useState('512Mi');
  const [envVars, setEnvVars] = useState([{ key: 'NODE_ENV', value: 'production' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deployedSuccess, setDeployedSuccess] = useState(false);
  const [deployError, setDeployError] = useState('');

  useEffect(() => {
    apiClient.fetchNamespaces().then((data) => {
      setNamespaces(data);
      setNamespace((current) => current || (data[0] && data[0].name) || '');
    });
  }, []);

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const removeEnvVar = (index) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index, field, val) => {
    const updated = [...envVars];
    updated[index][field] = val;
    setEnvVars(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setDeployError('');
    setDeployedSuccess(false);

    try {
      await apiClient.deployApplication({ appName, image, namespace, port, replicas, cpuLimit, ramLimit, envVars });
      setDeployedSuccess(true);
      if (onDeployed) onDeployed();
    } catch (err) {
      setDeployError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dashboard-view-container">
      {/* Header */}
      <div className="view-header-row">
        <div className="view-title-group">
          <h2>Deploy New App</h2>
          <p>
            Launch a containerized app into the cluster with automatic networking set up — no command line needed
          </p>
        </div>
      </div>

      {deployedSuccess && (
        <div
          style={{
            backgroundColor: '#DCFCE7',
            border: '1px solid #BBF7D0',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 style={{ width: '20px', height: '20px', color: '#15803D' }} />
            <div>
              <div style={{ fontWeight: 700, color: '#15803D' }}>Deployment Created!</div>
              <div style={{ fontSize: '0.82rem', color: '#166534' }}>
                <strong>{appName}</strong> is now running with {replicas} replica{replicas > 1 ? 's' : ''} in the <strong>{namespace}</strong> namespace.
              </div>
            </div>
          </div>
          <button
            onClick={() => setDeployedSuccess(false)}
            className="btn-dash btn-dash-secondary btn-dash-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {deployError && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle style={{ width: '20px', height: '20px', color: '#B91C1C' }} />
            <div>
              <div style={{ fontWeight: 700, color: '#B91C1C' }}>Deployment Failed</div>
              <div style={{ fontSize: '0.82rem', color: '#991B1B' }}>{deployError}</div>
            </div>
          </div>
          <button
            onClick={() => setDeployError('')}
            className="btn-dash btn-dash-secondary btn-dash-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="node-box">
        <div className="dash-form-grid">
          {/* App Name */}
          <div className="dash-form-group">
            <label className="dash-form-label">Application Name *</label>
            <input
              type="text"
              placeholder="e.g. asset-exporter-service"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="dash-form-input"
              required
            />
          </div>

          {/* Target Namespace */}
          <div className="dash-form-group">
            <label className="dash-form-label">Target Namespace *</label>
            <select
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              className="dash-form-select"
            >
              <option value="">Select Namespace</option>
              {namespaces.map((ns) => (
                <option key={ns.name} value={ns.name}>{ns.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Container Image */}
        <div className="dash-form-group">
          <label className="dash-form-label">Container Image Registry URL *</label>
          <input
            type="text"
            placeholder="e.g. harbor.bsmr.internal/prod/asset-exporter:v1.0.0 or nginx:alpine"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            className="dash-form-input"
            required
          />
        </div>

        <div className="dash-form-grid">
          {/* Port */}
          <div className="dash-form-group">
            <label className="dash-form-label">Internal Container Port</label>
            <input
              type="number"
              placeholder="8080"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="dash-form-input"
            />
          </div>

          {/* Replicas count */}
          <div className="dash-form-group">
            <label className="dash-form-label">Initial Replicas: {replicas}</label>
            <input
              type="range"
              min="1"
              max="8"
              value={replicas}
              onChange={(e) => setReplicas(Number(e.target.value))}
              style={{ accentColor: '#284C6E', height: '36px', cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Resource Allocation */}
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#0F172A', fontWeight: 600 }}>
            Resource Guarantees & Limits
          </h4>
          <div className="dash-form-grid">
            <div className="dash-form-group">
              <label className="dash-form-label">CPU Limit</label>
              <select
                value={cpuLimit}
                onChange={(e) => setCpuLimit(e.target.value)}
                className="dash-form-select"
              >
                <option value="250m">250m (0.25 Core)</option>
                <option value="500m">500m (0.50 Core - Default)</option>
                <option value="1000m">1000m (1.0 Core)</option>
                <option value="2000m">2000m (2.0 Cores)</option>
              </select>
            </div>

            <div className="dash-form-group">
              <label className="dash-form-label">Memory Limit</label>
              <select
                value={ramLimit}
                onChange={(e) => setRamLimit(e.target.value)}
                className="dash-form-select"
              >
                <option value="256Mi">256 MiB</option>
                <option value="512Mi">512 MiB (Default)</option>
                <option value="1Gi">1 GiB</option>
                <option value="2Gi">2 GiB</option>
              </select>
            </div>
          </div>
        </div>

        {/* Environment Variables */}
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0F172A', fontWeight: 600 }}>
              Environment Variables (ENV)
            </h4>
            <button
              type="button"
              onClick={addEnvVar}
              className="btn-dash btn-dash-secondary btn-dash-sm"
            >
              <Plus style={{ width: '12px', height: '12px' }} />
              Add Variable
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {envVars.map((env, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="KEY"
                  value={env.key}
                  onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                  className="dash-form-input"
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  placeholder="VALUE"
                  value={env.value}
                  onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                  className="dash-form-input"
                  style={{ flex: 1 }}
                />
                {envVars.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEnvVar(i)}
                    className="btn-dash btn-dash-danger btn-dash-sm"
                    style={{ padding: '8px' }}
                  >
                    <Trash2 style={{ width: '14px', height: '14px' }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-dash btn-dash-primary"
            style={{ minWidth: '180px' }}
          >
            <Rocket style={{ width: '15px', height: '15px' }} />
            {isSubmitting ? 'Deploying to Cluster...' : 'Deploy to Cluster'}
          </button>
        </div>
      </form>
    </div>
  );
}
