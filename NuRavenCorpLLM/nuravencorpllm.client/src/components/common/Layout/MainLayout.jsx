import React from 'react';

export const MainLayout = ({ children }) => (
  <div className="app-shell">
    <aside className="app-sidebar">
      <div className="brand">WiseRavenShare</div>
      <nav className="side-nav">
        <a href="/ai" className="side-nav-item active">
          <span className="side-nav-icon">✨</span>
          <span>AI Command</span>
        </a>
      </nav>
    </aside>
    <section className="app-content">{children}</section>
  </div>
);
