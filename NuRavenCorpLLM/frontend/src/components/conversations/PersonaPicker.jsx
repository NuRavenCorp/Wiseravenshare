import React from 'react';

const PERSONAS = ['Default', 'Professional', 'Friendly', 'Concise', 'Creative', 'Technical', 'Educator'];

export function PersonaPicker({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}>
      {PERSONAS.map((p) => <option key={p}>{p}</option>)}
    </select>
  );
}
