import React, { useState } from 'react';
import { Card } from './Card';
import { Input, Textarea } from './Input';
import { Button } from './Button';
import { api } from '../../lib/api';

export function PromptInputCard({
  section,
  title = 'Prompt input',
  subtitle = 'Submit prompts to the learning conduit.',
  placeholder = 'Enter your prompt...',
}) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError('');
    setResponseText('');
    try {
      const { data } = await api.post('/ai-data/ask', {
        prompt: `[${section}] ${message.trim()}`,
      });
      setResponseText(data?.answer || data?.narrative || 'Prompt submitted successfully.');
      setMessage('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Prompt submission failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={title} subtitle={subtitle}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Input
          label="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
        <Textarea
          label="Prompt"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={placeholder}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 12, color: error ? 'var(--danger)' : 'var(--text-muted)' }}>
            {error || (responseText ? 'Response received' : 'Ready')}
          </div>
          <Button onClick={submit} loading={loading} disabled={!message.trim()}>
            Submit prompt
          </Button>
        </div>
        {responseText && (
          <div style={{
            fontSize: 13,
            color: 'var(--text-primary)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
            whiteSpace: 'pre-wrap',
          }}>
            {responseText}
          </div>
        )}
      </div>
    </Card>
  );
}
