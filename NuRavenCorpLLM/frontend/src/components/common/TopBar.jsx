import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { FiMoon, FiSun, FiLogOut } from 'react-icons/fi';

export function TopBar({ title, subtitle, action }) {
  const { theme, toggle } = useTheme();
  const { logout } = useAuth();
  return (
    <div style={{ height: 'var(--topbar-h)', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'rgba(11, 13, 18, 0.7)', backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 10 }}>
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {action}
        <button onClick={toggle} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {theme === 'dark' ? <FiSun size={16} /> : <FiMoon size={16} />}
        </button>
        <button onClick={logout} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FiLogOut size={16} />
        </button>
      </div>
    </div>
  );
}
