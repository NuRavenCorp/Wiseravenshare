import React, { useEffect, useMemo, useState } from 'react';
import { socialService } from '../../Services/socialService';

const REFRESH_MS = 20000;

const PLATFORMS = [
    { id: 'all', label: 'All Feeds', icon: '🌐', color: '#a855f7' },
    { id: 'facebook', label: 'Facebook', icon: '📘', color: '#93c5fd' },
    { id: 'tiktok', label: 'TikTok', icon: '🎵', color: '#67e8f9' },
    { id: 'bluesky', label: 'Bluesky', icon: '🦋', color: '#38bdf8' },
    { id: 'reddit', label: 'Reddit', icon: '🤖', color: '#f97316' },
    { id: 'youtube', label: 'YouTube', icon: '▶️', color: '#f87171' },
    { id: 'rss', label: 'RSS & News Reader', icon: '📡', color: '#eab308' },
    { id: 'instagram', label: 'Instagram', icon: '📸', color: '#f9a8d4' },
    { id: 'twitter', label: 'Twitter / X', icon: '🐦', color: '#38bdf8' },
    { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#60a5fa' }
];

const CURATED_TEMPLATES = [
    { id: 'cards', label: 'Standard Cards' },
    { id: 'list', label: 'Compact List' },
    { id: 'signage', label: 'Digital Signage / Kiosk' }
];

const PROFANITY_PATTERNS = [
    /\b(fuck|shit|bitch|asshole|bastard)\b/i
];

const hasProfanity = (text) => PROFANITY_PATTERNS.some((pattern) => pattern.test(String(text || '')));

const normalizeFeedKey = (item) => [
    String(item?.platform || '').toLowerCase().trim(),
    String(item?.externalId || item?.id || '').toLowerCase().trim(),
    String(item?.text || '').toLowerCase().replace(/\s+/g, ' ').trim()
].join('|');

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
                        : platform === 'bluesky'
                            ? (username ? `https://bsky.app/profile/${username}` : '')
                            : platform === 'reddit'
                                ? (username ? `https://www.reddit.com/r/${username}` : '')
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

const readCachedRssSubscriptions = () => {
    try {
        const raw = localStorage.getItem('wiseRssSubscriptions');
        return raw ? JSON.parse(raw) : [
            'https://techcrunch.com/feed/',
            'https://news.ycombinator.com/rss'
        ];
    } catch {
        return [];
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
        linkedin: getConnection(source, 'linkedin', 'LinkedIn'),
        bluesky: getConnection(source, 'bluesky', 'Bluesky'),
        reddit: getConnection(source, 'reddit', 'Reddit')
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

    if (/\/posts\/|\/photos\/|\/videos\/|\/permalink\//i.test(normalizedUrl)) {
        return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(normalizedUrl)}&show_text=true&width=500`;
    }

    return `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(normalizedUrl)}&tabs=timeline&width=500&height=500&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true`;
};

const getYouTubeEmbedUrl = (url) => {
    if (!url) return '';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/i);
    if (!match?.[1]) return '';
    return `https://www.youtube.com/embed/${match[1]}`;
};

const FeedEmbedCard = ({ item, compact }) => {
    const platformId = String(item.id || item.platform || '').toLowerCase();
    const isTikTok = platformId === 'tiktok';
    const isFacebook = platformId === 'facebook';
    const isInstagram = platformId === 'instagram';
    const isYouTube = platformId === 'youtube';

    const embedUrl = isTikTok
        ? getTikTokEmbedUrl(item.url)
        : isFacebook
            ? getFacebookEmbedUrl(item.url)
            : isInstagram
                ? getInstagramEmbedUrl(item.url)
                : isYouTube
                    ? getYouTubeEmbedUrl(item.url)
                    : '';

    return (
        <article
            style={{
                border: `1px solid ${item.color || 'var(--border-color)'}`,
                borderRadius: '12px',
                padding: compact ? '10px' : '14px',
                background: 'rgba(15, 23, 42, 0.4)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong>
                    <span style={{ marginRight: '6px' }}>{item.icon || '🌐'}</span>
                    {item.platform}
                </strong>
                <a href={item.url} target="_blank" rel="noreferrer" style={{ color: item.color || '#38bdf8', fontSize: '12px', textDecoration: 'none' }}>
                    Open External Feed ↗
                </a>
            </div>

            {embedUrl ? (
                <iframe
                    title={`${item.platform} feed embed`}
                    src={embedUrl}
                    style={{
                        width: '100%',
                        minHeight: isTikTok ? '480px' : isYouTube ? '320px' : '400px',
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
                    Embedded feed channel active for <strong>{item.platform}</strong> ({item.username || item.url}).
                    <div style={{ marginTop: '4px' }}>
                        <a href={item.url} target="_blank" rel="noreferrer" style={{ color: item.color || '#38bdf8' }}>{item.url}</a>
                    </div>
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
        bluesky: normalizeConnection(feeds.bluesky, 'bluesky'),
        reddit: normalizeConnection(feeds.reddit, 'reddit'),
        userName: source.name || cached?.name || 'User',
        checkedAt: new Date().toISOString()
    };
};

const SocialFeedsTimeline = ({ user, compact = false, initialPlatform = 'all' }) => {
    const [snapshot, setSnapshot] = useState(() => getSnapshot(user));
    const [feedItems, setFeedItems] = useState([]);
    const [isLoadingFeed, setIsLoadingFeed] = useState(false);
    const [activePlatform, setActivePlatform] = useState(() => {
        const cleaned = String(initialPlatform || 'all').toLowerCase().replace('-feed', '');
        return PLATFORMS.some((p) => p.id === cleaned) ? cleaned : 'all';
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [displayTemplate, setDisplayTemplate] = useState('cards');
    const [hideDuplicates, setHideDuplicates] = useState(true);
    const [hideProfanity, setHideProfanity] = useState(false);

    // Multi-Platform Publisher State
    const [postMessage, setPostMessage] = useState('');
    const [mediaUrlInput, setMediaUrlInput] = useState('');
    const [linkUrlInput, setLinkUrlInput] = useState('');
    const [publishFacebook, setPublishFacebook] = useState(true);
    const [publishTikTok, setPublishTikTok] = useState(false);
    const [publishYouTube, setPublishYouTube] = useState(false);
    const [publishBluesky, setPublishBluesky] = useState(true);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishResults, setPublishResults] = useState(null);

    // Account Handle Linking State
    const [showHandleConfig, setShowHandleConfig] = useState(false);
    const [handles, setHandles] = useState({
        facebook: snapshot.facebook.username || '',
        tiktok: snapshot.tikTok.username || '',
        instagram: snapshot.instagram.username || '',
        youtube: snapshot.youtube.username || '',
        twitter: snapshot.twitter.username || '',
        linkedin: snapshot.linkedin.username || '',
        bluesky: snapshot.bluesky.username || '',
        reddit: snapshot.reddit.username || ''
    });

    // Custom RSS Subscriptions Manager
    const [showRssManager, setShowRssManager] = useState(false);
    const [rssSubscriptions, setRssSubscriptions] = useState(() => readCachedRssSubscriptions());
    const [newRssUrl, setNewRssUrl] = useState('');

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

        const loadCombinedFeed = async () => {
            setIsLoadingFeed(true);
            try {
                const primaryRss = rssSubscriptions.length > 0 ? rssSubscriptions[0] : undefined;
                const items = await socialService.getCombinedFeed(
                    compact ? 10 : 30,
                    snapshot.facebook.username || undefined,
                    snapshot.tikTok.username || undefined,
                    snapshot.bluesky.username || undefined,
                    snapshot.reddit.username || undefined,
                    snapshot.youtube.username || undefined,
                    primaryRss,
                    searchQuery || undefined
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
    }, [
        compact,
        snapshot.facebook.username,
        snapshot.tikTok.username,
        snapshot.bluesky.username,
        snapshot.reddit.username,
        snapshot.youtube.username,
        rssSubscriptions,
        searchQuery
    ]);

    const handleSaveHandles = (e) => {
        e?.preventDefault();
        const updatedFeeds = {
            facebook: { username: handles.facebook.trim(), enabled: Boolean(handles.facebook.trim()) },
            tikTok: { username: handles.tiktok.trim(), enabled: Boolean(handles.tiktok.trim()) },
            instagram: { username: handles.instagram.trim(), enabled: Boolean(handles.instagram.trim()) },
            youtube: { username: handles.youtube.trim(), enabled: Boolean(handles.youtube.trim()) },
            twitter: { username: handles.twitter.trim(), enabled: Boolean(handles.twitter.trim()) },
            linkedin: { username: handles.linkedin.trim(), enabled: Boolean(handles.linkedin.trim()) },
            bluesky: { username: handles.bluesky.trim(), enabled: Boolean(handles.bluesky.trim()) },
            reddit: { username: handles.reddit.trim(), enabled: Boolean(handles.reddit.trim()) }
        };

        try {
            localStorage.setItem('wiseSocialFeeds', JSON.stringify(updatedFeeds));
            const cachedUser = readCachedUser() || {};
            const nextUser = { ...cachedUser, socialFeeds: updatedFeeds };
            localStorage.setItem('user_data', JSON.stringify(nextUser));
            window.dispatchEvent(new Event('wiseraven:social-updated'));
            setShowHandleConfig(false);
        } catch (err) {
            console.warn('Failed to save handle settings:', err);
        }
    };

    const handleAddRssFeed = (e) => {
        e?.preventDefault();
        const url = newRssUrl.trim();
        if (!url || rssSubscriptions.includes(url)) return;

        const updated = [...rssSubscriptions, url];
        setRssSubscriptions(updated);
        try {
            localStorage.setItem('wiseRssSubscriptions', JSON.stringify(updated));
        } catch (err) {
            console.warn('Failed to save RSS subscriptions:', err);
        }
        setNewRssUrl('');
    };

    const handleRemoveRssFeed = (urlToRemove) => {
        const updated = rssSubscriptions.filter((url) => url !== urlToRemove);
        setRssSubscriptions(updated);
        try {
            localStorage.setItem('wiseRssSubscriptions', JSON.stringify(updated));
        } catch (err) {
            console.warn('Failed to update RSS subscriptions:', err);
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
                publishToYouTube: publishYouTube && isVideoUrl,
                publishToBluesky: publishBluesky
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
            items.push({ id: 'facebook', platform: 'Facebook', icon: '📘', color: '#93c5fd', username: snapshot.facebook.username, url: snapshot.facebook.resolvedUrl });
        }
        if (snapshot.tikTok.enabled || snapshot.tikTok.resolvedUrl) {
            items.push({ id: 'tiktok', platform: 'TikTok', icon: '🎵', color: '#67e8f9', username: snapshot.tikTok.username, url: snapshot.tikTok.resolvedUrl });
        }
        if (snapshot.bluesky.enabled || snapshot.bluesky.resolvedUrl) {
            items.push({ id: 'bluesky', platform: 'Bluesky', icon: '🦋', color: '#38bdf8', username: snapshot.bluesky.username, url: snapshot.bluesky.resolvedUrl });
        }
        if (snapshot.reddit.enabled || snapshot.reddit.resolvedUrl) {
            items.push({ id: 'reddit', platform: 'Reddit', icon: '🤖', color: '#f97316', username: snapshot.reddit.username, url: snapshot.reddit.resolvedUrl });
        }
        if (snapshot.youtube.enabled || snapshot.youtube.resolvedUrl) {
            items.push({ id: 'youtube', platform: 'YouTube', icon: '▶️', color: '#f87171', username: snapshot.youtube.username, url: snapshot.youtube.resolvedUrl });
        }
        if (snapshot.instagram.enabled || snapshot.instagram.resolvedUrl) {
            items.push({ id: 'instagram', platform: 'Instagram', icon: '📸', color: '#f9a8d4', username: snapshot.instagram.username, url: snapshot.instagram.resolvedUrl });
        }
        if (snapshot.twitter.enabled || snapshot.twitter.resolvedUrl) {
            items.push({ id: 'twitter', platform: 'Twitter / X', icon: '🐦', color: '#38bdf8', username: snapshot.twitter.username, url: snapshot.twitter.resolvedUrl });
        }
        if (snapshot.linkedin.enabled || snapshot.linkedin.resolvedUrl) {
            items.push({ id: 'linkedin', platform: 'LinkedIn', icon: '💼', color: '#60a5fa', username: snapshot.linkedin.username, url: snapshot.linkedin.resolvedUrl });
        }

        if (activePlatform === 'all') return items;
        return items.filter((item) => item.id === activePlatform);
    }, [snapshot, activePlatform]);

    const filteredFeedItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const seen = new Set();

        return feedItems.filter((item) => {
            const platform = String(item.platform || '').toLowerCase();
            const text = String(item.text || '').toLowerCase();
            const author = String(item.authorHandle || '').toLowerCase();
            const matchesPlatform = activePlatform === 'all' || platform === activePlatform;
            const matchesSearch = !query || text.includes(query) || author.includes(query);
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
    }, [feedItems, activePlatform, searchQuery, hideDuplicates, hideProfanity]);

    const activeMeta = PLATFORMS.find((p) => p.id === activePlatform) || PLATFORMS[0];

    return (
        <section
            style={{
                background: 'linear-gradient(160deg, rgba(15,23,42,0.85), rgba(15,23,42,0.95))',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: compact ? '14px' : '22px',
                marginBottom: '24px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}
        >
            {/* Header with Title & Action Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{activeMeta.icon}</span> Multi-Platform Social & Feed Aggregator
                    </h2>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>
                        Synced live for <strong>{snapshot.userName}</strong> · {filteredFeedItems.length} items loaded · Updated {new Date(snapshot.checkedAt).toLocaleTimeString()}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setShowRssManager(!showRssManager)}
                        style={{
                            border: '1px solid rgba(234, 179, 8, 0.4)',
                            background: 'rgba(234, 179, 8, 0.1)',
                            color: '#eab308',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        📡 Custom RSS Feeds ({rssSubscriptions.length})
                    </button>
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
                        🎥 TikTok Guide
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowHandleConfig(!showHandleConfig)}
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.06)',
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
                        📘 Developer APIs
                    </button>
                </div>
            </div>

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
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#38bdf8' }}>
                    🧭 Curator Controls & View Layouts
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                        <span>Search posts</span>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
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
            </div>

            {/* Platform Selector Tabs */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '18px' }}>
                {PLATFORMS.map((platform) => (
                    <button
                        key={platform.id}
                        type="button"
                        onClick={() => setActivePlatform(platform.id)}
                        style={{
                            border: activePlatform === platform.id ? `1px solid ${platform.color}` : '1px solid var(--border-color)',
                            background: activePlatform === platform.id ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.4)',
                            color: 'var(--text-color)',
                            borderRadius: '999px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: activePlatform === platform.id ? 700 : 400,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <span>{platform.icon}</span> {platform.label}
                    </button>
                ))}
            </div>

            {/* Custom RSS Manager Drawer */}
            {showRssManager && (
                <div
                    style={{
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(234, 179, 8, 0.4)',
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '18px',
                        display: 'grid',
                        gap: '12px'
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#eab308', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📡 Custom RSS & Atom Feed Subscription Manager
                    </div>

                    <form onSubmit={handleAddRssFeed} style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="url"
                            value={newRssUrl}
                            onChange={(e) => setNewRssUrl(e.target.value)}
                            placeholder="Enter RSS/Atom XML feed URL (e.g. https://techcrunch.com/feed/)"
                            style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff', fontSize: '12px' }}
                        />
                        <button
                            type="submit"
                            disabled={!newRssUrl.trim()}
                            style={{ border: 'none', background: '#eab308', color: '#000', borderRadius: '6px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}
                        >
                            + Add Feed
                        </button>
                    </form>

                    <div style={{ display: 'grid', gap: '6px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--light-color)' }}>Active RSS Subscriptions:</div>
                        {rssSubscriptions.length === 0 ? (
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No custom RSS feeds added yet.</div>
                        ) : (
                            rssSubscriptions.map((url, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}>
                                    <span style={{ color: '#fef08a', wordBreak: 'break-all' }}>{url}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveRssFeed(url)}
                                        style={{ border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Account Handle Configuration Drawer */}
            {showHandleConfig && (
                <form
                    onSubmit={handleSaveHandles}
                    style={{
                        background: 'rgba(15,23,42,0.85)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '18px',
                        marginBottom: '18px',
                        display: 'grid',
                        gap: '14px'
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#38bdf8' }}>
                        🔗 Configure Social Media Handles / Subreddits / Channel Handles
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>📘 Facebook Page ID or Handle</span>
                            <input
                                type="text"
                                value={handles.facebook}
                                onChange={(e) => setHandles({ ...handles, facebook: e.target.value })}
                                placeholder="e.g. MyBrandPage"
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
                            <span>🦋 Bluesky Handle</span>
                            <input
                                type="text"
                                value={handles.bluesky}
                                onChange={(e) => setHandles({ ...handles, bluesky: e.target.value })}
                                placeholder="e.g. bsky.app or user.bsky.social"
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>🤖 Reddit Subreddit</span>
                            <input
                                type="text"
                                value={handles.reddit}
                                onChange={(e) => setHandles({ ...handles, reddit: e.target.value })}
                                placeholder="e.g. technology or news"
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>▶️ YouTube Channel Handle / ID</span>
                            <input
                                type="text"
                                value={handles.youtube}
                                onChange={(e) => setHandles({ ...handles, youtube: e.target.value })}
                                placeholder="e.g. MyChannel or UCxxxx"
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
                    padding: '18px',
                    marginBottom: '20px'
                }}
            >
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ✍️ Multi-Platform Crosspost Publisher ({activeMeta.label})
                </div>

                <textarea
                    rows={3}
                    value={postMessage}
                    onChange={(e) => setPostMessage(e.target.value)}
                    placeholder={`Write an update or announcement to publish across ${activeMeta.label}, Facebook, TikTok, YouTube, Bluesky...`}
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '12px' }}>
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
                        placeholder="Link URL (optional for Facebook/Bluesky/LinkedIn)"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(15,23,42,0.4)', color: '#fff', fontSize: '12px' }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={publishFacebook} onChange={(e) => setPublishFacebook(e.target.checked)} />
                            📘 Facebook
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={publishBluesky} onChange={(e) => setPublishBluesky(e.target.checked)} />
                            🦋 Bluesky
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={publishTikTok} onChange={(e) => setPublishTikTok(e.target.checked)} />
                            🎵 TikTok
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
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
                            padding: '10px 22px',
                            fontWeight: 700,
                            cursor: isPublishing ? 'wait' : 'pointer',
                            boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)'
                        }}
                    >
                        {isPublishing ? 'Publishing...' : '🚀 Publish Multi-Post'}
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

            {/* Embedded Active Feed Channels Stream */}
            {timelineItems.length > 0 && (
                <div style={{ display: 'grid', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#93c5fd' }}>
                        Active Embedded Channel Streams ({timelineItems.length})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                        {timelineItems.map((item) => (
                            <FeedEmbedCard key={`${item.id}-feed-embed`} item={item} compact={compact} />
                        ))}
                    </div>
                </div>
            )}

            {/* Live Aggregated Feed Timeline */}
            <div style={{ marginTop: '16px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Live {activeMeta.label} Stream Items ({filteredFeedItems.length})</span>
                    {isLoadingFeed && <span style={{ fontSize: '12px', color: '#38bdf8' }}>Refreshing feeds...</span>}
                </div>

                {!isLoadingFeed && filteredFeedItems.length === 0 && (
                    <div style={{ fontSize: '13px', color: 'var(--light-color)', padding: '16px', border: '1px dashed var(--border-color)', borderRadius: '10px', textAlign: 'center' }}>
                        No live items returned for {activeMeta.label}. Configure handles in "⚙️ Connect Accounts" or add RSS feeds to populate live items.
                    </div>
                )}

                <div style={{ display: 'grid', gap: displayTemplate === 'list' ? '8px' : '12px' }}>
                    {filteredFeedItems.map((item) => {
                        const platformColor =
                            item.platform === 'facebook' ? '#93c5fd' :
                            item.platform === 'tiktok' ? '#67e8f9' :
                            item.platform === 'bluesky' ? '#38bdf8' :
                            item.platform === 'reddit' ? '#f97316' :
                            item.platform === 'youtube' ? '#f87171' :
                            item.platform === 'rss' ? '#eab308' : '#a855f7';

                        return (
                            <article
                                key={`${item.platform}-${item.externalId}`}
                                style={{
                                    border: `1px solid rgba(255,255,255,0.08)`,
                                    borderLeft: `4px solid ${platformColor}`,
                                    borderRadius: '10px',
                                    padding: '14px',
                                    background: displayTemplate === 'signage' ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.5)',
                                    display: displayTemplate === 'list' ? 'grid' : 'block',
                                    gap: displayTemplate === 'list' ? '8px' : '0',
                                    transition: 'transform 0.15s ease'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: 'var(--light-color)' }}>
                                    <span style={{ textTransform: 'uppercase', fontWeight: 800, color: platformColor }}>
                                        {item.platform} {item.authorHandle ? `• ${item.authorHandle}` : ''}
                                    </span>
                                    <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</span>
                                </div>

                                <div style={{ marginTop: '8px', fontSize: '13px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                                    {item.text || 'No text content.'}
                                </div>

                                {item.mediaUrl && (
                                    <div style={{ marginTop: '10px' }}>
                                        <img
                                            src={item.mediaUrl}
                                            alt="Feed Thumbnail"
                                            style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '8px', objectFit: 'cover' }}
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    </div>
                                )}

                                {item.permalinkUrl && (
                                    <a
                                        href={item.permalinkUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                            marginTop: '10px',
                                            display: 'inline-block',
                                            fontSize: '12px',
                                            color: platformColor,
                                            textDecoration: 'none',
                                            fontWeight: 600
                                        }}
                                    >
                                        Open Original Post ↗
                                    </a>
                                )}
                            </article>
                        );
                    })}
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
                        TikTok Developer App Review requires submitting a 1–2 minute screen recording demo video showing the end-to-end user flow:
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
                                Open <strong>⚙️ Connect Accounts</strong> or <strong>Profile Settings</strong>, click <strong>"Connect TikTok Account"</strong>, and show the TikTok OAuth authorization dialog requesting permissions.
                            </div>
                        </div>

                        <div style={{ border: '1px solid rgba(103, 232, 249, 0.3)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.3)' }}>
                            <strong style={{ color: '#38bdf8' }}>Step 3: Create & Select Video Content</strong>
                            <div style={{ marginTop: '4px', color: 'var(--light-color)' }}>
                                Select a video file or URL, enter a caption, and check the <strong>🎵 TikTok</strong> target box.
                            </div>
                        </div>

                        <div style={{ border: '1px solid rgba(103, 232, 249, 0.3)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.3)' }}>
                            <strong style={{ color: '#38bdf8' }}>Step 4: Execute Direct Publish & Show Confirmation</strong>
                            <div style={{ marginTop: '4px', color: 'var(--light-color)' }}>
                                Click <strong>🚀 Publish Post</strong>. Show the real-time confirmation response.
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
                        📋 External APIs Supported for Live Multi-Platform Sync
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--light-color)', lineHeight: 1.6, marginBottom: '14px' }}>
                        Wiseravenshare aggregates live feeds and supports multi-platform cross-posting across Meta (Facebook/Instagram), TikTok, Bluesky (AT Protocol), Reddit, YouTube Data API, and universal RSS 2.0 / Atom XML feeds.
                    </div>
                </div>
            )}
        </section>
    );
};

export default SocialFeedsTimeline;
