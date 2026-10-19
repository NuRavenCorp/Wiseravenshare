import React, { useState } from 'react';
import { FiSend } from 'react-icons/fi';
import { Button } from '../common/Button';

export function Composer({ onSend, disabled, streaming }) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <div style={{ display: 'flex', gap: 10, padding: 14, borderTop: '1px solid var(--border)', background: 'var(--surface-1)' }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Ask anything…" style={{ flex: 1, padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text-primary)', fontSize: 14, resize: 'none' }} />
      <Button onClick={submit} disabled={disabled || streaming || !text.trim()} icon={<FiSend />}>
        {streaming ? 'Streaming' : 'Send'}
      </Button>
    </div>
  );
}
