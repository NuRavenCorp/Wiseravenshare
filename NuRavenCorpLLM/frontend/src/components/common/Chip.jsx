import React from 'react';

const tones = {
  neutral: { bg: 'var(--surface-3)', fg: 'var(--text-secondary)' },
  accent: { bg: 'rgba(124,92,255,0.15)', fg: 'var(--accent)' },
  success: { bg: 'rgba(34,197,94,0.15)', fg: 'var(--success)' },
  warning: { bg: 'rgba(245,158,11,0.15)', fg: 'var(--warning)' },
  danger: { bg: 'rgba(239,68,68,0.15)', fg: 'var(--danger)' },
  info: { bg: 'rgba(56,189,248,0.15)', fg: 'var(--info)' },
};

export function Chip({ children, tone = 'neutral', style, ...rest }) {
  const c = tones[tone] || tones.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg, ...style }} {...rest}>
      {children}
    </span>
  );
}
