// src/components/ui/Avatar.tsx
import React from 'react';

interface AvatarProps {
    src?: string | null;
    alt?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    onClick?: () => void;
}

const isSafeAvatarSource = (value?: string | null): value is string => {
    if (!value || typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return false;
    }

    if (trimmed.startsWith('data:image/')) {
        return trimmed.length <= 2_000_000 && /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed);
    }

    if (trimmed.startsWith('/')) {
        return true;
    }

    return /^https?:\/\//i.test(trimmed) || /^blob:/i.test(trimmed);
};

export const Avatar: React.FC<AvatarProps> = ({
    src,
    alt = 'User',
    size = 'md',
    className = '',
    onClick,
}) => {
    const sizes = {
        xs: 'w-6 h-6 text-xs',
        sm: 'w-8 h-8 text-sm',
        md: 'w-10 h-10 text-base',
        lg: 'w-12 h-12 text-lg',
        xl: 'w-16 h-16 text-xl',
    };

    const getInitials = () => {
        return alt
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const safeSrc = isSafeAvatarSource(src) ? src : null;

    return (
        <div
            onClick={onClick}
            className={`rounded-full overflow-hidden flex-shrink-0 ${sizes[size]} ${className} ${onClick ? 'cursor-pointer hover:opacity-80 transition' : ''
                }`}
        >
            {safeSrc ? (
                <img
                    src={safeSrc}
                    alt={alt}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        const element = e.target as HTMLImageElement;
                        element.style.display = 'none';
                        const parent = element.parentElement;
                        if (parent) {
                            parent.textContent = getInitials();
                        }
                    }}
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-secondary text-white font-medium">
                    {getInitials()}
                </div>
            )}
        </div>
    );
};