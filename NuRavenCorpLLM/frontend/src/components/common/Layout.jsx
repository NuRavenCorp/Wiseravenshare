import React from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout({ title, subtitle, action, children }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ marginLeft: 'var(--sidebar-w)' }}>
        <TopBar title={title} subtitle={subtitle} action={action} />
        <main style={{ padding: 28, maxWidth: 1400, margin: '0 auto' }}>{children}</main>
      </div>
    </div>
  );
}
