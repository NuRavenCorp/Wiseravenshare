import React from 'react';

const variants = {
  primary: { background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'white', border: 'none', boxShadow: 'var(--glow-accent)' },
  secondary: { background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
  ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' },
  danger: { background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', border: 'none' },
};

const sizes = {
  sm: { padding: '6px 12px', fontSize: '12px' },
  md: { padding: '10px 18px', fontSize: '13px' },
  lg: { padding: '14px 24px', fontSize: '14px' },
};

export function Button({ children, variant = 'primary', size = 'md', loading = false, icon, disabled, style, ...rest }) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 'var(--radius-md)',
        fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s var(--ease-out)',
        opacity: disabled || loading ? 0.6 : 1, ...variants[variant], ...sizes[size], ...style,
      }}
      {...rest}
    >
      {loading ? <span className="animate-spin" style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }} /> : icon}
      {children}
    </button>
  );
}
