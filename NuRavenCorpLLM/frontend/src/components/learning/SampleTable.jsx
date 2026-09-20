import React from 'react';
import { Chip } from '../common/Chip';
import { relativeTime } from '../../lib/format';

export function SampleTable({ samples }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {samples.map((s) => (
        <div key={s.id} style={{
          padding: 14, borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Chip tone={s.status === 'Approved' ? 'success' : s.status === 'Rejected' ? 'danger' : 'warning'}>
              {s.status}
            </Chip>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relativeTime(s.createdAt)}</span>
          </div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            <strong>Prompt:</strong> {s.userPrompt?.substring(0, 120)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>Response:</strong> {s.assistantResponse?.substring(0, 160)}
          </div>
          <div style={{ marginTop: 8 }}>
            <Chip tone="accent">Quality: {s.quality}</Chip>
          </div>
        </div>
      ))}
    </div>
  );
}
