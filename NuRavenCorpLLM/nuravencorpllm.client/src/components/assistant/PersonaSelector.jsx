// src/components/assistant/PersonaSelector.jsx
import React from 'react';

const PERSONAS = ['Default', 'Professional', 'Friendly', 'Concise', 'Creative', 'Technical', 'Educator'];

export const PersonaSelector = ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-white/5 border border-border rounded-lg px-2 py-1 text-xs">
        {PERSONAS.map(p => <option key={p}>{p}</option>)}
    </select>
);