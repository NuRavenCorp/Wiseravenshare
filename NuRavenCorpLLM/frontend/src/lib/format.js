import { formatDistanceToNow, format } from 'date-fns';

export const relativeTime = (date) => formatDistanceToNow(new Date(date), { addSuffix: true });
export const absoluteTime = (date) => format(new Date(date), 'MMM d, yyyy HH:mm');

export const formatNumber = (n) => {
  if (n == null) return '—';
  const num = Number(n);
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
};

export const formatCurrency = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n || 0);

export const truncate = (s, n = 80) =>
  s && s.length > n ? s.substring(0, n) + '…' : s;

export const percent = (n) => `${((n || 0) * 100).toFixed(1)}%`;
