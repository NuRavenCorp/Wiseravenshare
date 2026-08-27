// wiseravenshare.client/src/Components/Collaboration/PlatformBadge.jsx
// Visual indicator for the host platform (TikTok, Facebook, Instagram, etc.).
// Uses FaTiktok etc. from react-icons/fa — already part of the react-icons dependency.

import React from 'react';
import { FiGlobe, FiVideo } from 'react-icons/fi';
import { FaTiktok, FaFacebook, FaInstagram, FaTwitter } from 'react-icons/fa';

const PLATFORM_CONFIGS = {
    tiktok: { Icon: FaTiktok, color: '#000', label: 'TikTok' },
    facebook: { Icon: FaFacebook, color: '#1877f2', label: 'Facebook' },
    instagram: { Icon: FaInstagram, color: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)', label: 'Instagram' },
    twitter: { Icon: FaTwitter, color: '#1da1f2', label: 'Twitter' },
    youtube: { Icon: FiVideo, color: '#ff0000', label: 'YouTube' },
    capacitor: { Icon: FiGlobe, color: '#4f8cff', label: 'Mobile App' },
    web: { Icon: FiGlobe, color: 'var(--highlight-color)', label: 'Web' }
};

const SIZE_STYLES = {
    xs: { fontSize: '8px', padding: '2px 6px', iconSize: 10 },
    sm: { fontSize: '10px', padding: '3px 8px', iconSize: 12 },
    md: { fontSize: '12px', padding: '5px 10px', iconSize: 14 },
    lg: { fontSize: '14px', padding: '7px 12px', iconSize: 16 }
};

export const PlatformBadge = ({ platform = 'web', size = 'sm', showLabel = true, style = {} }) => {
    const config = PLATFORM_CONFIGS[String(platform || 'web').toLowerCase()] || PLATFORM_CONFIGS.web;
    const sizes = SIZE_STYLES[size] || SIZE_STYLES.sm;

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '999px',
                background: config.color,
                color: '#fff',
                ...sizes,
                ...style
            }}
        >
            <config.Icon size={sizes.iconSize} />
            {showLabel && <span>{config.label}</span>}
        </span>
    );
};

export default PlatformBadge;
