import React from 'react';

export function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      {icon && <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--accent)', marginBottom: 20 }}>{icon}</div>}
      <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</h3>
      {description && <p style={{ fontSize: 13, maxWidth: 360 }}>{description}</p>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}
