import React, { useState } from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';
import { Input, Textarea } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { api } from '../lib/api';
import { FiUploadCloud } from 'react-icons/fi';

export default function IngestionPage() {
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const runIngestion = async () => {
    if (!sourceName.trim() && !sourceUrl.trim() && !notes.trim()) {
      setError('Enter a source name, URL, or ingestion notes.');
      return;
    }

    setRunning(true);
    setError('');
    try {
      const prompt = [
        'Build an ingestion plan and extraction checklist for this source.',
        `Source name: ${sourceName || 'N/A'}`,
        `Source URL: ${sourceUrl || 'N/A'}`,
        `Notes: ${notes || 'N/A'}`,
      ].join('\n');

      const { data } = await api.post('/ai-data/ask', { prompt });
      setResult(data?.answer || data?.response || JSON.stringify(data, null, 2));
    } catch (e) {
      setError(e?.response?.data?.message || 'Ingestion request failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Layout title="Ingestion" subtitle="Feed external content into the LLM">
      <Card title="Ingestion input" subtitle="Submit source details and generate a pipeline plan">
        <div style={{ display: 'grid', gap: 12 }}>
          <Input
            label="Source name"
            placeholder="Podcast transcripts, policy docs, customer tickets..."
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
          <Input
            label="Source URL"
            placeholder="https://..."
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
          <Textarea
            label="Ingestion notes"
            placeholder="Describe formats, refresh frequency, and parsing constraints..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ minHeight: 140 }}
          />
          {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
          <div>
            <Button icon={<FiUploadCloud />} onClick={runIngestion} loading={running}>
              Run ingestion planning
            </Button>
          </div>
          {result && (
            <pre className="mono" style={{ marginTop: 6, fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, whiteSpace: 'pre-wrap' }}>
              {result}
            </pre>
          )}
        </div>
      </Card>
    </Layout>
  );
}
