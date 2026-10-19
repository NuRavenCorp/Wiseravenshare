import React from 'react';
import { Card } from '../common/Card';
import { formatCurrency } from '../../lib/format';

export function BudgetGauge({ spent = 0, budget = 500 }) {
  const pct = Math.min(100, (spent / budget) * 100);
  const tone = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--success)';

  return (
    <Card title="Budget">
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
        {formatCurrency(spent)} <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>/ {formatCurrency(budget)}</span>
      </div>
      <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone, transition: 'width 0.4s var(--ease-out)' }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{pct.toFixed(1)}% of monthly budget</div>
    </Card>
  );
}
