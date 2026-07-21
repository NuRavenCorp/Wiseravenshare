// src/components/ui/Card.tsx
import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    hoverable?: boolean;
    animate?: boolean;
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    onClick,
    hoverable = true,
    animate = true,
}) => {
    const baseStyles = 'rounded-xl border border-border bg-card overflow-hidden';

    const hoverStyles = hoverable
        ? 'transition-all duration-200 hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5'
        : '';

    const content = (
        <div className={`${baseStyles} ${hoverStyles} ${className}`}>
            {children}
        </div>
    );

    if (animate) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={onClick}
                className="cursor-pointer"
            >
                {content}
            </motion.div>
        );
    }

    return onClick ? (
        <div onClick={onClick} className="cursor-pointer">
            {content}
        </div>
    ) : (
        content
    );
};