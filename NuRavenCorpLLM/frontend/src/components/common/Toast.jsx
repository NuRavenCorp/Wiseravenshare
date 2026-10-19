import React from 'react';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiAlertCircle, FiInfo } from 'react-icons/fi';

const icons = {
  success: <FiCheckCircle color="var(--success)" />,
  error: <FiAlertCircle color="var(--danger)" />,
  info: <FiInfo color="var(--info)" />,
};

function show(message, kind = 'info') {
  toast.custom((t) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 12,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-2)',
        opacity: t.visible ? 1 : 0,
        transition: 'opacity 0.2s',
      }}
    >
      {icons[kind]}
      <span style={{ fontSize: 13 }}>{message}</span>
    </div>
  ));
}

export const notify = {
  success: (m) => show(m, 'success'),
  error: (m) => show(m, 'error'),
  info: (m) => show(m, 'info'),
};
