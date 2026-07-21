import React, { useEffect, useMemo, useState } from 'react';

const REFRESH_MS = 15000;

const normalizeConnection = (connection, platform) => {
    const safeConnection = connection || {};
    const username = String(safeConnection.username || '').trim();
    const profileUrl = String(safeConnection.profileUrl || '').trim();
    const feedUrl = String(safeConnection.feedUrl || '').trim();

    const fallbackProfileUrl = platform === 'facebook'
        ? (username ? `https://www.facebook.com/${username}` : '')
        : (username ? `https://www.tiktok.com/@${username}` : '');

    return {
        enabled: Boolean(safeConnection.enabled),
        username,
        profileUrl,
        feedUrl,
        resolvedUrl: feedUrl || profileUrl || fallbackProfileUrl
    };
};

const readCachedUser = () => {
    try {
        const raw = localStorage.getItem('user_data');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const getSnapshot = (user) => {
    const cached = readCachedUser();
    const source = user || cached || {};
    const feeds = source.socialFeeds || {};

    return {
        tikTok: normalizeConnection(feeds.tikTok, 'tiktok'),
        facebook: normalizeConnection(feeds.facebook, 'facebook'),
        userName: source.name || cached?.name || 'User',
        checkedAt: new Date().toISOString()
    };
};

const SocialFeedsTimeline = ({ user, compact = false }) => {
    const [snapshot, setSnapshot] = useState(() => getSnapshot(user));

    useEffect(() => {
        setSnapshot(getSnapshot(user));
    }, [user]);

    useEffect(() => {
        const refresh = () => setSnapshot(getSnapshot(user));

        refresh();
        const intervalId = setInterval(refresh, REFRESH_MS);
        window.addEventListener('storage', refresh);
        window.addEventListener('focus', refresh);
        window.addEventListener('wiseraven:social-updated', refresh);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('storage', refresh);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('wiseraven:social-updated', refresh);
        };
    }, [user]);

    const timelineItems = useMemo(() => {
        const items = [];

        if (snapshot.tikTok.enabled && snapshot.tikTok.resolvedUrl) {
            items.push({
                id: 'tiktok',
                platform: 'TikTok',
                icon: '🎵',
                color: '#67e8f9',
                username: snapshot.tikTok.username,
                url: snapshot.tikTok.resolvedUrl
            });
        }

        if (snapshot.facebook.enabled && snapshot.facebook.resolvedUrl) {
            items.push({
                id: 'facebook',
                platform: 'Facebook',
                icon: '📘',
                color: '#93c5fd',
                username: snapshot.facebook.username,
                url: snapshot.facebook.resolvedUrl
            });
        }

        return items;
    }, [snapshot]);

    if (timelineItems.length === 0) {
        return null;
    }

    return (
        <section
            style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: compact ? '12px' : '16px',
                marginBottom: '16px'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong>Social Feeds Timeline</strong>
                <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                    Synced {new Date(snapshot.checkedAt).toLocaleTimeString()}
                </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--highlight-color)', marginBottom: '12px' }}>
                Active feed links saved for {snapshot.userName}
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
                {timelineItems.map((item) => (
                    <article
                        key={item.id}
                        style={{
                            border: `1px solid ${item.color}`,
                            borderRadius: '10px',
                            padding: compact ? '10px' : '12px',
                            background: 'rgba(255,255,255,0.02)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 700 }}>
                                    <span style={{ marginRight: '6px' }}>{item.icon}</span>
                                    {item.platform}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                                    {item.username ? `@${item.username}` : 'Direct feed URL'}
                                </div>
                            </div>

                            <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                    color: item.color,
                                    fontSize: '12px',
                                    textDecoration: 'none',
                                    border: `1px solid ${item.color}`,
                                    borderRadius: '999px',
                                    padding: '4px 10px',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                Open Feed
                            </a>
                        </div>

                        <div
                            style={{
                                marginTop: '8px',
                                fontSize: '11px',
                                color: 'var(--light-color)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}
                            title={item.url}
                        >
                            {item.url}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
};

export default SocialFeedsTimeline;
