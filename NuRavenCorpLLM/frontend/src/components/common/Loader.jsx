import React from 'react';

export function Loader({ label = 'Loading', size = 32 }) {
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div className="animate-spin" style={{ width: size, height: size, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}…</span>
    </div>
  );
}
