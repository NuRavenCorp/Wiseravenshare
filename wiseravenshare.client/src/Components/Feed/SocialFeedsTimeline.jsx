import React, { useEffect, useMemo, useState } from 'react';
import { socialService } from '../../Services/socialService';

const REFRESH_MS = 15000;

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
    const safeConnection = connection || {};
    const username = String(safeConnection.username || '').trim();
    const profileUrl = String(safeConnection.profileUrl || '').trim();
    const feedUrl = String(safeConnection.feedUrl || '').trim();

    const fallbackProfileUrl = platform === 'facebook'
        ? (username ? `https://www.facebook.com/${username}` : '')
        : platform === 'instagram'
            ? (username ? `https://www.instagram.com/${username}` : '')
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

const readCachedSocialFeeds = () => {
    try {
        const raw = localStorage.getItem('wiseSocialFeeds');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const normalizeFeeds = (feeds) => {
    const source = feeds || {};
    return {
        tikTok: getConnection(source, 'tikTok', 'tiktok', 'TikTok'),
        facebook: getConnection(source, 'facebook', 'Facebook'),
        instagram: getConnection(source, 'instagram', 'Instagram')
    };
};

const getTikTokEmbedUrl = (url) => {
    if (!url) return '';
    const match = url.match(/\/video\/(\d+)/i);
    if (!match?.[1]) return '';
    return `https://www.tiktok.com/embed/v2/${match[1]}`;
};

const getInstagramEmbedUrl = (url) => {
    if (!url) return '';
    const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match?.[2]) return '';
    return `https://www.instagram.com/${match[1]}/${match[2]}/embed`;
};

const getFacebookEmbedUrl = (url) => {
    if (!url) return '';
    const normalizedUrl = String(url).trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        return '';
    }

    return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(normalizedUrl)}&show_text=true&width=500`;
};

const FeedEmbedCard = ({ item, compact }) => {
    const platformId = String(item.id || '').toLowerCase();
    const isTikTok = platformId === 'tiktok';
    const isFacebook = platformId === 'facebook';
    const isInstagram = platformId === 'instagram';

    const embedUrl = isTikTok
        ? getTikTokEmbedUrl(item.url)
        : isFacebook
            ? getFacebookEmbedUrl(item.url)
            : isInstagram
                ? getInstagramEmbedUrl(item.url)
                : '';

    return (
        <article
            style={{
                border: `1px solid ${item.color}`,
                borderRadius: '10px',
                padding: compact ? '10px' : '12px',
                background: 'rgba(255,255,255,0.02)'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong>
                    <span style={{ marginRight: '6px' }}>{item.icon}</span>
                    {item.platform}
                </strong>
                <a href={item.url} target="_blank" rel="noreferrer" style={{ color: item.color, fontSize: '12px' }}>
                    Open
                </a>
            </div>

            {embedUrl ? (
                <iframe
                    title={`${item.platform} feed embed`}
                    src={embedUrl}
                    style={{
                        width: '100%',
                        minHeight: isTikTok ? '520px' : '420px',
                        border: 'none',
                        borderRadius: '8px',
                        background: '#0b0f14'
                    }}
                    loading="lazy"
                    allow="clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                />
            ) : (
                <div style={{ fontSize: '12px', color: 'var(--light-color)', lineHeight: 1.5 }}>
                    Embedded preview requires a direct post/video URL for {item.platform}. The feed link is active and can be opened directly.
                </div>
            )}
        </article>
    );
};

const getSnapshot = (user) => {
    const cached = readCachedUser();
    const cachedFeeds = readCachedSocialFeeds();
    const source = user || cached || {};
    const feeds = normalizeFeeds(source.socialFeeds || cachedFeeds || {});

    return {
        tikTok: normalizeConnection(feeds.tikTok, 'tiktok'),
        facebook: normalizeConnection(feeds.facebook, 'facebook'),
        instagram: normalizeConnection(feeds.instagram, 'instagram'),
        userName: source.name || cached?.name || 'User',
        checkedAt: new Date().toISOString()
    };
};

const SocialFeedsTimeline = ({ user, compact = false }) => {
    const [snapshot, setSnapshot] = useState(() => getSnapshot(user));
    const [feedItems, setFeedItems] = useState([]);
    const [isLoadingFeed, setIsLoadingFeed] = useState(false);

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

    useEffect(() => {
        let cancelled = false;

        const loadCombinedFeed = async () => {
            if (!snapshot.tikTok.enabled && !snapshot.facebook.enabled) {
                setFeedItems([]);
                return;
            }

            setIsLoadingFeed(true);
            try {
                const items = await socialService.getCombinedFeed(
                    compact ? 5 : 10,
                    snapshot.facebook.username || undefined,
                    snapshot.tikTok.username || undefined
                );

                if (!cancelled) {
                    setFeedItems(Array.isArray(items) ? items : []);
                }
            } catch {
                if (!cancelled) {
                    setFeedItems([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingFeed(false);
                }
            }
        };

        loadCombinedFeed();
        const intervalId = setInterval(loadCombinedFeed, REFRESH_MS);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [compact, snapshot.facebook.enabled, snapshot.facebook.username, snapshot.tikTok.enabled, snapshot.tikTok.username]);

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

        if (snapshot.instagram.enabled && snapshot.instagram.resolvedUrl) {
            items.push({
                id: 'instagram',
                platform: 'Instagram',
                icon: '📸',
                color: '#f9a8d4',
                username: snapshot.instagram.username,
                url: snapshot.instagram.resolvedUrl
            });
        }

        return items;
    }, [snapshot]);

    if (timelineItems.length === 0 && feedItems.length === 0) {
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

            <div style={{ marginTop: '12px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                    Feed Rendering
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                    {timelineItems.map((item) => (
                        <FeedEmbedCard key={`${item.id}-embed`} item={item} compact={compact} />
                    ))}
                </div>
            </div>

            <div style={{ marginTop: '12px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                    Live Facebook + TikTok Feed
                </div>

                {isLoadingFeed && (
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '8px' }}>
                        Refreshing feed...
                    </div>
                )}

                {!isLoadingFeed && feedItems.length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                        No live feed items returned yet. Add page/username in profile and verify platform tokens on server.
                    </div>
                )}

                <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                    {feedItems.map((item) => (
                        <article
                            key={`${item.platform}-${item.externalId}`}
                            style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: compact ? '8px' : '10px',
                                background: 'rgba(255,255,255,0.02)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', color: 'var(--light-color)' }}>
                                <span style={{ textTransform: 'uppercase' }}>{item.platform}</span>
                                <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</span>
                            </div>

                            <div style={{ marginTop: '6px', fontSize: '13px' }}>
                                {item.text || 'No text provided.'}
                            </div>

                            {item.permalinkUrl && (
                                <a
                                    href={item.permalinkUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        marginTop: '6px',
                                        display: 'inline-block',
                                        fontSize: '12px',
                                        color: 'var(--highlight-color)',
                                        textDecoration: 'none'
                                    }}
                                >
                                    Open original
                                </a>
                            )}
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default SocialFeedsTimeline;
