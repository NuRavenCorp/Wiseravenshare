import React from 'react';

export function MessageBubble({ role, content, streaming }) {
  const isUser = role === 'User' || role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
      <div style={{ maxWidth: '80%', padding: '12px 16px', borderRadius: 16, background: isUser ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'var(--surface-2)', border: isUser ? 'none' : '1px solid var(--border)', color: isUser ? 'white' : 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {content}
        {streaming && <span className="animate-pulse-soft" style={{ display: 'inline-block', marginLeft: 4, color: 'var(--accent)' }}>▍</span>}
      </div>
    </div>
  );
}
