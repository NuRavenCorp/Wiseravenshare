import React, { useEffect, useState } from 'react';
import { socialGraphService } from '../../Services/SocialGraph';
import WiseRavenLogo from './WiseRavenLogo';

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
            : (username ? `https://www.tiktok.com/@${username}` : '');

    return {
        enabled: Boolean(connection?.enabled),
        username,
        resolvedUrl: feedUrl || profileUrl || fallbackUrl
    };
};

const Sidebar = ({ onNavigate, currentPage, user }) => {
    const [counts, setCounts] = useState({ followers: 0, following: 0 });

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
        { id: 'truthseeker', icon: 'fas fa-shield-alt', label: 'Truth Seeker' },
        { id: 'ainews', icon: 'fas fa-newspaper', label: 'AI News' },
        { id: 'ravensight', icon: 'fas fa-video', label: 'Ravensight' },
        { id: 'profile', icon: 'fas fa-user', label: 'Profile' }
    ];

    const profile = {
        name: user?.name || 'Alex Raven',
        avatar: user?.avatar || (user?.name ? user.name.charAt(0).toUpperCase() : 'AR'),
        followers: counts.followers,
        following: counts.following
    };

    const hasImageAvatar = typeof profile.avatar === 'string' && (profile.avatar.startsWith('data:image/') || profile.avatar.startsWith('http'));

    const feeds = user?.socialFeeds || {};
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
                        />
                    ) : (
                        profile.avatar
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
                        <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); onNavigate(item.id); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '12px 20px',
                                color: 'var(--text-color)',
                                textDecoration: 'none',
                                gap: '10px',
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
                        </a>
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
                                        <span style={{ fontSize: '0.75rem', color: 'var(--light-color)' }}>Not set</span>
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
