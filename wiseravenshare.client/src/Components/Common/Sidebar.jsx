import React, { useEffect, useState } from 'react';
import { socialGraphService } from '../../Services/SocialGraph';
import WiseRavenLogo from './WiseRavenLogo';

const parseAdminEmails = () => {
    const fromEnv = String(import.meta.env.VITE_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return new Set(['admin@wise-ravens.com', ...fromEnv]);
};

const getConnection = (feeds, ...keys) => {
    const source = feeds || {};
    for (const key of keys) {
        if (source[key]) {
            return source[key];
        }
    }
    return {};
};

const normalizeConnection = (connection, platform) => {
    const username = String(connection?.username || '').trim();
    const profileUrl = String(connection?.profileUrl || '').trim();
    const feedUrl = String(connection?.feedUrl || '').trim();

    const fallbackUrl = platform === 'facebook'
        ? (username ? `https://www.facebook.com/${username}` : '')
        : platform === 'instagram'
            ? (username ? `https://www.instagram.com/${username}` : '')
            : platform === 'youtube'
                ? (username ? `https://www.youtube.com/@${username}` : '')
                : platform === 'twitter'
                    ? (username ? `https://twitter.com/${username}` : '')
                    : platform === 'linkedin'
                        ? (username ? `https://www.linkedin.com/in/${username}` : '')
                        : (username ? `https://www.tiktok.com/@${username}` : '');

    return {
        enabled: Boolean(connection?.enabled),
        username,
        resolvedUrl: feedUrl || profileUrl || fallbackUrl
    };
};

const readCachedFeeds = () => {
    try {
        const raw = localStorage.getItem('wiseSocialFeeds');
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const hasConfiguredFeeds = (feeds) => {
    const source = feeds || {};
    const entries = [
        getConnection(source, 'facebook', 'Facebook'),
        getConnection(source, 'tikTok', 'tiktok', 'TikTok'),
        getConnection(source, 'instagram', 'Instagram'),
        getConnection(source, 'youtube', 'YouTube'),
        getConnection(source, 'twitter', 'Twitter'),
        getConnection(source, 'linkedin', 'LinkedIn')
    ];

    return entries.some((connection) => {
        if (!connection || typeof connection !== 'object') return false;
        return Boolean(
            connection.enabled ||
            String(connection.username || '').trim() ||
            String(connection.profileUrl || '').trim() ||
            String(connection.feedUrl || '').trim()
        );
    });
};

const isImageSource = (value) => {
    if (!value || typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('data:image/')) {
        return trimmed.length <= 2_000_000 && /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed);
    }
    if (trimmed.startsWith('/')) return true;
    return /^https?:\/\//i.test(trimmed) || /^blob:/i.test(trimmed);
};

const Sidebar = ({ onNavigate, currentPage, user }) => {
    const [counts, setCounts] = useState({ followers: 0, following: 0 });
    const adminEmails = parseAdminEmails();
    const isAdminUser = adminEmails.has(String(user?.email || '').trim().toLowerCase());

    useEffect(() => {
        if (!user?.id) return undefined;

        const refreshCounts = () => {
            setCounts(socialGraphService.getCounts(user.id));
        };

        socialGraphService.registerUserProfile(user);
        refreshCounts();

        window.addEventListener('wiseraven:social-updated', refreshCounts);
        return () => {
            window.removeEventListener('wiseraven:social-updated', refreshCounts);
        };
    }, [user?.id]);

    const menuItems = [
        { id: 'feed', icon: 'fas fa-home', label: 'Feed' },
        { id: 'discover', icon: 'fas fa-compass', label: 'Discover' },
        { id: 'bookmarks', icon: 'fas fa-bookmark', label: 'Bookmarks' },
        { id: 'notifications', icon: 'fas fa-bell', label: 'Notifications' },
        { id: 'messages', icon: 'fas fa-envelope', label: 'Messages' },
        { id: 'planner', icon: 'fas fa-tasks', label: 'Planner' },
        { id: 'newsroom-video', icon: 'fas fa-video', label: 'Newsroom Video' },
        { id: 'amateur-journalist', icon: 'fas fa-microphone-alt', label: 'Amateur Journalist' },
        { id: 'canvas', icon: 'fas fa-palette', label: 'Canvas Studio' },
        { id: 'truthseeker', icon: 'fas fa-shield-alt', label: 'Truth Seeker' },
        { id: 'ai-assistant', icon: 'fas fa-robot', label: 'Raven Assistant' },
        { id: 'ainews', icon: 'fas fa-newspaper', label: 'AI News' },
        { id: 'ravensight', icon: 'fas fa-video', label: 'Ravensight' },
        { id: 'profile', icon: 'fas fa-user', label: 'Profile' }
    ];

    if (isAdminUser) {
        menuItems.splice(
            8,
            0,
            { id: 'revenue', icon: 'fas fa-chart-line', label: 'Revenue' },
            { id: 'team-access-admin', icon: 'fas fa-user-shield', label: 'Team Access' }
        );
    }

    const profile = {
        name: user?.name || user?.displayName || 'Alex Raven',
        avatar: user?.avatar || user?.avatarUrl || (user?.name || user?.displayName ? (user.name || user.displayName).charAt(0).toUpperCase() : 'AR'),
        followers: counts.followers,
        following: counts.following
    };

    const hasImageAvatar = isImageSource(profile.avatar);

    const feeds = hasConfiguredFeeds(user?.socialFeeds)
        ? (user?.socialFeeds || {})
        : readCachedFeeds();
    const socialFeedItems = [
        {
            id: 'facebook-feed',
            label: 'Facebook Feed',
            icon: 'fab fa-facebook',
            color: '#93c5fd',
            connection: normalizeConnection(getConnection(feeds, 'facebook', 'Facebook'), 'facebook')
        },
        {
            id: 'tiktok-feed',
            label: 'TikTok Feed',
            icon: 'fab fa-tiktok',
            color: '#67e8f9',
            connection: normalizeConnection(getConnection(feeds, 'tikTok', 'tiktok', 'TikTok'), 'tiktok')
        },
        {
            id: 'instagram-feed',
            label: 'Instagram Feed',
            icon: 'fab fa-instagram',
            color: '#f9a8d4',
            connection: normalizeConnection(getConnection(feeds, 'instagram', 'Instagram'), 'instagram')
        },
        {
            id: 'youtube-feed',
            label: 'YouTube Feed',
            icon: 'fab fa-youtube',
            color: '#f87171',
            connection: normalizeConnection(getConnection(feeds, 'youtube', 'YouTube'), 'youtube')
        },
        {
            id: 'twitter-feed',
            label: 'Twitter / X Feed',
            icon: 'fab fa-twitter',
            color: '#38bdf8',
            connection: normalizeConnection(getConnection(feeds, 'twitter', 'Twitter'), 'twitter')
        },
        {
            id: 'linkedin-feed',
            label: 'LinkedIn Feed',
            icon: 'fab fa-linkedin',
            color: '#60a5fa',
            connection: normalizeConnection(getConnection(feeds, 'linkedin', 'LinkedIn'), 'linkedin')
        }
    ];

    return (
        <aside className="left-column">
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '14px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'center'
            }}>
                <WiseRavenLogo />
            </div>
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                textAlign: 'center',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px',
                    fontSize: '36px',
                    fontWeight: 'bold',
                    color: 'white'
                }}>
                    {hasImageAvatar ? (
                        <img
                            src={profile.avatar}
                            alt="User avatar"
                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.parentElement) {
                                    e.currentTarget.parentElement.textContent = (profile.name || 'U').charAt(0).toUpperCase();
                                }
                            }}
                        />
                    ) : (
                        (profile.name || 'U').charAt(0).toUpperCase()
                    )}
                </div>
                <h3>{profile.name}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '10px', fontSize: '0.9rem' }}>
                    <span><i className="fas fa-users"></i> {profile.followers.toLocaleString()} followers</span>
                    <span><i className="fas fa-user-friends"></i> {profile.following.toLocaleString()} following</span>
                </div>
            </div>

            <ul style={{
                listStyle: 'none',
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '10px 0',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--border-color)'
            }}>
                {menuItems.map(item => (
                    <li key={item.id}>
                        <button
                            type="button"
                            onClick={() => onNavigate(item.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '12px 20px',
                                width: '100%',
                                color: 'var(--text-color)',
                                textDecoration: 'none',
                                gap: '10px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.3s ease',
                                ...(currentPage === item.id ? {
                                    color: 'var(--light-color)',
                                    fontWeight: 'bold',
                                    borderLeft: `3px solid var(--light-color)`,
                                    background: 'rgba(255, 255, 255, 0.1)'
                                } : {})
                            }}
                            onMouseEnter={(e) => {
                                if (currentPage !== item.id) {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                    e.currentTarget.style.borderLeft = '3px solid var(--highlight-color)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (currentPage !== item.id) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.borderLeft = 'none';
                                }
                            }}
                        >
                            <i className={item.icon}></i>
                            <span>{item.label}</span>
                        </button>
                    </li>
                ))}
            </ul>

            <div style={{
                marginTop: '14px',
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '12px',
                border: '1px solid var(--border-color)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px'
                }}>
                    <strong style={{ fontSize: '0.95rem' }}>Feed List</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--light-color)' }}>Social</span>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                    {socialFeedItems.map((item) => {
                        const isActive = item.connection.enabled && item.connection.resolvedUrl;
                        return (
                            <div
                                key={item.id}
                                style={{
                                    border: `1px solid ${isActive ? item.color : 'var(--border-color)'}`,
                                    borderRadius: '10px',
                                    padding: '8px 10px',
                                    background: 'rgba(255, 255, 255, 0.02)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className={item.icon} style={{ color: item.color }}></i>
                                        <span style={{ fontSize: '0.85rem' }}>{item.label}</span>
                                    </div>

                                    {isActive ? (
                                        <a
                                            href={item.connection.resolvedUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: item.color, fontSize: '0.75rem', textDecoration: 'none' }}
                                        >
                                            Open
                                        </a>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onNavigate({ page: 'profile', editProfile: true })}
                                            style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--highlight-color)',
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: 0
                                            }}
                                        >
                                            Set up
                                        </button>
                                    )}
                                </div>

                                {item.connection.username && (
                                    <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--light-color)' }}>
                                        @{item.connection.username}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
