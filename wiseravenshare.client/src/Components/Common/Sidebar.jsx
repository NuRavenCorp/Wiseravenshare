import React, { useEffect, useState } from 'react';
import { socialGraphService } from '../../Services/SocialGraph';
import { apiService } from '../../Services/api';
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
        enabled: Boolean(connection?.enabled || username || profileUrl || feedUrl),
        username,
        profileUrl,
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
    const [feedDrafts, setFeedDrafts] = useState({});
    const [savingPlatform, setSavingPlatform] = useState('');
    const [saveErrors, setSaveErrors] = useState({});
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
        { id: 'wisecoin', icon: 'fas fa-coins', label: '💎 WiseCoin' },
        { id: 'podcast-checkout', icon: 'fas fa-star', label: '⭐ Subscribe' },
        { id: 'planner', icon: 'fas fa-tasks', label: 'Planner' },
        { id: 'newsroom-video', icon: 'fas fa-video', label: 'Newsroom Video' },
        { id: 'amateur-journalist', icon: 'fas fa-microphone-alt', label: 'Amateur Journalist' },
        { id: 'canvas', icon: 'fas fa-palette', label: 'Canvas Studio' },
        { id: 'music-rights-studio', icon: 'fas fa-music', label: 'Music Rights' },
        { id: 'podcast-rights-studio', icon: 'fas fa-podcast', label: 'Podcast Rights' },
        { id: 'podcast-audio-processor', icon: 'fas fa-sliders-h', label: '🎛️ Audio Processor' },
        { id: 'karaoke', icon: 'fas fa-microphone', label: '🎤 Karaoke Party' },
        { id: 'team-launchpad', icon: 'fas fa-people-arrows', label: 'Team Launchpad' },
        { id: 'fm-tuner', icon: 'fas fa-broadcast-tower', label: 'FM Radio' },
        { id: 'music-player', icon: 'fas fa-compact-disc', label: 'Wise-tracks' },
        { id: 'collaboration', icon: 'fas fa-users', label: 'Collaborate' },
        { id: 'truthseeker', icon: 'fas fa-shield-alt', label: 'Truth Seeker' },
        { id: 'ai-assistant', icon: 'fas fa-robot', label: 'Raven Assistant' },
        { id: 'ainews', icon: 'fas fa-newspaper', label: 'AI News' },
        { id: 'ravensight', icon: 'fas fa-video', label: 'Ravensight' },
        { id: 'profile', icon: 'fas fa-cog', label: 'Settings' },
        { id: 'settings', icon: 'fas fa-user', label: 'Profile' }
    ];

    if (isAdminUser) {
        menuItems.splice(
            8,
            0,
            { id: 'admin-panel', icon: 'fas fa-shield-alt', label: '🛡️ Admin Panel' },
            { id: 'gatekeeper', icon: 'fas fa-eye', label: '👁️ Gatekeeper' },
            { id: 'revenue', icon: 'fas fa-chart-line', label: 'Revenue' },
            { id: 'team-access-admin', icon: 'fas fa-user-shield', label: 'Team Access' },
            { id: 'site-crawler-audit', icon: 'fas fa-spider', label: 'Site Crawler' },
            { id: 'crawler-metrics', icon: 'fas fa-chart-pie', label: 'Crawler Metrics' },
            { id: 'radio-creator', icon: 'fas fa-microphone-alt', label: 'Radio Creator' },
            { id: 'assistant', icon: 'fas fa-robot', label: 'AI Assistant' }
        );
    }

    const profile = {
        name: user?.name || user?.displayName || 'Alex Raven',
        avatar: user?.avatar || user?.avatarUrl || (user?.name || user?.displayName ? (user.name || user.displayName).charAt(0).toUpperCase() : 'AR'),
        followers: counts.followers,
        following: counts.following
    };

    const hasImageAvatar = isImageSource(profile.avatar);

    const userFeeds = user?.socialFeeds || {};
    const cachedFeeds = readCachedFeeds();
    const feeds = hasConfiguredFeeds(userFeeds)
        ? { ...userFeeds, ...cachedFeeds }
        : cachedFeeds;
    const socialFeedItems = [
        {
            id: 'facebook-feed',
            platformKey: 'facebook',
            payloadKey: 'Facebook',
            label: 'Facebook Feed',
            icon: 'fab fa-facebook',
            color: '#93c5fd',
            siteUrl: 'https://www.facebook.com',
            connection: normalizeConnection(getConnection(feeds, 'facebook', 'Facebook'), 'facebook')
        },
        {
            id: 'tiktok-feed',
            platformKey: 'tiktok',
            payloadKey: 'TikTok',
            label: 'TikTok Feed',
            icon: 'fab fa-tiktok',
            color: '#67e8f9',
            siteUrl: 'https://www.tiktok.com',
            connection: normalizeConnection(getConnection(feeds, 'tikTok', 'tiktok', 'TikTok'), 'tiktok')
        },
        {
            id: 'instagram-feed',
            platformKey: 'instagram',
            payloadKey: 'Instagram',
            label: 'Instagram Feed',
            icon: 'fab fa-instagram',
            color: '#f9a8d4',
            siteUrl: 'https://www.instagram.com',
            connection: normalizeConnection(getConnection(feeds, 'instagram', 'Instagram'), 'instagram')
        },
        {
            id: 'youtube-feed',
            platformKey: 'youtube',
            payloadKey: 'YouTube',
            label: 'YouTube Feed',
            icon: 'fab fa-youtube',
            color: '#f87171',
            siteUrl: 'https://www.youtube.com',
            connection: normalizeConnection(getConnection(feeds, 'youtube', 'YouTube'), 'youtube')
        },
    ];

    useEffect(() => {
        setFeedDrafts({
            facebook: {
                username: socialFeedItems[0]?.connection?.username || '',
                profileUrl: socialFeedItems[0]?.connection?.profileUrl || socialFeedItems[0]?.connection?.resolvedUrl || ''
            },
            tiktok: {
                username: socialFeedItems[1]?.connection?.username || '',
                profileUrl: socialFeedItems[1]?.connection?.profileUrl || socialFeedItems[1]?.connection?.resolvedUrl || ''
            },
            instagram: {
                username: socialFeedItems[2]?.connection?.username || '',
                profileUrl: socialFeedItems[2]?.connection?.profileUrl || socialFeedItems[2]?.connection?.resolvedUrl || ''
            },
            youtube: {
                username: socialFeedItems[3]?.connection?.username || '',
                profileUrl: socialFeedItems[3]?.connection?.profileUrl || socialFeedItems[3]?.connection?.resolvedUrl || ''
            }
        });
    }, [user?.id, user?.socialFeeds]);

    const handleDraftChange = (platformKey, field, value) => {
        setFeedDrafts((prev) => ({
            ...prev,
            [platformKey]: {
                ...(prev[platformKey] || {}),
                [field]: value
            }
        }));
    };

    const normalizeHttpUrl = (value) => {
        const trimmed = String(value || '').trim();
        if (!trimmed) return '';
        const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
        try {
            const parsed = new URL(candidate);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            return parsed.toString();
        } catch {
            return '';
        }
    };

    const handleSaveLink = async (item) => {
        if (!user?.id) {
            return;
        }

        const draft = feedDrafts[item.platformKey] || {};
        const username = String(draft.username || '').trim();
        const profileUrlInput = String(draft.profileUrl || '').trim();
        const profileUrl = normalizeHttpUrl(profileUrlInput);

        if (!username && !profileUrl) {
            setSaveErrors((prev) => ({ ...prev, [item.platformKey]: 'Add a username or profile URL to save.' }));
            return;
        }

        if (profileUrlInput && !profileUrl) {
            setSaveErrors((prev) => ({ ...prev, [item.platformKey]: 'Enter a valid http(s) profile URL.' }));
            return;
        }

        const payload = {
            [item.payloadKey]: {
                enabled: true,
                username,
                profileUrl,
                feedUrl: profileUrl
            }
        };

        setSavingPlatform(item.platformKey);
        try {
            await apiService.updateSocialFeeds(user.id, payload);

            const existingUserRaw = localStorage.getItem('user_data');
            let existingUser = {};
            try {
                existingUser = existingUserRaw ? JSON.parse(existingUserRaw) : {};
            } catch {
                existingUser = {};
            }
            const existingFeeds = existingUser?.socialFeeds || {};
            const itemFeedKey = item.payloadKey.charAt(0).toLowerCase() + item.payloadKey.slice(1);
            const nextFeeds = {
                ...existingFeeds,
                [itemFeedKey]: payload[item.payloadKey]
            };

            localStorage.setItem('wiseSocialFeeds', JSON.stringify(nextFeeds));
            localStorage.setItem('user_data', JSON.stringify({ ...existingUser, socialFeeds: nextFeeds }));
            window.dispatchEvent(new Event('wiseraven:social-updated'));
            setSaveErrors((prev) => ({ ...prev, [item.platformKey]: '' }));
        } catch (error) {
            setSaveErrors((prev) => ({
                ...prev,
                [item.platformKey]: error?.message || 'Unable to save social link right now.'
            }));
        } finally {
            setSavingPlatform('');
        }
    };

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
                        const draft = feedDrafts[item.platformKey] || { username: '', profileUrl: '' };
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
                                </div>

                                {isActive ? (
                                    <div style={{ marginTop: '6px', display: 'grid', gap: '6px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#86efac', fontWeight: 600 }}>Connected</div>
                                        {item.connection.username && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--light-color)' }}>
                                                @{item.connection.username}
                                            </div>
                                        )}
                                        {item.connection.resolvedUrl && (
                                            <a
                                                href={item.connection.resolvedUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ fontSize: '0.75rem', color: item.color, textDecoration: 'none' }}
                                            >
                                                Open profile ↗
                                            </a>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ marginTop: '6px', display: 'grid', gap: '6px' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--light-color)' }}>Not connected</div>
                                        <button
                                            type="button"
                                            onClick={() => window.open(item.siteUrl, '_blank', 'noopener,noreferrer')}
                                            style={{
                                                fontSize: '0.75rem',
                                                color: item.color,
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: 0,
                                                textAlign: 'left'
                                            }}
                                        >
                                            Connect
                                        </button>
                                        <input
                                            type="text"
                                            value={draft.username}
                                            onChange={(event) => handleDraftChange(item.platformKey, 'username', event.target.value)}
                                            placeholder={`${item.label.replace(' Feed', '')} username (optional)`}
                                            style={{
                                                padding: '6px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-color)',
                                                background: 'rgba(255, 255, 255, 0.03)',
                                                color: 'var(--text-color)',
                                                fontSize: '0.75rem'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            value={draft.profileUrl}
                                            onChange={(event) => handleDraftChange(item.platformKey, 'profileUrl', event.target.value)}
                                            placeholder={`${item.label.replace(' Feed', '')} profile URL (optional)`}
                                            style={{
                                                padding: '6px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-color)',
                                                background: 'rgba(255, 255, 255, 0.03)',
                                                color: 'var(--text-color)',
                                                fontSize: '0.75rem'
                                            }}
                                        />
                                        <div style={{ fontSize: '0.7rem', color: 'var(--light-color)', lineHeight: 1.3 }}>
                                            Save by app user + URL. Advanced fields remain admin-only.
                                        </div>
                                        <button
                                            type="button"
                                            disabled={savingPlatform === item.platformKey}
                                            onClick={() => handleSaveLink(item)}
                                            style={{
                                                justifySelf: 'start',
                                                fontSize: '0.75rem',
                                                color: item.color,
                                                background: 'transparent',
                                                border: `1px solid ${item.color}`,
                                                borderRadius: '999px',
                                                cursor: savingPlatform === item.platformKey ? 'not-allowed' : 'pointer',
                                                padding: '4px 10px'
                                            }}
                                        >
                                            {savingPlatform === item.platformKey ? 'Saving…' : 'Save Link'}
                                        </button>
                                        {saveErrors[item.platformKey] && (
                                            <div style={{ fontSize: '0.7rem', color: '#fca5a5' }}>
                                                {saveErrors[item.platformKey]}
                                            </div>
                                        )}
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
