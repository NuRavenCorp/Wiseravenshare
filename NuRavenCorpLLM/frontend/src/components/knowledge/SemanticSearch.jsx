import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Chip } from '../common/Chip';
import { api, endpoints } from '../../lib/api';
import { truncate } from '../../lib/format';
import { FiSearch } from 'react-icons/fi';

export function SemanticSearch({ onResults }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!query.trim()) { setResults(null); onResults?.(null); return; }
    setLoading(true);
    try {
      const { data } = await api.post(`${endpoints.knowledge}/search`, { query, topK: 8 });
      setResults(data);
      onResults?.(data);
    } finally { setLoading(false); }
  };

  return (
    <Card title="Semantic search">
      <div style={{ display: 'flex', gap: 10 }}>
        <Input
          icon={<FiSearch />}
          placeholder="Search your knowledge base…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button loading={loading} onClick={run}>Search</Button>
      </div>
      {results && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map((r, i) => (
            <div key={i} style={{
              padding: 12, borderRadius: 10,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{r.title}</strong>
                <Chip tone="accent">{(r.score * 100).toFixed(0)}%</Chip>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{truncate(r.content, 200)}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
