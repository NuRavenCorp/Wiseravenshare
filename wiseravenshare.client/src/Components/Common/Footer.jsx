import React from 'react';

/**
 * Site-wide footer for WiseRavenShare.
 * Uses the same inline-style pattern as the rest of the WRS component library.
 */
export default function Footer() {
  const year = 2025;

  return (
    <footer style={{
      background: 'var(--card-background, #1a1a2e)',
      borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
      padding: '24px 20px',
      marginTop: '48px',
      color: 'var(--secondary-text, #9ca3af)',
      fontSize: '13px',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        <p style={{ margin: 0 }}>
          © {year} WiseRavenShare. All rights reserved.
        </p>
        <div style={{ display: 'flex', gap: '20px' }}>
          {[
            { label: 'Privacy Policy',   href: '/privacy-policy'  },
            { label: 'Terms of Service', href: '/terms-of-service' },
            { label: 'WiseRavenStream',  href: 'https://wiseravenstream.com', external: true },
          ].map(({ label, href, external }) => (
            <a
              key={label}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              style={{
                color: 'var(--accent-color, #a78bfa)',
                textDecoration: 'none',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.target.style.opacity = '0.75')}
              onMouseLeave={e => (e.target.style.opacity = '1')}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
