import React, { useState } from 'react';
import { Button } from '../common/Button';
import { FiKey, FiCopy, FiTrash2 } from 'react-icons/fi';
import { relativeTime } from '../../lib/format';

export function ApiKeyManager({ keys, onIssue, onRevoke }) {
  const [newKey, setNewKey] = useState(null);

  const issue = async () => {
    const k = await onIssue();
    setNewKey(k);
  };

  return (
    <div>
      <Button size="sm" icon={<FiKey />} onClick={issue} style={{ marginBottom: 16 }}>
        Issue new key
      </Button>

      {newKey && (
        <div style={{
          padding: 14, borderRadius: 10, marginBottom: 16,
          background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
            Copy now — shown only once
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code className="mono" style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{newKey}</code>
            <Button size="sm" variant="secondary" icon={<FiCopy />} onClick={() => navigator.clipboard.writeText(newKey)} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {keys.map((k) => (
          <div key={k.id} style={{
            padding: 12, borderRadius: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{k.label || 'Untitled'}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {k.prefix}••••••••
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {k.lastUsedAt ? `Last used ${relativeTime(k.lastUsedAt)}` : 'Never used'}
              </div>
            </div>
            <button
              onClick={() => onRevoke(k.id)}
              style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
            >
              <FiTrash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
