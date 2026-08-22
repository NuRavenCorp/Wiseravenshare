// src/components/ui/Card.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
    onDoubleClick?: (e: React.MouseEvent) => void;
    hoverable?: boolean;
    animate?: boolean;
    expandable?: boolean;
    title?: string;
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    onClick,
    onDoubleClick,
    hoverable = true,
    animate = true,
    expandable = true,
    title,
}) => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
            }
        };

        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isFullscreen]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (onDoubleClick) {
            onDoubleClick(e);
        }

        if (!expandable) return;

        const target = e.target as HTMLElement;
        if (target) {
            const tagName = target.tagName ? target.tagName.toLowerCase() : '';
            const isInteractive = (
                ['input', 'textarea', 'select', 'button', 'a', 'option', 'video', 'audio', 'label', 'svg', 'path'].includes(tagName) ||
                target.isContentEditable ||
                target.closest('button') ||
                target.closest('a') ||
                target.closest('input') ||
                target.closest('textarea') ||
                target.closest('select')
            );

            if (isInteractive) {
                return;
            }
        }

        setIsFullscreen((prev) => !prev);
    };

    if (isFullscreen) {
        return (
            <>
                <div
                    className="compartment-3d-backdrop"
                    onClick={() => setIsFullscreen(false)}
                    title="Click backdrop or press Esc to return"
                />
                <div
                    onDoubleClick={handleDoubleClick}
                    className={`leap-3d-active ${className}`}
                    style={{
                        position: 'fixed',
                        top: '20px',
                        left: '20px',
                        right: '20px',
                        bottom: '20px',
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
                        transformStyle: 'preserve-3d'
                    }}
                >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 18px',
                        background: 'rgba(21, 31, 58, 0.95)',
                        border: '1px solid var(--border-color, #2b3a66)',
                        borderRadius: '12px',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontWeight: 600, fontSize: '16px' }}>{title || 'Card View'}</span>
                        <span style={{ fontSize: '12px', color: 'var(--light-color, #d7e1ff)', opacity: 0.8 }}>
                            (Double-click empty space or press Esc to return)
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsFullscreen(false)}
                        style={{
                            border: '1px solid var(--highlight-color, #4f74d6)',
                            background: 'linear-gradient(135deg, var(--highlight-color, #4f74d6), var(--accent-color, #a33a5d))',
                            color: '#fff',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '13px'
                        }}
                    >
                        ✕ Exit Full Screen
                    </button>
                </div>
                    <div style={{ flex: 1, transformStyle: 'preserve-3d' }}>{children}</div>
                </div>
            </>
        );
    }

    const baseStyles = 'rounded-xl border border-border bg-card overflow-hidden';

    const hoverStyles = hoverable
        ? 'transition-all duration-200 hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5'
        : '';

    const content = (
        <div
            onDoubleClick={handleDoubleClick}
            className={`${baseStyles} ${hoverStyles} ${className}`}
            title={expandable ? 'Double-click to expand to full screen' : undefined}
        >
            {children}
        </div>
    );

    if (animate) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={onClick}
            >
                {content}
            </motion.div>
        );
    }

    return onClick ? (
        <div onClick={onClick}>
            {content}
        </div>
    ) : (
        content
    );
};