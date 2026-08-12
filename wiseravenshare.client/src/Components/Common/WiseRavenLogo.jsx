import React from 'react';

const WiseRavenLogo = ({ size = 'compact', showTagline = true }) => {
    const emblemSize = size === 'hero' ? 72 : 42;
    const titleSize = size === 'hero' ? '2rem' : '1.35rem';
    const taglineSize = size === 'hero' ? '0.85rem' : '0.7rem';
    const pyramidScale = size === 'hero' ? 1.4 : 1;

    return (
        <div className="ancient-raven-mark" style={{ display: 'flex', alignItems: 'center', gap: size === 'hero' ? '16px' : '12px' }}>
            <div
                aria-hidden="true"
                style={{
                    width: `${emblemSize + 26}px`,
                    height: `${emblemSize + 26}px`,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${pyramidScale})`,
                    transformOrigin: 'center',
                    filter: 'drop-shadow(0 0 16px rgba(255, 201, 94, 0.42))'
                }}
            >
                <svg
                    width={emblemSize + 30}
                    height={emblemSize + 30}
                    viewBox="0 0 110 110"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ position: 'absolute', inset: 0 }}
                >
                    <path d="M55 11L88 81H22L55 11Z" stroke="rgba(255,207,109,0.9)" strokeWidth="2.5" strokeLinejoin="round"/>
                    <path d="M38 81L55 35L72 81H38Z" stroke="rgba(255,207,109,0.8)" strokeWidth="1.8" strokeLinejoin="round"/>
                    <path d="M18 81H92" stroke="rgba(255,207,109,0.8)" strokeWidth="2.2" strokeLinecap="round"/>
                    <path d="M30 81L55 52L80 81" stroke="rgba(255,207,109,0.75)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="55" cy="52" r="8" fill="rgba(255,228,160,0.16)" stroke="rgba(255,228,160,0.7)" strokeWidth="1.3"/>
                    <circle cx="55" cy="52" r="3" fill="rgba(255,228,160,0.95)"/>
                </svg>
                <div
                    aria-hidden="true"
                    style={{
                        width: `${emblemSize}px`,
                        height: `${emblemSize}px`,
                        borderRadius: '18px',
                        background: 'radial-gradient(circle at top left, #f5d0fe 0%, var(--highlight-color) 30%, var(--accent-color) 68%, #190b20 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 16px 36px rgba(6, 10, 24, 0.34)',
                        border: '1px solid rgba(255,255,255,0.18)',
                        position: 'relative',
                        overflow: 'hidden',
                        zIndex: 1
                    }}
                >
                    <svg width={emblemSize - 6} height={emblemSize - 6} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 42C20 26 30 18 46 16C39 22 35 28 34 36C40 32 47 31 54 34C47 34 41 38 37 44C31 52 23 55 12 52C16 50 18 47 19 44C17 44 15 43 12 42Z" fill="rgba(255,255,255,0.92)"/>
                        <path d="M29 19L36 25L44 17" stroke="#FFE2E8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="43" cy="24" r="2.4" fill="#0F172A"/>
                    </svg>
                </div>
            </div>
            <div style={{ lineHeight: 1 }}>
                <div
                    style={{
                        fontSize: titleSize,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-color)'
                    }}
                >
                    WiseRaven
                </div>
                {showTagline && (
                    <div
                        style={{
                            marginTop: '6px',
                            fontSize: taglineSize,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: 'var(--highlight-color)'
                        }}
                    >
                        Truth. Signal. Flight.
                    </div>
                )}
            </div>
        </div>
    );
};

export default WiseRavenLogo;
