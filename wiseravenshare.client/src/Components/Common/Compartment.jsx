import React, { useState, useEffect } from 'react';

const Compartment = ({
    children,
    title,
    badge,
    className = '',
    style = {},
    expandable = true,
    onFullscreenChange,
    headerRight = null
}) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [tilt, setTilt] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
                if (typeof onFullscreenChange === 'function') {
                    onFullscreenChange(false);
                }
            }
        };

        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        } else {
            document.body.style.overflow = '';
            setTilt({ x: 0, y: 0 });
        }

        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isFullscreen, onFullscreenChange]);

    const handleMouseMove = (e) => {
        if (!isFullscreen) return;
        const { clientX, clientY } = e;
        const { innerWidth, innerHeight } = window;
        const rotY = ((clientX / innerWidth) - 0.5) * 6;
        const rotX = ((clientY / innerHeight) - 0.5) * -6;
        setTilt({ x: rotX, y: rotY });
    };

    const toggleFullscreen = () => {
        if (!expandable) return;
        const nextState = !isFullscreen;
        setIsFullscreen(nextState);
        if (typeof onFullscreenChange === 'function') {
            onFullscreenChange(nextState);
        }
    };

    const handleDoubleClick = (e) => {
        if (!expandable) return;

        const target = e.target;
        if (target) {
            const tagName = target.tagName ? target.tagName.toLowerCase() : '';
            const isFormInput = (
                ['input', 'textarea', 'select', 'option', 'label'].includes(tagName) ||
                target.isContentEditable ||
                target.closest('input') ||
                target.closest('textarea') ||
                target.closest('select')
            );

            if (isFormInput) {
                return;
            }
        }

        toggleFullscreen();
    };

    if (isFullscreen) {
        return (
            <>
                <div
                    className="compartment-3d-backdrop"
                    onClick={toggleFullscreen}
                    title="Click backdrop or press Esc to return"
                />
                <div
                    onDoubleClick={handleDoubleClick}
                    onMouseMove={handleMouseMove}
                    className={`compartment-fullscreen-overlay leap-3d-active ${className}`}
                    style={{
                        position: 'fixed',
                        inset: '20px',
                        zIndex: 99999,
                        backgroundColor: 'var(--bg-color, #090f1f)',
                        color: 'var(--text-color, #f4f7ff)',
                        padding: '24px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        boxSizing: 'border-box',
                        borderRadius: '20px',
                        border: '1px solid rgba(79, 116, 214, 0.45)',
                        boxShadow: '0 30px 90px -10px rgba(0,0,0,0.85), 0 0 60px rgba(79, 116, 214, 0.35)',
                        transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                        transition: 'transform 0.1s ease-out',
                        transformStyle: 'preserve-3d'
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justify: 'space-between',
                            padding: '14px 20px',
                            background: 'rgba(21, 31, 58, 0.95)',
                            border: '1px solid var(--border-color, #2b3a66)',
                            borderRadius: '14px',
                            backdropFilter: 'blur(12px)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            boxShadow: '0 10px 25px rgba(0,0,0,0.4)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {badge && (
                                <span
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        padding: '4px 10px',
                                        borderRadius: '999px',
                                        background: 'var(--highlight-color, #4f74d6)',
                                        color: '#fff',
                                        boxShadow: '0 0 12px rgba(79, 116, 214, 0.6)'
                                    }}
                                >
                                    {badge}
                                </span>
                            )}
                            <span style={{ fontWeight: '700', fontSize: '18px', letterSpacing: '0.02em' }}>
                                {title || '3D Expanded View'}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--light-color, #d7e1ff)', opacity: 0.85 }}>
                                ✨ 3D Leap Activated (Double-click empty space or press Esc to return)
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {headerRight}
                            <button
                                type="button"
                                onClick={toggleFullscreen}
                                title="Return to normal view (Double-click or Esc)"
                                style={{
                                    border: '1px solid var(--highlight-color, #4f74d6)',
                                    background: 'linear-gradient(135deg, var(--highlight-color, #4f74d6), var(--accent-color, #a33a5d))',
                                    color: '#fff',
                                    padding: '9px 18px',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 15px rgba(79,116,214,0.4)'
                                }}
                            >
                                <span>✕ Return to Normal</span>
                            </button>
                        </div>
                    </div>

                    <div style={{ flex: 1, transformStyle: 'preserve-3d' }}>
                        {children}
                    </div>
                </div>
            </>
        );
    }

    return (
        <div
            onDoubleClick={handleDoubleClick}
            className={`compartment-container ${className}`}
            title={expandable ? 'Double-click to leap off page in 3D' : undefined}
            style={{
                position: 'relative',
                transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.25s ease',
                cursor: expandable ? 'pointer' : 'default',
                ...style
            }}
        >
            {expandable && (badge || title) && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'space-between',
                        marginBottom: '8px',
                        userSelect: 'none'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {badge && (
                            <span
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    padding: '3px 8px',
                                    borderRadius: '999px',
                                    background: 'rgba(79, 116, 214, 0.2)',
                                    border: '1px solid var(--border-color, #2b3a66)',
                                    color: 'var(--light-color, #d7e1ff)'
                                }}
                            >
                                {badge}
                            </span>
                        )}
                        {title && (
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-color, #f4f7ff)' }}>
                                {title}
                            </span>
                        )}
                    </div>
                    <span
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFullscreen();
                        }}
                        title="Double-click or click here to leap off page in 3D"
                        style={{
                            fontSize: '11px',
                            color: 'var(--light-color, #d7e1ff)',
                            opacity: 0.8,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}
                    >
                        ✨ 3D Leap (Double-click)
                    </span>
                </div>
            )}
            {children}
        </div>
    );
};

export default Compartment;
