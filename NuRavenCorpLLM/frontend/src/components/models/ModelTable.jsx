import React from 'react';
import { Chip } from '../common/Chip';
import { formatNumber, formatCurrency } from '../../lib/format';
import { FiCpu } from 'react-icons/fi';

export function ModelTable({ models }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {models.map((m) => (
        <div key={m.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: 14, borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FiCpu size={14} color="var(--accent)" />
              <strong style={{ fontSize: 13 }}>{m.displayName}</strong>
              <Chip tone="accent">{m.kind}</Chip>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Context: {formatNumber(m.contextWindowTokens)} · Max output: {formatNumber(m.maxOutputTokens)}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div>In: {formatCurrency(m.inputCostPer1K)}/1K</div>
            <div style={{ color: 'var(--text-muted)' }}>Out: {formatCurrency(m.outputCostPer1K)}/1K</div>
          </div>
        </div>
      ))}
    </div>
  );
}
