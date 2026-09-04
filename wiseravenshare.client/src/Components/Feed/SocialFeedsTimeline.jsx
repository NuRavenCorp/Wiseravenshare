import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../../Services/api';
import { socialService } from '../../Services/socialService';

const REFRESH_MS = 15000;
const CUSTOM_RSS_STORAGE_KEY = 'wiseCustomRssAtomFeeds';

const PLATFORMS = [
    { id: 'all', label: 'All Feeds', icon: '🌐', color: '#a855f7' },
    { id: 'facebook', label: 'Facebook', icon: '📘', color: '#93c5fd' },
    { id: 'tiktok', label: 'TikTok', icon: '🎵', color: '#67e8f9' },
    { id: 'instagram', label: 'Instagram', icon: '📸', color: '#f9a8d4' },
    { id: 'youtube', label: 'YouTube', icon: '▶️', color: '#f87171' },
    { id: 'twitter', label: 'Twitter / X', icon: '🐦', color: '#38bdf8' },
    { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#60a5fa' },
    { id: 'bluesky', label: 'Bluesky', icon: '🦋', color: '#60a5fa' },
    { id: 'rss', label: 'Custom RSS', icon: '📡', color: '#f97316' },
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
                        : platform === 'bluesky'
                            ? (username ? `https://bsky.app/profile/${username}` : '')
                            : (username ? `https://www.tiktok.com/@${username}` : '');

    return {
        enabled: Boolean(safeConnection.enabled || username || feedUrl || profileUrl),
        username,
        profileUrl,
        feedUrl,
        designation: String(safeConnection.designation || '').trim(),
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

const normalizeCustomFeed = (feed, index = 0) => ({
    id: String(feed?.id || `rss-${index}`).trim() || `rss-${index}`,
    source: String(feed?.source || '').trim() || `Custom Feed ${index + 1}`,
    rssUrl: String(feed?.rssUrl || feed?.url || '').trim()
});

const readCustomRssFeeds = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(CUSTOM_RSS_STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((feed, index) => normalizeCustomFeed(feed, index))
            .filter((feed) => feed.rssUrl.length > 0);
    } catch {
        return [];
    }
};

const isHttpUrl = (value) => {
    try {
        const parsed = new URL(String(value || '').trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const mapRssItemToFeedItem = (feed, item, index) => {
    const text = String(item?.description || item?.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
        platform: 'rss',
        externalId: `${feed.id}-${item?.guid || item?.link || index}`,
        text: item?.title ? `${item.title}${text ? ` — ${text.slice(0, 220)}` : ''}` : text || 'No text provided.',
        mediaUrl: String(item?.thumbnail || item?.enclosure?.link || '').trim() || undefined,
        permalinkUrl: String(item?.link || '').trim() || feed.rssUrl,
        authorHandle: feed.source,
        createdAt: item?.pubDate || item?.isoDate || new Date().toISOString()
    };
};

const hasProfanity = (text) => PROFANITY_PATTERNS.some((pattern) => pattern.test(String(text || '')));

const normalizeFeedKey = (item) => [
    String(item?.platform || '').toLowerCase().trim(),
    String(item?.externalId || item?.id || '').toLowerCase().trim(),
    String(item?.text || '').toLowerCase().replace(/\s+/g, ' ').trim()
].join('|');

const normalizeFeeds = (feeds) => {
    const source = feeds || {};
    return {
        tikTok: getConnection(source, 'tikTok', 'tiktok', 'TikTok'),
        facebook: getConnection(source, 'facebook', 'Facebook'),
        instagram: getConnection(source, 'instagram', 'Instagram'),
        youtube: getConnection(source, 'youtube', 'YouTube'),
        twitter: getConnection(source, 'twitter', 'Twitter'),
        linkedin: getConnection(source, 'linkedin', 'LinkedIn'),
        bluesky: getConnection(source, 'bluesky', 'Bluesky')
    };
};

const FeedEmbedCard = ({ item, compact, previewItems = [] }) => {
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
                <div>
                    <strong>
                        <span style={{ marginRight: '6px' }}>{item.icon}</span>
                        {item.platform}
                    </strong>
                    {item.designation && (
                        <div style={{ fontSize: '11px', color: 'var(--light-color)', marginTop: '2px' }}>
                            Active as {item.designation.replace(/-/g, ' ')}
                        </div>
                    )}
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" style={{ color: item.color, fontSize: '12px' }}>
                    Open Feed Link ↗
                </a>
            </div>

            {previewItems.length > 0 ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                    {previewItems.slice(0, compact ? 1 : 3).map((preview, index) => (
                        <div
                            key={`${item.id}-preview-${preview.externalId || preview.id || index}`}
                            style={{
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(11, 15, 20, 0.75)',
                                padding: '8px 10px'
                            }}
                        >
                            <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '4px' }}>
                                {preview.authorHandle || preview.authorName || 'Creator'}
                                {preview.createdAt ? ` · ${new Date(preview.createdAt).toLocaleString()}` : ''}
                            </div>
                            <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                {preview.text || 'No text provided.'}
                            </div>
                            {preview.permalinkUrl && (
                                <a
                                    href={preview.permalinkUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ display: 'inline-block', marginTop: '6px', fontSize: '12px', color: item.color }}
                                >
                                    Open post ↗
                                </a>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ fontSize: '12px', color: 'var(--light-color)', lineHeight: 1.5 }}>
                    No recent {item.platform} items yet. Feed will appear here once posts are available.
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
        userName: source.name || cached?.name || 'User',
        checkedAt: new Date().toISOString()
    };
};

const normalizeFeedConnections = (feeds = {}) => ({
    facebook: {
        enabled: Boolean(feeds.facebook?.enabled),
        username: String(feeds.facebook?.username || '').trim(),
        profileUrl: String(feeds.facebook?.profileUrl || '').trim(),
        feedUrl: String(feeds.facebook?.feedUrl || '').trim(),
        designation: String(feeds.facebook?.designation || '').trim()
    },
    tikTok: {
        enabled: Boolean(feeds.tikTok?.enabled),
        username: String(feeds.tikTok?.username || '').trim(),
        profileUrl: String(feeds.tikTok?.profileUrl || '').trim(),
        feedUrl: String(feeds.tikTok?.feedUrl || '').trim(),
        designation: String(feeds.tikTok?.designation || '').trim()
    },
    instagram: {
        enabled: Boolean(feeds.instagram?.enabled),
        username: String(feeds.instagram?.username || '').trim(),
        profileUrl: String(feeds.instagram?.profileUrl || '').trim(),
        feedUrl: String(feeds.instagram?.feedUrl || '').trim(),
        designation: String(feeds.instagram?.designation || '').trim()
    },
    youtube: {
        enabled: Boolean(feeds.youtube?.enabled),
        username: String(feeds.youtube?.username || '').trim(),
        profileUrl: String(feeds.youtube?.profileUrl || '').trim(),
        feedUrl: String(feeds.youtube?.feedUrl || '').trim(),
        designation: String(feeds.youtube?.designation || '').trim()
    },
    twitter: {
        enabled: Boolean(feeds.twitter?.enabled),
        username: String(feeds.twitter?.username || '').trim(),
        profileUrl: String(feeds.twitter?.profileUrl || '').trim(),
        feedUrl: String(feeds.twitter?.feedUrl || '').trim(),
        designation: String(feeds.twitter?.designation || '').trim()
    },
    linkedin: {
        enabled: Boolean(feeds.linkedin?.enabled),
        username: String(feeds.linkedin?.username || '').trim(),
        profileUrl: String(feeds.linkedin?.profileUrl || '').trim(),
        feedUrl: String(feeds.linkedin?.feedUrl || '').trim(),
        designation: String(feeds.linkedin?.designation || '').trim()
    },
    bluesky: {
        enabled: Boolean(feeds.bluesky?.enabled),
        username: String(feeds.bluesky?.username || '').trim(),
        profileUrl: String(feeds.bluesky?.profileUrl || '').trim(),
        feedUrl: String(feeds.bluesky?.feedUrl || '').trim(),
        designation: String(feeds.bluesky?.designation || '').trim()
    }
});

const getConnectedPlatforms = (snapshot) => {
    const source = snapshot || {};
    return PLATFORMS
        .filter((platform) => platform.id !== 'all' && platform.id !== 'reddit')
        .filter((platform) => {
            const key = platform.id === 'tiktok' ? 'tikTok' : platform.id;
            const connection = source[key] || {};
            return Boolean(connection.enabled || connection.username || connection.profileUrl || connection.feedUrl || connection.resolvedUrl);
        });
};

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
    const [connectionNotice, setConnectionNotice] = useState('');

    // Account Handle Linking State
    const [showHandleConfig, setShowHandleConfig] = useState(false);
    const [handles, setHandles] = useState({
        facebook: snapshot.facebook.username || '',
        tiktok: snapshot.tikTok.username || '',
        instagram: snapshot.instagram.username || '',
        youtube: snapshot.youtube.username || '',
        twitter: snapshot.twitter.username || '',
        linkedin: snapshot.linkedin.username || '',
        bluesky: snapshot.bluesky.username || ''
    });

    // Demo Guide Expansion
    const [showTikTokDemo, setShowTikTokDemo] = useState(false);
    const [showCustomRssFeeds, setShowCustomRssFeeds] = useState(false);
    const [customRssFeeds, setCustomRssFeeds] = useState(() => readCustomRssFeeds());
    const [customFeedSource, setCustomFeedSource] = useState('');
    const [customFeedUrl, setCustomFeedUrl] = useState('');
    const [customFeedError, setCustomFeedError] = useState('');
    const [showDeveloperApis, setShowDeveloperApis] = useState(false);
    const [providerStatuses, setProviderStatuses] = useState([]);
    const [providerStatusError, setProviderStatusError] = useState('');

    useEffect(() => {
        setSnapshot(getSnapshot(user));
    }, [user]);

    useEffect(() => {
        const cleaned = String(initialPlatform || 'all').toLowerCase().replace('-feed', '');
        if (PLATFORMS.some((platform) => platform.id === cleaned)) {
            setActivePlatform(cleaned);
        }
    }, [initialPlatform]);

    useEffect(() => {
        const handleOpenAggregator = (event) => {
            const detail = event?.detail || {};
            const platform = String(detail.platform || '').trim().toLowerCase().replace('-feed', '');
            const hasKnownPlatform = platform && PLATFORMS.some((item) => item.id === platform);
            if (hasKnownPlatform) {
                setActivePlatform(platform);
            }
            if (detail.openConfig) {
                setShowHandleConfig(true);
            }
        };

        window.addEventListener('wiseraven:open-social-aggregator', handleOpenAggregator);
        return () => {
            window.removeEventListener('wiseraven:open-social-aggregator', handleOpenAggregator);
        };
    }, []);

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
        localStorage.setItem(CUSTOM_RSS_STORAGE_KEY, JSON.stringify(customRssFeeds));
    }, [customRssFeeds]);

    useEffect(() => {
        let cancelled = false;
        const loadProviderStatuses = async () => {
            try {
                const statuses = await socialService.getProviderStatuses();
                if (!cancelled) {
                    setProviderStatuses(Array.isArray(statuses) ? statuses : []);
                    setProviderStatusError('');
                }
            } catch (error) {
                if (!cancelled) {
                    setProviderStatuses([]);
                    setProviderStatusError(error?.message || 'Unable to load provider API status.');
                }
            }
        };

        loadProviderStatuses();
        return () => {
            cancelled = true;
        };
    }, []);

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
                    linkedin: loadedFeeds.linkedin.username,
                    bluesky: loadedFeeds.bluesky.username
                });
            } catch {
                if (cancelled) return;
                setHandles({
                    facebook: snapshot.facebook.username || '',
                    tiktok: snapshot.tikTok.username || '',
                    instagram: snapshot.instagram.username || '',
                    youtube: snapshot.youtube.username || '',
                    twitter: snapshot.twitter.username || '',
                    linkedin: snapshot.linkedin.username || '',
                    bluesky: snapshot.bluesky.username || ''
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
                const socialItems = await socialService.getCombinedFeed(
                    compact ? 5 : 15,
                    snapshot.facebook.username || undefined,
                    snapshot.tikTok.username || undefined,
                    snapshot.bluesky.username || undefined
                );

                const rssResults = await Promise.all(customRssFeeds.map(async (feed) => {
                    try {
                        const rssToJsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.rssUrl)}`;
                        const response = await fetch(rssToJsonUrl);
                        if (!response.ok) {
                            return [];
                        }
                        const payload = await response.json();
                        const items = Array.isArray(payload?.items) ? payload.items.slice(0, compact ? 4 : 8) : [];
                        return items.map((item, index) => mapRssItemToFeedItem(feed, item, index));
                    } catch {
                        return [];
                    }
                }));
                const rssItems = rssResults.flat();
                const mergedItems = [...(Array.isArray(socialItems) ? socialItems : []), ...rssItems]
                    .sort((left, right) => {
                        const leftTime = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
                        const rightTime = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
                        return rightTime - leftTime;
                    });

                if (!cancelled) {
                    setFeedItems(mergedItems);
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
    }, [compact, snapshot.facebook.username, snapshot.tikTok.username, snapshot.bluesky.username, customRssFeeds]);

    const handleSaveHandles = async (e) => {
        e?.preventDefault();
        const updatedFeeds = {
            facebook: { username: handles.facebook.trim(), enabled: Boolean(handles.facebook.trim()) },
            tikTok: { username: handles.tiktok.trim(), enabled: Boolean(handles.tiktok.trim()) },
            instagram: { username: handles.instagram.trim(), enabled: Boolean(handles.instagram.trim()) },
            youtube: { username: handles.youtube.trim(), enabled: Boolean(handles.youtube.trim()) },
            twitter: { username: handles.twitter.trim(), enabled: Boolean(handles.twitter.trim()) },
            linkedin: { username: handles.linkedin.trim(), enabled: Boolean(handles.linkedin.trim()) },
            bluesky: { username: handles.bluesky.trim(), enabled: Boolean(handles.bluesky.trim()) }
        };

        try {
            const userId = user?.id;
            let persistedFeeds = updatedFeeds;
            if (userId) {
                try {
                    const response = await apiService.updateSocialFeeds(userId, updatedFeeds);
                    persistedFeeds = normalizeFeedConnections(response?.data || response || updatedFeeds);
                } catch (err) {
                    console.warn('Backend social feed save failed, using local cache fallback:', err);
                }
            }

            localStorage.setItem('wiseSocialFeeds', JSON.stringify(persistedFeeds));
            const cachedUser = readCachedUser() || {};
            const nextUser = { ...cachedUser, ...user, socialFeeds: persistedFeeds };
            localStorage.setItem('user_data', JSON.stringify(nextUser));
            window.dispatchEvent(new Event('wiseraven:social-updated'));
            const nextSnapshot = getSnapshot(nextUser);
            const connected = getConnectedPlatforms(nextSnapshot);
            setConnectionNotice(
                connected.length > 0
                    ? `Connected ${connected.length} account${connected.length === 1 ? '' : 's'}: ${connected.map((item) => item.label).join(', ')}.`
                    : 'No social accounts connected yet.'
            );
            if (connected.length > 0) {
                setActivePlatform(connected[0].id);
            }
            setShowHandleConfig(false);
        } catch (err) {
            console.warn('Failed to save handle settings:', err);
            setConnectionNotice('Unable to save account handles right now.');
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

    const handleAddCustomFeed = (event) => {
        event.preventDefault();
        const source = String(customFeedSource || '').trim();
        const rssUrl = String(customFeedUrl || '').trim();
        setCustomFeedError('');

        if (!rssUrl) {
            setCustomFeedError('Feed URL is required.');
            return;
        }

        if (!isHttpUrl(rssUrl)) {
            setCustomFeedError('Feed URL must be a valid http:// or https:// address.');
            return;
        }

        setCustomRssFeeds((prev) => {
            const normalizedUrl = rssUrl.toLowerCase();
            const duplicate = prev.some((item) => item.rssUrl.toLowerCase() === normalizedUrl);
            if (duplicate) {
                setCustomFeedError('That feed is already added.');
                return prev;
            }

            return [
                {
                    id: `rss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                    source: source || 'Custom RSS Feed',
                    rssUrl
                },
                ...prev
            ].slice(0, 20);
        });

        setCustomFeedSource('');
        setCustomFeedUrl('');
    };

    const handleRemoveCustomFeed = (feedId) => {
        setCustomRssFeeds((prev) => prev.filter((feed) => feed.id !== feedId));
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
                designation: snapshot.facebook.designation,
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
                designation: snapshot.tikTok.designation,
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
                designation: snapshot.instagram.designation,
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
                designation: snapshot.youtube.designation,
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
                designation: snapshot.twitter.designation,
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
                designation: snapshot.linkedin.designation,
                url: snapshot.linkedin.resolvedUrl
            });
        }

        if (snapshot.bluesky.enabled || snapshot.bluesky.resolvedUrl) {
            items.push({
                id: 'bluesky',
                platform: 'Bluesky',
                icon: '🦋',
                color: '#60a5fa',
                username: snapshot.bluesky.username,
                designation: snapshot.bluesky.designation,
                url: snapshot.bluesky.resolvedUrl
            });
        }

        if (customRssFeeds.length > 0) {
            customRssFeeds.forEach((feed) => {
                items.push({
                    id: `rss-${feed.id}`,
                    platform: `RSS · ${feed.source}`,
                    icon: '📡',
                    color: '#f97316',
                    username: feed.source,
                    designation: 'custom-rss-feed',
                    url: feed.rssUrl
                });
            });
        }

        if (activePlatform === 'all') return items;
        if (activePlatform === 'rss') {
            return items.filter((item) => String(item.id || '').startsWith('rss-'));
        }
        return items.filter((item) => item.id === activePlatform);
    }, [snapshot, activePlatform, customRssFeeds]);

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
    const connectedPlatforms = getConnectedPlatforms(snapshot);
    const connectablePlatformCount = PLATFORMS.filter((platform) => platform.id !== 'all' && platform.id !== 'reddit' && platform.id !== 'rss').length;
    const previewItemsByPlatform = useMemo(() => {
        const grouped = {};
        for (const item of filteredFeedItems) {
            const key = String(item?.platform || '').toLowerCase().trim();
            if (!key) {
                continue;
            }
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(item);
        }
        return grouped;
    }, [filteredFeedItems]);

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
                        <span>{activeMeta.icon}</span> Multi-Platform Social & Feed Aggregator
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>
                        Synced live for {snapshot.userName} · {feedItems.length} items loaded · Updated {new Date(snapshot.checkedAt).toLocaleTimeString()}
                    </div>
                </div>

                <div
                    style={{
                        marginBottom: '14px',
                        borderRadius: '10px',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        background: 'rgba(56, 189, 248, 0.08)',
                        padding: '10px 12px',
                        display: 'grid',
                        gap: '8px'
                    }}
                >
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>
                        Connected Accounts: {connectedPlatforms.length}/{connectablePlatformCount}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {connectedPlatforms.length > 0 ? connectedPlatforms.map((platform) => (
                            <span
                                key={platform.id}
                                style={{
                                    fontSize: '11px',
                                    borderRadius: '999px',
                                    border: `1px solid ${platform.color}`,
                                    color: platform.color,
                                    padding: '3px 8px',
                                    fontWeight: 600
                                }}
                            >
                                {platform.icon} {platform.label} connected
                            </span>
                        )) : (
                            <span style={{ fontSize: '11px', color: 'var(--light-color)' }}>
                                No connected accounts yet. Use “⚙️ Connect Accounts” to link handles.
                            </span>
                        )}
                    </div>
                    {connectionNotice && (
                        <div style={{ fontSize: '11px', color: '#bae6fd' }}>
                            {connectionNotice}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setShowCustomRssFeeds(!showCustomRssFeeds)}
                        style={{
                            border: '1px solid rgba(249, 115, 22, 0.45)',
                            background: 'rgba(249, 115, 22, 0.1)',
                            color: '#fdba74',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        📡 Custom RSS Feeds ({customRssFeeds.length})
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
                        onClick={() => setShowDeveloperApis(!showDeveloperApis)}
                        style={{
                            border: '1px solid rgba(148, 163, 184, 0.45)',
                            background: 'rgba(148, 163, 184, 0.08)',
                            color: '#cbd5e1',
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

            {showCustomRssFeeds && (
                <form
                    onSubmit={handleAddCustomFeed}
                    style={{
                        display: 'grid',
                        gap: '10px',
                        marginBottom: '16px',
                        padding: '12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        background: 'rgba(249, 115, 22, 0.06)'
                    }}
                >
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>Custom RSS & Atom Feed Subscription Manager</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,1fr) minmax(260px,2fr) auto', gap: '8px' }}>
                        <input
                            type="text"
                            value={customFeedSource}
                            onChange={(event) => setCustomFeedSource(event.target.value)}
                            placeholder="Source name (optional)"
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                        />
                        <input
                            type="url"
                            value={customFeedUrl}
                            onChange={(event) => setCustomFeedUrl(event.target.value)}
                            placeholder="https://example.com/rss.xml or atom.xml"
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                        />
                        <button
                            type="submit"
                            style={{ border: 'none', background: '#f97316', color: '#111827', borderRadius: '6px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Add feed
                        </button>
                    </div>
                    {customFeedError && <div style={{ fontSize: '12px', color: '#fca5a5' }}>{customFeedError}</div>}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {customRssFeeds.length === 0 ? (
                            <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>No custom feeds connected yet.</span>
                        ) : customRssFeeds.map((feed) => (
                            <span
                                key={feed.id}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border-color)', borderRadius: '999px', padding: '4px 10px', fontSize: '12px' }}
                            >
                                {feed.source}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveCustomFeed(feed.id)}
                                    style={{ border: 'none', background: 'transparent', color: '#fca5a5', cursor: 'pointer', padding: 0 }}
                                >
                                    Remove
                                </button>
                            </span>
                        ))}
                    </div>
                </form>
            )}

            {showDeveloperApis && (
                <div
                    style={{
                        marginBottom: '16px',
                        padding: '12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        background: 'rgba(148, 163, 184, 0.07)',
                        display: 'grid',
                        gap: '8px'
                    }}
                >
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>Developer API Connection Status</div>
                    {providerStatusError && (
                        <div style={{ fontSize: '12px', color: '#fca5a5' }}>{providerStatusError}</div>
                    )}
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {providerStatuses.map((provider) => (
                            <div
                                key={provider.platform}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    padding: '8px 10px',
                                    background: 'rgba(0,0,0,0.2)',
                                    fontSize: '12px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                                    <strong style={{ textTransform: 'capitalize' }}>{provider.platform}</strong>
                                    <span style={{ color: provider.readConfigured || provider.publishConfigured ? '#86efac' : '#fca5a5' }}>
                                        {provider.activeMode}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--light-color)' }}>
                                    Read: {provider.readConfigured ? 'configured' : 'not configured'} · Publish: {provider.publishConfigured ? 'configured' : 'not configured'}
                                </div>
                                <div style={{ color: '#cbd5e1', marginTop: '2px' }}>{provider.detail}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                        Just enter your public handle or page name. No API keys are required from users here.
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
                            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>🎵 TikTok Username</span>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            const redirectUri = `${window.location.origin}/oauth/tiktok/callback`;
                                            const res = await socialService.getTikTokAuthUrl(redirectUri);
                                            if (res?.authUrl) {
                                                window.open(res.authUrl, '_blank', 'width=600,height=700');
                                            }
                                        } catch (err) {
                                            alert('Failed to launch TikTok OAuth dialog. Ensure Social:TikTok:ClientKey is set.');
                                        }
                                    }}
                                    style={{
                                        border: 'none',
                                        background: 'rgba(103, 232, 249, 0.2)',
                                        color: '#67e8f9',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                        cursor: 'pointer',
                                        fontWeight: 700
                                    }}
                                >
                                    🔑 Authorize OAuth v2
                                </button>
                            </span>
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
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>🦋 Bluesky Handle</span>
                            <input
                                type="text"
                                value={handles.bluesky}
                                onChange={(e) => setHandles({ ...handles, bluesky: e.target.value })}
                                placeholder="e.g. wiseravenshare.bsky.social"
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
                    🧭 Curator Controls & View Layouts
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
                        {activePlatform === 'rss' ? (
                            <>No custom RSS feeds configured. Use <strong>📡 Custom RSS Feeds</strong> to add one.</>
                        ) : (
                            <>
                                No account configured for {activeMeta.label}. Click{' '}
                                <button
                                    type="button"
                                    onClick={() => setShowHandleConfig(true)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--highlight-color)',
                                        cursor: 'pointer',
                                        padding: 0,
                                        textDecoration: 'underline'
                                    }}
                                >
                                    ⚙️ Connect Accounts
                                </button>
                                {' '}to set your handle/URL.
                            </>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '14px' }}>
                        {timelineItems.map((item) => (
                            <FeedEmbedCard
                                key={`${item.id}-feed-embed`}
                                item={item}
                                compact={compact}
                                previewItems={String(item.id || '').startsWith('rss-') ? (previewItemsByPlatform.rss || []) : (previewItemsByPlatform[item.id] || [])}
                            />
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
                        {activePlatform === 'rss' ? (
                            <>No RSS items returned. Verify your feed URL in <strong>📡 Custom RSS Feeds</strong>.</>
                        ) : (
                            <>
                                No live items returned for {activeMeta.label}. Add page/username in{' '}
                                <button
                                    type="button"
                                    onClick={() => setShowHandleConfig(true)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--highlight-color)',
                                        cursor: 'pointer',
                                        padding: 0,
                                        textDecoration: 'underline'
                                    }}
                                >
                                    ⚙️ Connect Accounts
                                </button>
                                {' '}to populate feed.
                            </>
                        )}
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

        </section>
    );
};

export default SocialFeedsTimeline;
