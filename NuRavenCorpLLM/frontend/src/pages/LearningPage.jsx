import React, { useState } from 'react';
import { Layout } from '../components/common/Layout';
import { PromptInputCard } from '../components/common/PromptInputCard';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { api } from '../lib/api';

function TrainingCommencePanel() {
  const [lookbackDays, setLookbackDays] = useState(30);
  const [batchSize, setBatchSize] = useState(100);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleCommence() {
    setStatus('loading');
    setResult(null);
    setError('');
    try {
      const res = await api.post('/assistant/training/commence', {
        lookbackDays: Number(lookbackDays),
        curateBatchSize: Number(batchSize),
      });
      setResult(res.data);
      setStatus('success');
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data || err.message || 'Training commence failed.');
      setStatus('error');
    }
  }

  return (
    <Card
      title="Commence Training Dataset Build"
      subtitle="Apply feedback, curate samples, and generate a fine-tune JSONL dataset."
      style={{ marginBottom: 20 }}
    >
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Lookback days</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={lookbackDays}
            onChange={(e) => setLookbackDays(e.target.value)}
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              padding: '6px 10px',
              width: 120,
              fontSize: 13,
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Curate batch size</span>
          <input
            type="number"
            min={1}
            max={5000}
            value={batchSize}
            onChange={(e) => setBatchSize(e.target.value)}
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              padding: '6px 10px',
              width: 120,
              fontSize: 13,
            }}
          />
        </label>
      </div>

      <Button
        onClick={handleCommence}
        loading={status === 'loading'}
        disabled={status === 'loading'}
        icon={<span>▶</span>}
      >
        {status === 'loading' ? 'Building dataset…' : 'Commence Training'}
      </Button>

      {status === 'success' && result && (
        <div style={{
          marginTop: 16,
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          fontSize: 13,
        }}>
          <p style={{ color: 'var(--success, #22c55e)', fontWeight: 700, marginBottom: 8 }}>
            ✓ Dataset ready — {result.status}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {[
              ['Records', result.records],
              ['Bytes', result.bytes?.toLocaleString()],
              ['Feedback applied', result.feedbackApplied],
              ['Lookback days', result.lookbackDays],
            ].map(([label, val]) => (
              <div key={label}>
                <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>{label}</p>
                <p style={{ fontWeight: 600 }}>{val ?? '—'}</p>
              </div>
            ))}
          </div>
          {result.outputPath && (
            <p style={{ marginTop: 10, color: 'var(--text-secondary)', wordBreak: 'break-all', fontSize: 12 }}>
              📁 {result.outputPath}
            </p>
          )}
        </div>
      )}

      {status === 'error' && (
        <p style={{ marginTop: 12, color: 'var(--error, #ef4444)', fontSize: 13 }}>✗ {error}</p>
      )}
    </Card>
  );
}

export default function LearningPage() {
  return (
    <Layout title="Learning" subtitle="Sample review, batch management, fine-tuning">
      <TrainingCommencePanel />
      <PromptInputCard
        section="learning"
        title="Learning prompt input"
        subtitle="Submit learning prompts for review and pipeline curation."
        placeholder="Describe the learning rule, correction, or training prompt..."
      />
    </Layout>
  );
}
