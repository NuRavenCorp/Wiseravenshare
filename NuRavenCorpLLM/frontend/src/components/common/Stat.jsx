import React from 'react';

export function Stat({ label, value, delta, icon, accent = 'var(--accent)' }) {
  const deltaPositive = delta != null && delta >= 0;
  return (
    <div style={{ background: 'linear-gradient(180deg, var(--surface-2), var(--surface-1))', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {icon && <span style={{ color: accent, fontSize: 18, display: 'flex' }}>{icon}</span>}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {delta != null && <div style={{ fontSize: 12, marginTop: 8, color: deltaPositive ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{deltaPositive ? '▲' : '▼'} {Math.abs(delta)}%</div>}
    </div>
  );
}
