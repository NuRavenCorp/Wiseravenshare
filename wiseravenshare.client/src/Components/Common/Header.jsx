import React from 'react';
import WiseRavenLogo from './WiseRavenLogo';

const Header = ({ onLogout, user }) => {

    return (
        <header style={{
            background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
            color: 'var(--text-color)',
            padding: '1rem 0',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            position: 'sticky',
            top: 0,
            zIndex: 100
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                maxWidth: '1400px',
                margin: '0 auto',
                padding: '0 20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <WiseRavenLogo />
                    <span style={{
                        background: 'var(--secondary-color)',
                        color: '#ffb6c8',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase'
                    }}>Ravensight Active</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span>Welcome, {user?.name || 'Guest'}</span>
                    <button onClick={onLogout} style={{
                        background: 'var(--accent-color)',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        fontWeight: '600'
                    }}>Logout</button>
                </div>
            </div>
        </header>
    );
};

export default Header;