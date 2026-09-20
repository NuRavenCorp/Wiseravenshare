import React from 'react';

export function Card({ children, title, subtitle, action, padding = 20, style, ...rest }) {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, var(--surface-2) 0%, var(--surface-1) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding,
        ...style,
      }}
      {...rest}
    >
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            {title && <h3 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>}
            {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
