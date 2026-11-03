import React, { useState } from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';
import { Textarea } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { api } from '../lib/api';
import { FiBookOpen } from 'react-icons/fi';

export default function LearningPage() {
  const [sample, setSample] = useState('');
  const [goal, setGoal] = useState('');
  const [insights, setInsights] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const generateInsights = async () => {
    if (!sample.trim() && !goal.trim()) {
      setError('Add a learning sample or coaching goal.');
      return;
    }

    setRunning(true);
    setError('');
    try {
      const prompt = [
        'Review this learning sample and return coaching feedback, gaps, and next actions.',
        `Goal: ${goal || 'N/A'}`,
        'Sample:',
        sample || 'N/A',
      ].join('\n');
      const { data } = await api.post('/ai-data/ask', { prompt });
      setInsights(data?.answer || data?.response || JSON.stringify(data, null, 2));
    } catch (e) {
      setError(e?.response?.data?.message || 'Learning analysis failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Layout title="Learning" subtitle="Sample review, batch management, fine-tuning">
      <Card title="Learning input" subtitle="Submit training samples and get actionable feedback">
        <div style={{ display: 'grid', gap: 12 }}>
          <Textarea
            label="Learning goal"
            placeholder="What skill or behavior should improve?"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            style={{ minHeight: 80 }}
          />
          <Textarea
            label="Sample content"
            placeholder="Paste transcript, response samples, QA pairs, or evaluation notes..."
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            style={{ minHeight: 180 }}
          />
          {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
          <div>
            <Button icon={<FiBookOpen />} onClick={generateInsights} loading={running}>
              Analyze sample
            </Button>
          </div>
          {insights && (
            <pre className="mono" style={{ marginTop: 6, fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, whiteSpace: 'pre-wrap' }}>
              {insights}
            </pre>
          )}
        </div>
      </Card>
    </Layout>
  );
}
