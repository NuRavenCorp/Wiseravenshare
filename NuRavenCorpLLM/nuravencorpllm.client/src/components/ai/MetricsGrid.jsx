import React from 'react';
import { FiActivity } from 'react-icons/fi';

export const MetricsGrid = ({ title, data }) => {
  const items = Array.isArray(data) ? data : [];

  return (
    <div className="glass-card">
      {title && <div className="subtle-title">{title}</div>}
      <div className="metrics-grid">
        {items.map((item, i) => (
          <div className="metric-card" key={`${item.label}-${i}`}>
            <FiActivity />
            <div className="metric-label">{item.label}</div>
            <div className="metric-value">{formatNumber(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatNumber(n) {
  if (n == null) {
    return '—';
  }

  const value = Number(n);
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return value.toLocaleString();
}
