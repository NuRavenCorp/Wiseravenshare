import React from 'react';

const VOICES = [
  { id: 'alloy', label: 'Alloy — neutral' },
  { id: 'echo', label: 'Echo — male' },
  { id: 'fable', label: 'Fable — British' },
  { id: 'onyx', label: 'Onyx — deep' },
  { id: 'nova', label: 'Nova — warm' },
  { id: 'shimmer', label: 'Shimmer — bright' }
];

export const VoiceSelector = ({ value, onChange }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="bg-white/5 border border-border rounded-lg px-2 py-1 text-xs"
    style={{ color: 'var(--text-color)' }}>
    {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
  </select>
);
