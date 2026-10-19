import React from 'react';

export function Input({ label, hint, error, icon, style, ...rest }) {
  return (
    <label style={{ display: 'block' }}>
      {label && <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>{label}</span>}
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>{icon}</span>}
        <input
          style={{
            width: '100%', padding: '10px 14px', paddingLeft: icon ? 38 : 14, background: 'var(--surface-2)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
            fontSize: 13, outline: 'none', ...style,
          }}
          {...rest}
        />
      </div>
      {error && <span style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, display: 'block' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>{hint}</span>}
    </label>
  );
}

export function Textarea({ label, style, ...rest }) {
  return (
    <label style={{ display: 'block' }}>
      {label && <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>{label}</span>}
      <textarea
        style={{
          width: '100%', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 80, ...style,
        }}
        {...rest}
      />
    </label>
  );
}
