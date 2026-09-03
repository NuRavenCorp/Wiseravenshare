import React from 'react';

const WiseRavenLogo = ({ size = 'compact', showTagline = true }) => {
    // Use new image-based logo from public assets
    const logoHeight = size === 'hero' ? '80px' : '48px';
    const logoWidth = size === 'hero' ? '80px' : '48px';
    
    return (
        <div className="ancient-raven-mark" style={{ display: 'flex', alignItems: 'center', gap: size === 'hero' ? '16px' : '12px' }}>
            <img 
                src="/full-logo.png" 
                alt="WiseRaven Logo" 
                style={{
                    height: logoHeight,
                    width: logoWidth,
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 0 16px rgba(255, 201, 94, 0.42))',
                }}
            />
            {size === 'hero' && showTagline && (
                <div style={{ lineHeight: 1 }}>
                    <div
                        style={{
                            fontSize: '2rem',
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--text-color)'
                        }}
                    >
                        WiseRaven
                    </div>
                    <div
                        style={{
                            marginTop: '6px',
                            fontSize: '0.85rem',
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: 'var(--highlight-color)'
                        }}
                    >
                        Truth. Signal. Flight.
                    </div>
                </div>
            )}
        </div>
    );
};

export default WiseRavenLogo;
