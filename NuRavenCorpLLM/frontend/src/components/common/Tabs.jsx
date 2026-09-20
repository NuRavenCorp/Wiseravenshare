import React from 'react';
import { motion } from 'framer-motion';

export function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', padding: 4, background: 'var(--surface-2)', borderRadius: 999, border: '1px solid var(--border)' }}>
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{ position: 'relative', padding: '8px 16px', background: 'transparent', border: 'none', color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, zIndex: 1 }}>
            {active && <motion.div layoutId="tab-active" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', borderRadius: 999, boxShadow: 'var(--glow-accent)', zIndex: -1 }} transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
