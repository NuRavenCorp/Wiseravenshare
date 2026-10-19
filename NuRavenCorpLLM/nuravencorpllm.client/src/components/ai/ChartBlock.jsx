import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const COLORS = ['#8b5cf6', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b'];

export const ChartBlock = ({ title, data }) => {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const merged = mergeSeries(data);

  return (
    <div className="glass-card">
      {title && <div className="subtle-title">{title}</div>}
      <div className="chart-box">
        <ResponsiveContainer>
          <AreaChart data={merged.rows}>
            <defs>
              {merged.series.map((name, i) => (
                <linearGradient key={name} id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" stroke="#98a2b3" />
            <YAxis stroke="#98a2b3" />
            <Tooltip />
            <Legend />
            {merged.series.map((name, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                fill={`url(#grad-${name})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

function mergeSeries(data) {
  const labels = new Set();
  const series = data.map((item) => item.source);

  data.forEach((item) => {
    (item.points || []).forEach((point) => labels.add(point.label));
  });

  const rows = Array.from(labels).sort().map((label) => {
    const row = { label };
    data.forEach((item) => {
      const point = (item.points || []).find((x) => x.label === label);
      row[item.source] = point ? Number(point.value) : 0;
    });
    return row;
  });

  return { series, rows };
}
