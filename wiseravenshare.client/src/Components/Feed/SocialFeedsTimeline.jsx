import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../../Services/api';
import { socialService } from '../../Services/socialService';

const REFRESH_MS = 15000;

const PLATFORMS = [
    { id: 'all', label: 'All Feeds', icon: '🌐', color: '#a855f7' },
    { id: 'facebook', label: 'Facebook', icon: '📘', color: '#93c5fd' },
    { id: 'tiktok', label: 'TikTok', icon: '🎵', color: '#67e8f9' },
    { id: 'instagram', label: 'Instagram', icon: '📸', color: '#f9a8d4' },
    { id: 'youtube', label: 'YouTube', icon: '▶️', color: '#f87171' },
    { id: 'twitter', label: 'Twitter / X', icon: '🐦', color: '#38bdf8' },
    { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#60a5fa' },
    { id: 'reddit', label: 'Reddit', icon: '🤖', color: '#f97316' }
];

const CURATED_TEMPLATES = [
    { id: 'cards', label: 'Cards' },
    { id: 'list', label: 'List' },
    { id: 'signage', label: 'Digital Signage' }
];

const PROFANITY_PATTERNS = [
    /\b(fuck|shit|bitch|asshole|bastard)\b/i,
    /\b(whore|slut|cunt)\b/i
];

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
            : platform === 'youtube'
                ? (username ? `https://www.youtube.com/@${username}` : '')
                : platform === 'twitter'
                    ? (username ? `https://twitter.com/${username}` : '')
                    : platform === 'linkedin'
                        ? (username ? `https://www.linkedin.com/in/${username}` : '')
                        : (username ? `https://www.tiktok.com/@${username}` : '');

    return {
        enabled: Boolean(safeConnection.enabled || username || feedUrl || profileUrl),
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
        instagram: getConnection(source, 'instagram', 'Instagram'),
        youtube: getConnection(source, 'youtube', 'YouTube'),
        twitter: getConnection(source, 'twitter', 'Twitter'),
        linkedin: getConnection(source, 'linkedin', 'LinkedIn')
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

    // Single Post Embed vs Page Timeline Feed Embed
    if (/\/posts\/|\/photos\/|\/videos\/|\/permalink\//i.test(normalizedUrl)) {
        return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(normalizedUrl)}&show_text=true&width=500`;
    }

    // Facebook Page Timeline Feed Container Embed
    return `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(normalizedUrl)}&tabs=timeline&width=500&height=500&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true`;
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
                    Open Feed Link ↗
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
                    Embedded preview for {item.platform} is active. Link: <a href={item.url} target="_blank" rel="noreferrer" style={{ color: item.color }}>{item.url}</a>
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
        youtube: normalizeConnection(feeds.youtube, 'youtube'),
        twitter: normalizeConnection(feeds.twitter, 'twitter'),
        linkedin: normalizeConnection(feeds.linkedin, 'linkedin'),
        userName: source.name || cached?.name || 'User',
        checkedAt: new Date().toISOString()
    };

    const hasProfanity = (text) => PROFANITY_PATTERNS.some((pattern) => pattern.test(String(text || '')));

    const normalizeFeedKey = (item) => [
        String(item?.platform || '').toLowerCase().trim(),
        String(item?.externalId || item?.id || '').toLowerCase().trim(),
        String(item?.text || '').toLowerCase().replace(/\s+/g, ' ').trim()
    ].join('|');
};

const normalizeFeedConnections = (feeds = {}) => ({
    facebook: {
        enabled: Boolean(feeds.facebook?.enabled),
        username: String(feeds.facebook?.username || '').trim(),
        profileUrl: String(feeds.facebook?.profileUrl || '').trim(),
        feedUrl: String(feeds.facebook?.feedUrl || '').trim()
    },
    tikTok: {
        enabled: Boolean(feeds.tikTok?.enabled),
        username: String(feeds.tikTok?.username || '').trim(),
        profileUrl: String(feeds.tikTok?.profileUrl || '').trim(),
        feedUrl: String(feeds.tikTok?.feedUrl || '').trim()
    },
    instagram: {
        enabled: Boolean(feeds.instagram?.enabled),
        username: String(feeds.instagram?.username || '').trim(),
        profileUrl: String(feeds.instagram?.profileUrl || '').trim(),
        feedUrl: String(feeds.instagram?.feedUrl || '').trim()
    },
    youtube: {
        enabled: Boolean(feeds.youtube?.enabled),
        username: String(feeds.youtube?.username || '').trim(),
        profileUrl: String(feeds.youtube?.profileUrl || '').trim(),
        feedUrl: String(feeds.youtube?.feedUrl || '').trim()
    },
    twitter: {
        enabled: Boolean(feeds.twitter?.enabled),
        username: String(feeds.twitter?.username || '').trim(),
        profileUrl: String(feeds.twitter?.profileUrl || '').trim(),
        feedUrl: String(feeds.twitter?.feedUrl || '').trim()
    },
    linkedin: {
        enabled: Boolean(feeds.linkedin?.enabled),
        username: String(feeds.linkedin?.username || '').trim(),
        profileUrl: String(feeds.linkedin?.profileUrl || '').trim(),
        feedUrl: String(feeds.linkedin?.feedUrl || '').trim()
    }
});

const SocialFeedsTimeline = ({ user, compact = false, initialPlatform = 'all' }) => {
    const [snapshot, setSnapshot] = useState(() => getSnapshot(user));
    const [feedItems, setFeedItems] = useState([]);
    const [isLoadingFeed, setIsLoadingFeed] = useState(false);
    const [activePlatform, setActivePlatform] = useState(() => {
        const cleaned = String(initialPlatform || 'all').toLowerCase().replace('-feed', '');
        return PLATFORMS.some((p) => p.id === cleaned) ? cleaned : 'all';
    });

    // Multi-Platform Publisher State
    const [postMessage, setPostMessage] = useState('');
    const [mediaUrlInput, setMediaUrlInput] = useState('');
    const [linkUrlInput, setLinkUrlInput] = useState('');
    const [publishFacebook, setPublishFacebook] = useState(true);
    const [publishTikTok, setPublishTikTok] = useState(false);
    const [publishYouTube, setPublishYouTube] = useState(false);
    const [publishTwitter, setPublishTwitter] = useState(false);
    const [publishLinkedIn, setPublishLinkedIn] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishResults, setPublishResults] = useState(null);
    const [displayTemplate, setDisplayTemplate] = useState('cards');
    const [hideDuplicates, setHideDuplicates] = useState(true);
    const [hideProfanity, setHideProfanity] = useState(true);
    const [feedSearch, setFeedSearch] = useState('');

    // Account Handle Linking State
    const [showHandleConfig, setShowHandleConfig] = useState(false);
    const [handles, setHandles] = useState({
        facebook: snapshot.facebook.username || '',
        tiktok: snapshot.tikTok.username || '',
        instagram: snapshot.instagram.username || '',
        youtube: snapshot.youtube.username || '',
        twitter: snapshot.twitter.username || '',
        linkedin: snapshot.linkedin.username || ''
    });

    // API Info & Demo Guide Expansion
    const [showApiDoc, setShowApiDoc] = useState(false);
    const [showTikTokDemo, setShowTikTokDemo] = useState(false);

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

        const loadSavedConnections = async () => {
            const userId = user?.id;
            if (!userId) {
                return;
            }

            try {
                const response = await apiService.getSocialFeeds(userId);
                const loadedFeeds = normalizeFeedConnections(response?.data || response || {});
                if (cancelled) return;

                const cachedUser = readCachedUser() || {};
                const nextUser = {
                    ...cachedUser,
                    ...user,
                    socialFeeds: loadedFeeds
                };

                localStorage.setItem('wiseSocialFeeds', JSON.stringify(loadedFeeds));
                localStorage.setItem('user_data', JSON.stringify(nextUser));
                window.dispatchEvent(new Event('wiseraven:social-updated'));
                setSnapshot(getSnapshot(nextUser));
                setHandles({
                    facebook: loadedFeeds.facebook.username,
                    tiktok: loadedFeeds.tikTok.username,
                    instagram: loadedFeeds.instagram.username,
                    youtube: loadedFeeds.youtube.username,
                    twitter: loadedFeeds.twitter.username,
                    linkedin: loadedFeeds.linkedin.username
                });
            } catch {
                if (cancelled) return;
                setHandles({
                    facebook: snapshot.facebook.username || '',
                    tiktok: snapshot.tikTok.username || '',
                    instagram: snapshot.instagram.username || '',
                    youtube: snapshot.youtube.username || '',
                    twitter: snapshot.twitter.username || '',
                    linkedin: snapshot.linkedin.username || ''
                });
            }
        };

        loadSavedConnections();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    useEffect(() => {
        let cancelled = false;

        const loadCombinedFeed = async () => {
            setIsLoadingFeed(true);
            try {
                const items = await socialService.getCombinedFeed(
                    compact ? 5 : 15,
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
    }, [compact, snapshot.facebook.username, snapshot.tikTok.username]);

    const handleSaveHandles = async (e) => {
        e?.preventDefault();
        const updatedFeeds = {
            facebook: { username: handles.facebook.trim(), enabled: Boolean(handles.facebook.trim()) },
            tikTok: { username: handles.tiktok.trim(), enabled: Boolean(handles.tiktok.trim()) },
            instagram: { username: handles.instagram.trim(), enabled: Boolean(handles.instagram.trim()) },
            youtube: { username: handles.youtube.trim(), enabled: Boolean(handles.youtube.trim()) },
            twitter: { username: handles.twitter.trim(), enabled: Boolean(handles.twitter.trim()) },
            linkedin: { username: handles.linkedin.trim(), enabled: Boolean(handles.linkedin.trim()) }
        };

        try {
            const userId = user?.id;
            if (userId) {
                try {
                    await apiService.updateSocialFeeds(userId, updatedFeeds);
                } catch (err) {
                    console.warn('Backend social feed save failed, using local cache fallback:', err);
                }
            }

            localStorage.setItem('wiseSocialFeeds', JSON.stringify(updatedFeeds));
            const cachedUser = readCachedUser() || {};
            const nextUser = { ...cachedUser, ...user, socialFeeds: updatedFeeds };
            localStorage.setItem('user_data', JSON.stringify(nextUser));
            window.dispatchEvent(new Event('wiseraven:social-updated'));
            setShowHandleConfig(false);
        } catch (err) {
            console.warn('Failed to save handle settings:', err);
        }
    };

    const handlePublishPost = async (e) => {
        e?.preventDefault();
        if (!postMessage.trim()) return;

        setIsPublishing(true);
        setPublishResults(null);

        try {
            const mediaUrl = mediaUrlInput.trim();
            const isVideoUrl = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(mediaUrl)
                || mediaUrl.includes('videostreaming')
                || /^data:video\//i.test(mediaUrl);
            const isPhotoUrl = !isVideoUrl && (
                /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(mediaUrl)
                || /^data:image\//i.test(mediaUrl)
            );

            const response = await socialService.publishContent({
                message: postMessage.trim(),
                linkUrl: linkUrlInput.trim() || undefined,
                videoUrl: isVideoUrl ? mediaUrl : undefined,
                photoUrl: isPhotoUrl ? mediaUrl : undefined,
                mediaType: isVideoUrl ? 'video' : isPhotoUrl ? 'photo' : 'text',
                publishToFacebook: publishFacebook,
                publishToTikTok: publishTikTok && isVideoUrl,
                publishToYouTube: publishYouTube && isVideoUrl
            });

            setPublishResults(response?.results || []);
            setPostMessage('');
            setMediaUrlInput('');
            setLinkUrlInput('');
        } catch (err) {
            setPublishResults([{ platform: 'general', success: false, error: err?.message || 'Publishing request failed.' }]);
        } finally {
            setIsPublishing(false);
        }
    };

    const timelineItems = useMemo(() => {
        const items = [];

        if (snapshot.facebook.enabled || snapshot.facebook.resolvedUrl) {
            items.push({
                id: 'facebook',
                platform: 'Facebook',
                icon: '📘',
                color: '#93c5fd',
                username: snapshot.facebook.username,
                url: snapshot.facebook.resolvedUrl
            });
        }

        if (snapshot.tikTok.enabled || snapshot.tikTok.resolvedUrl) {
            items.push({
                id: 'tiktok',
                platform: 'TikTok',
                icon: '🎵',
                color: '#67e8f9',
                username: snapshot.tikTok.username,
                url: snapshot.tikTok.resolvedUrl
            });
        }

        if (snapshot.instagram.enabled || snapshot.instagram.resolvedUrl) {
            items.push({
                id: 'instagram',
                platform: 'Instagram',
                icon: '📸',
                color: '#f9a8d4',
                username: snapshot.instagram.username,
                url: snapshot.instagram.resolvedUrl
            });
        }

        if (snapshot.youtube.enabled || snapshot.youtube.resolvedUrl) {
            items.push({
                id: 'youtube',
                platform: 'YouTube',
                icon: '▶️',
                color: '#f87171',
                username: snapshot.youtube.username,
                url: snapshot.youtube.resolvedUrl
            });
        }

        if (snapshot.twitter.enabled || snapshot.twitter.resolvedUrl) {
            items.push({
                id: 'twitter',
                platform: 'Twitter / X',
                icon: '🐦',
                color: '#38bdf8',
                username: snapshot.twitter.username,
                url: snapshot.twitter.resolvedUrl
            });
        }

        if (snapshot.linkedin.enabled || snapshot.linkedin.resolvedUrl) {
            items.push({
                id: 'linkedin',
                platform: 'LinkedIn',
                icon: '💼',
                color: '#60a5fa',
                username: snapshot.linkedin.username,
                url: snapshot.linkedin.resolvedUrl
            });
        }

        if (activePlatform === 'all') return items;
        return items.filter((item) => item.id === activePlatform);
    }, [snapshot, activePlatform]);

    const filteredFeedItems = useMemo(() => {
        const query = feedSearch.trim().toLowerCase();
        const seen = new Set();

        return feedItems.filter((item) => {
            const platform = String(item.platform || '').toLowerCase();
            const text = String(item.text || '').toLowerCase();
            const matchesPlatform = activePlatform === 'all' || platform === activePlatform;
            const matchesSearch = !query || text.includes(query) || String(item.authorHandle || '').toLowerCase().includes(query);
            const duplicateKey = normalizeFeedKey(item);
            const isDuplicate = seen.has(duplicateKey);
            const isProfane = hasProfanity(item.text || '');

            if (matchesPlatform && matchesSearch) {
                if (hideDuplicates && isDuplicate) {
                    return false;
                }
                if (hideProfanity && isProfane) {
                    return false;
                }
                seen.add(duplicateKey);
                return true;
            }

            return false;
        });
    }, [feedItems, activePlatform, feedSearch, hideDuplicates, hideProfanity]);

    const activeMeta = PLATFORMS.find((p) => p.id === activePlatform) || PLATFORMS[0];

    return (
        <section
            style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: compact ? '14px' : '20px',
                marginBottom: '20px'
            }}
        >
            {/* Header with Title & Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{activeMeta.icon}</span> {activeMeta.label} Social Media Feed
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>
                        Synced for {snapshot.userName} · Updated {new Date(snapshot.checkedAt).toLocaleTimeString()}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setShowTikTokDemo(!showTikTokDemo)}
                        style={{
                            border: '1px solid rgba(103, 232, 249, 0.4)',
                            background: 'rgba(103, 232, 249, 0.1)',
                            color: '#67e8f9',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        🎥 TikTok Demo Video Guide
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowHandleConfig(!showHandleConfig)}
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text-color)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        ⚙️ Connect Accounts
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowApiDoc(!showApiDoc)}
                        style={{
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                            background: 'rgba(168, 85, 247, 0.1)',
                            color: '#c084fc',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        📘 Platform APIs Needed
                    </button>
                </div>
            </div>

            {/* Platform Selector Tabs */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' }}>
                {PLATFORMS.map((platform) => (
                    <button
                        key={platform.id}
                        type="button"
                        onClick={() => setActivePlatform(platform.id)}
                        style={{
                            border: activePlatform === platform.id ? `1px solid ${platform.color}` : '1px solid var(--border-color)',
                            background: activePlatform === platform.id ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.4)',
                            color: 'var(--text-color)',
                            borderRadius: '999px',
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: activePlatform === platform.id ? 700 : 400,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>{platform.icon}</span> {platform.label}
                    </button>
                ))}
            </div>

            {/* Account Handle Configuration Drawer */}
            {showHandleConfig && (
                <form
                    onSubmit={handleSaveHandles}
                    style={{
                        background: 'rgba(15,23,42,0.7)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '16px',
                        display: 'grid',
                        gap: '12px'
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#38bdf8' }}>
                        🔗 Configure Social Media Handles / Page IDs
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>📘 Facebook Page ID or Handle</span>
                            <input
                                type="text"
                                value={handles.facebook}
                                onChange={(e) => setHandles({ ...handles, facebook: e.target.value })}
                                placeholder="e.g. MyBrandPage or 109283749283"
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>🎵 TikTok Username</span>
                            <input
                                type="text"
                                value={handles.tiktok}
                                onChange={(e) => setHandles({ ...handles, tiktok: e.target.value })}
                                placeholder="e.g. creatorname"
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>📸 Instagram Username</span>
                            <input
                                type="text"
                                value={handles.instagram}
                                onChange={(e) => setHandles({ ...handles, instagram: e.target.value })}
                                placeholder="e.g. mybrand"
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>▶️ YouTube Channel Handle</span>
                            <input
                                type="text"
                                value={handles.youtube}
                                onChange={(e) => setHandles({ ...handles, youtube: e.target.value })}
                                placeholder="e.g. MyChannel"
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>🐦 Twitter / X Handle</span>
                            <input
                                type="text"
                                value={handles.twitter}
                                onChange={(e) => setHandles({ ...handles, twitter: e.target.value })}
                                placeholder="e.g. twitterhandle"
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>💼 LinkedIn Profile/Company ID</span>
                            <input
                                type="text"
                                value={handles.linkedin}
                                onChange={(e) => setHandles({ ...handles, linkedin: e.target.value })}
                                placeholder="e.g. company-name"
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                            />
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={() => setShowHandleConfig(false)}
                            style={{ border: '1px solid var(--border-color)', background: 'transparent', color: '#fff', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{ border: 'none', background: '#38bdf8', color: '#000', borderRadius: '6px', padding: '6px 16px', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Save Handles
                        </button>
                    </div>
                </form>
            )}

            {/* Interactive Multi-Platform Post Creator */}
            <form
                onSubmit={handlePublishPost}
                style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '18px'
                }}
            >
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ✍️ Post to Social Media Feed ({activeMeta.label})
                </div>

                <textarea
                    rows={3}
                    value={postMessage}
                    onChange={(e) => setPostMessage(e.target.value)}
                    placeholder={`Write an update or post to publish to ${activeMeta.label} or cross-post across platforms...`}
                    style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(15,23,42,0.6)',
                        color: 'var(--text-color)',
                        resize: 'vertical',
                        marginBottom: '10px'
                    }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                    <input
                        type="url"
                        value={mediaUrlInput}
                        onChange={(e) => setMediaUrlInput(e.target.value)}
                        placeholder="Video / Photo URL (optional for TikTok/YouTube)"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(15,23,42,0.4)', color: '#fff', fontSize: '12px' }}
                    />
                    <input
                        type="url"
                        value={linkUrlInput}
                        onChange={(e) => setLinkUrlInput(e.target.value)}
                        placeholder="Link URL (optional for Facebook/LinkedIn)"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(15,23,42,0.4)', color: '#fff', fontSize: '12px' }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={publishFacebook} onChange={(e) => setPublishFacebook(e.target.checked)} />
                            📘 Facebook
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={publishTikTok} onChange={(e) => setPublishTikTok(e.target.checked)} />
                            🎵 TikTok
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={publishYouTube} onChange={(e) => setPublishYouTube(e.target.checked)} />
                            ▶️ YouTube
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={isPublishing || !postMessage.trim()}
                        style={{
                            border: 'none',
                            background: isPublishing ? 'var(--border-color)' : 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            color: '#fff',
                            borderRadius: '8px',
                            padding: '10px 20px',
                            fontWeight: 700,
                            cursor: isPublishing ? 'wait' : 'pointer'
                        }}
                    >
                        {isPublishing ? 'Publishing...' : '🚀 Publish Post'}
                    </button>
                </div>

                {publishResults && (
                    <div style={{ marginTop: '12px', display: 'grid', gap: '6px' }}>
                        {publishResults.map((res, i) => (
                            <div
                                key={i}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    background: res.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    border: res.success ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                    color: res.success ? '#4ade80' : '#fca5a5'
                                }}
                            >
                                <strong>{res.platform?.toUpperCase()}:</strong> {res.success ? `Published successfully! ${res.externalPostId ? `ID: ${res.externalPostId}` : ''}` : res.error}
                            </div>
                        ))}
                    </div>
                )}
            </form>

            {/* Curator Controls */}
            <div
                style={{
                    display: 'grid',
                    gap: '10px',
                    marginBottom: '18px',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(15,23,42,0.55)'
                }}
            >
                <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    🧭 Curator Controls
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                        <span>Search posts</span>
                        <input
                            type="search"
                            value={feedSearch}
                            onChange={(e) => setFeedSearch(e.target.value)}
                            placeholder="Search by text or author"
                            style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                        />
                    </label>
                    <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                        <span>Display template</span>
                        <select
                            value={displayTemplate}
                            onChange={(e) => setDisplayTemplate(e.target.value)}
                            style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                        >
                            {CURATED_TEMPLATES.map((template) => (
                                <option key={template.id} value={template.id}>{template.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={hideDuplicates} onChange={(e) => setHideDuplicates(e.target.checked)} />
                        Hide duplicates
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={hideProfanity} onChange={(e) => setHideProfanity(e.target.checked)} />
                        Hide profanity
                    </label>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--light-color)' }}>
                    Showing {filteredFeedItems.length} curated item{filteredFeedItems.length === 1 ? '' : 's'}.
                </div>
            </div>

            {/* Platform Accounts & Feeds Stream */}
            <div style={{ display: 'grid', gap: '14px', marginBottom: '18px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    Active Feed Feeds & Embed Streams
                </div>

                {timelineItems.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--light-color)', padding: '12px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                        No account configured for {activeMeta.label}. Click "⚙️ Connect Accounts" above to set your handle/URL.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '14px' }}>
                        {timelineItems.map((item) => (
                            <FeedEmbedCard key={`${item.id}-feed-embed`} item={item} compact={compact} />
                        ))}
                    </div>
                )}
            </div>

            {/* Live Feed Rendering */}
            <div style={{ marginTop: '14px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                    Live {activeMeta.label} Posts Feed
                </div>

                {isLoadingFeed && (
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '8px' }}>
                        Refreshing {activeMeta.label} stream...
                    </div>
                )}

                {!isLoadingFeed && filteredFeedItems.length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        No live items returned for {activeMeta.label}. Add page/username in "⚙️ Connect Accounts" above to populate feed.
                    </div>
                )}

                <div style={{ display: 'grid', gap: '10px' }}>
                    {filteredFeedItems.map((item) => (
                        <article
                            key={`${item.platform}-${item.externalId}`}
                            style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: '12px',
                                background: displayTemplate === 'signage'
                                    ? 'rgba(255,255,255,0.06)'
                                    : 'rgba(255,255,255,0.02)',
                                display: displayTemplate === 'list' ? 'grid' : 'block',
                                gap: displayTemplate === 'list' ? '8px' : '0'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', color: 'var(--light-color)' }}>
                                <span style={{ textTransform: 'uppercase', fontWeight: 700, color: activeMeta.color }}>
                                    {item.platform}
                                </span>
                                <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</span>
                            </div>

                            <div style={{ marginTop: '8px', fontSize: '13px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                {item.text || 'No text provided.'}
                            </div>

                            {item.mediaUrl && (
                                <div style={{ marginTop: '8px' }}>
                                    <img src={item.mediaUrl} alt="Feed Media" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }} />
                                </div>
                            )}

                            {item.permalinkUrl && (
                                <a
                                    href={item.permalinkUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        marginTop: '8px',
                                        display: 'inline-block',
                                        fontSize: '12px',
                                        color: 'var(--highlight-color)',
                                        textDecoration: 'none'
                                    }}
                                >
                                    Open original post ↗
                                </a>
                            )}
                        </article>
                    ))}
                </div>
            </div>

            {/* TikTok Developer App Review Demo Walkthrough */}
            {showTikTokDemo && (
                <div
                    style={{
                        marginTop: '20px',
                        background: 'linear-gradient(160deg, rgba(6, 182, 212, 0.15), rgba(15, 23, 42, 0.95))',
                        border: '1px solid rgba(103, 232, 249, 0.4)',
                        borderRadius: '12px',
                        padding: '18px'
                    }}
                >
                    <div style={{ fontWeight: 800, fontSize: '16px', color: '#67e8f9', marginBottom: '6px' }}>
                        🎬 TikTok App Review Demo Video Walkthrough Script
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--light-color)', lineHeight: 1.6, marginBottom: '14px' }}>
                        TikTok Developer App Review requires submitting a 1–2 minute screen recording demo video showing the end-to-end user flow. Follow these steps when recording your screen:
                    </div>

                    <div style={{ display: 'grid', gap: '10px', fontSize: '12px' }}>
                        <div style={{ border: '1px solid rgba(103, 232, 249, 0.3)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.3)' }}>
                            <strong style={{ color: '#38bdf8' }}>Step 1: Show Your App Identity & URL</strong>
                            <div style={{ marginTop: '4px', color: 'var(--light-color)' }}>
                                Begin recording on <code>https://wise-ravens.com</code> showing the WiseRaven Share header logo, user profile, and app domain clearly in the browser URL bar.
                            </div>
                        </div>

                        <div style={{ border: '1px solid rgba(103, 232, 249, 0.3)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.3)' }}>
                            <strong style={{ color: '#38bdf8' }}>Step 2: Show TikTok Account Connection (OAuth Flow)</strong>
                            <div style={{ marginTop: '4px', color: 'var(--light-color)' }}>
                                Open <strong>⚙️ Connect Accounts</strong> or <strong>Profile Settings</strong>, click <strong>"Connect TikTok Account"</strong>, and show the TikTok OAuth authorization dialog requesting <code>user.info.basic</code>, <code>video.list</code>, and <code>video.publish</code> permissions.
                            </div>
                        </div>

                        <div style={{ border: '1px solid rgba(103, 232, 249, 0.3)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.3)' }}>
                            <strong style={{ color: '#38bdf8' }}>Step 3: Create & Select Video Content</strong>
                            <div style={{ marginTop: '4px', color: 'var(--light-color)' }}>
                                Navigate to <strong>Ravensight Video Studio</strong> or the <strong>Post Creator</strong>. Record or select a video file, enter a caption (e.g., "Testing WiseRaven TikTok publishing integration"), and check the <strong>🎵 TikTok</strong> target box.
                            </div>
                        </div>

                        <div style={{ border: '1px solid rgba(103, 232, 249, 0.3)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.3)' }}>
                            <strong style={{ color: '#38bdf8' }}>Step 4: Execute Direct Publish & Show Confirmation</strong>
                            <div style={{ marginTop: '4px', color: 'var(--light-color)' }}>
                                Click <strong>🚀 Publish Post</strong>. Show the real-time response returning <code>TIKTOK: Published successfully! ID: ...</code> and open the published video on TikTok.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Comprehensive API Requirements Section */}
            {showApiDoc && (
                <div
                    style={{
                        marginTop: '20px',
                        background: 'linear-gradient(160deg, rgba(124, 58, 237, 0.1), rgba(15, 23, 42, 0.9))',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        borderRadius: '12px',
                        padding: '18px'
                    }}
                >
                    <div style={{ fontWeight: 800, fontSize: '16px', color: '#c084fc', marginBottom: '6px' }}>
                        📋 External APIs Needed to Complete Live 2-Way Production Integration
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--light-color)', lineHeight: 1.6, marginBottom: '14px' }}>
                        To enable direct 2-way live sync (fetching feeds and publishing directly) for all social platforms, the following platform developer APIs and server configurations are required:
                    </div>

                    <div style={{ display: 'grid', gap: '12px', fontSize: '12px' }}>
                        {/* Facebook & Instagram */}
                        <div style={{ border: '1px solid rgba(147, 197, 253, 0.3)', borderRadius: '8px', padding: '12px', background: 'rgba(0,0,0,0.3)' }}>
                            <div style={{ fontWeight: 700, color: '#93c5fd', fontSize: '13px' }}>📘 1) Meta Graph API (Facebook & Instagram)</div>
                            <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
                                <li><strong>Base URL:</strong> <code>https://graph.facebook.com/v26.0/</code></li>
                                <li><strong>Required OAuth Scopes:</strong> <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, <code>pages_show_list</code>, <code>instagram_basic</code>, <code>instagram_content_publish</code></li>
                                <li><strong>Endpoints:</strong> <code>POST /{page-id}/feed</code> (Publish), <code>GET /{page-id}/posts</code> (Read Feed)</li>
                                <li><strong>Server Configuration:</strong> <code>Social:Facebook:PageId</code>, <code>Social:Facebook:PageAccessToken</code>, <code>Social:Facebook:AppId</code>, <code>Social:Facebook:AppSecret</code></li>
                            </ul>
                        </div>

                        {/* TikTok */}
                        <div style={{ border: '1px solid rgba(103, 232, 249, 0.3)', borderRadius: '8px', padding: '12px', background: 'rgba(0,0,0,0.3)' }}>
                            <div style={{ fontWeight: 700, color: '#67e8f9', fontSize: '13px' }}>🎵 2) TikTok Content Posting & Display API v2</div>
                            <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
                                <li><strong>Base URL:</strong> <code>https://open.tiktokapis.com/v2/</code></li>
                                <li><strong>Required OAuth Scopes:</strong> <code>user.info.basic</code>, <code>video.list</code>, <code>video.publish</code>, <code>video.upload</code></li>
                                <li><strong>Endpoints:</strong> <code>POST /post/publish/video/init/</code> (Publish Video), <code>POST /video/list/</code> (Read Video Feed)</li>
                                <li><strong>Server Configuration:</strong> <code>Social:TikTok:ClientKey</code>, <code>Social:TikTok:ClientSecret</code>, <code>Social:TikTok:AccessToken</code></li>
                            </ul>
                        </div>

                        {/* YouTube */}
                        <div style={{ border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '8px', padding: '12px', background: 'rgba(0,0,0,0.3)' }}>
                            <div style={{ fontWeight: 700, color: '#f87171', fontSize: '13px' }}>▶️ 3) YouTube Data API v3</div>
                            <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
                                <li><strong>Base URL:</strong> <code>https://www.googleapis.com/youtube/v3/</code></li>
                                <li><strong>Required OAuth Scopes:</strong> <code>https://www.googleapis.com/auth/youtube.upload</code>, <code>https://www.googleapis.com/auth/youtube.readonly</code></li>
                                <li><strong>Endpoints:</strong> <code>POST /upload/youtube/v3/videos?part=snippet,status</code></li>
                                <li><strong>Server Configuration:</strong> <code>YouTube:ApiKey</code>, <code>YouTube:ClientId</code>, <code>YouTube:ClientSecret</code>, <code>YouTube:RefreshToken</code></li>
                            </ul>
                        </div>

                        {/* Twitter / X */}
                        <div style={{ border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', padding: '12px', background: 'rgba(0,0,0,0.3)' }}>
                            <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: '13px' }}>🐦 4) Twitter / X API v2</div>
                            <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
                                <li><strong>Base URL:</strong> <code>https://api.twitter.com/2/</code></li>
                                <li><strong>Required OAuth Scopes:</strong> <code>tweet.read</code>, <code>tweet.write</code>, <code>users.read</code>, <code>offline.access</code></li>
                                <li><strong>Endpoints:</strong> <code>POST /2/tweets</code> (Publish Tweet), <code>GET /2/users/{id}/tweets</code> (Fetch User Tweets)</li>
                                <li><strong>Server Configuration:</strong> <code>Social:Twitter:ApiKey</code>, <code>Social:Twitter:ApiSecret</code>, <code>Social:Twitter:BearerToken</code></li>
                            </ul>
                        </div>

                        {/* LinkedIn */}
                        <div style={{ border: '1px solid rgba(96, 165, 250, 0.3)', borderRadius: '8px', padding: '12px', background: 'rgba(0,0,0,0.3)' }}>
                            <div style={{ fontWeight: 700, color: '#60a5fa', fontSize: '13px' }}>💼 5) LinkedIn Community Management API</div>
                            <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
                                <li><strong>Base URL:</strong> <code>https://api.linkedin.com/v2/</code></li>
                                <li><strong>Required OAuth Scopes:</strong> <code>w_member_social</code>, <code>r_liteprofile</code>, <code>r_organization_social</code></li>
                                <li><strong>Endpoints:</strong> <code>POST /v2/ugcPosts</code> (Share UGC Post)</li>
                                <li><strong>Server Configuration:</strong> <code>Social:LinkedIn:ClientId</code>, <code>Social:LinkedIn:ClientSecret</code>, <code>Social:LinkedIn:AccessToken</code></li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default SocialFeedsTimeline;
