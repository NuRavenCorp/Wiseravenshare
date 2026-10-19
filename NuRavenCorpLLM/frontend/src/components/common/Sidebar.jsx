import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FiGrid, FiMessageSquare, FiBook, FiDownloadCloud, FiFeather, FiCpu, FiTrendingUp, FiBarChart2, FiUsers, FiShield } from 'react-icons/fi';

const nav = [
  { to: '/', label: 'Dashboard', icon: FiGrid },
  { to: '/conversations', label: 'Conversations', icon: FiMessageSquare },
  { to: '/knowledge', label: 'Knowledge', icon: FiBook },
  { to: '/ingestion', label: 'Ingestion', icon: FiDownloadCloud },
  { to: '/craft', label: 'Craft', icon: FiFeather },
  { to: '/models', label: 'Models', icon: FiCpu },
  { to: '/learning', label: 'Learning', icon: FiTrendingUp },
  { to: '/analytics', label: 'Analytics', icon: FiBarChart2 },
  { to: '/clients', label: 'Clients', icon: FiUsers },
  { to: '/governance', label: 'Governance', icon: FiShield },
];

export function Sidebar() {
  const location = useLocation();
  return (
    <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 'var(--sidebar-w)', background: 'linear-gradient(180deg, var(--surface-1) 0%, var(--surface-2) 100%)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
      <div style={{ padding: '22px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>NuRavenCorp</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>LLM Platform</div>
      </div>
      <nav className="scroll-y" style={{ flex: 1, padding: '16px 12px' }}>
        {nav.map((item) => {
          const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return (
            <NavLink key={item.to} to={item.to} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 4, borderRadius: 'var(--radius-md)', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 13, fontWeight: active ? 600 : 500, background: active ? 'rgba(124,92,255,0.12)' : 'transparent', border: active ? '1px solid rgba(124,92,255,0.25)' : '1px solid transparent' }}>
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
