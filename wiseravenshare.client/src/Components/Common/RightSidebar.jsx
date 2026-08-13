import React, { useState, useEffect } from 'react';
import { computeTrendingTopics } from '../../Services/EngagementAlgorithms';
import { apiService } from '../../Services/api';
import { useAuth } from '../../Contexts/AuthContext';
import { socialGraphService } from '../../Services/SocialGraph';

const MAX_POSTS_FOR_SIDEBAR = 200;
const MARKET_SYMBOLS = ['MSFT', 'IBM'];
const FALLBACK_QUOTES = {
    MSFT: { name: 'Microsoft', price: 487.65, changePercent: 4.93, volume: 66663409, currency: 'USD', marketState: 'Fallback Snapshot' },
    IBM: { name: 'IBM', price: 226.13, changePercent: 0.65, volume: 4288300, currency: 'USD', marketState: 'Fallback Snapshot' },
    AAPL: { name: 'Apple', price: 219.44, changePercent: -0.33, volume: 51200438, currency: 'USD', marketState: 'Fallback Snapshot' },
    NVDA: { name: 'NVIDIA', price: 126.19, changePercent: 1.63, volume: 453991124, currency: 'USD', marketState: 'Fallback Snapshot' },
    TSLA: { name: 'Tesla', price: 251.8, changePercent: -1.23, volume: 97212581, currency: 'USD', marketState: 'Fallback Snapshot' }
};

const seedUsers = [
    { id: 'seed-wiseravenshare', name: 'WiseravenShare Community', handle: '@wiseravenshare', avatar: 'WS' },
    { id: 'seed-techguru', name: 'TechGuru', handle: '@techguru', avatar: 'TG' },
    { id: 'seed-truthseeker', name: 'TruthSeeker', handle: '@truthseeker', avatar: 'TS' },
    { id: 'seed-aiexpert', name: 'AIExpert', handle: '@aiexpert', avatar: 'AE' },
    { id: 'seed-dataweekly', name: 'DataWeekly', handle: '@dataweekly', avatar: 'DW' },
    { id: 'seed-ravensignal', name: 'RavenSignal', handle: '@ravensignal', avatar: 'RS' }
];

const readPosts = () => {
    const feedPosts = JSON.parse(localStorage.getItem('wiseRecentPosts') || '[]');
    const discoverPosts = JSON.parse(localStorage.getItem('wiseDiscoverPosts') || '[]');
    return [...feedPosts, ...discoverPosts].slice(0, MAX_POSTS_FOR_SIDEBAR);
};

const looksLikeCorruptBlob = (value) => {
    const text = String(value || '').replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 24) {
        return false;
    }

    const hasLongEncodedRun = /(?:[A-Za-z0-9+/=]{24,})/.test(text);
    const hasFewWords = text.split(/\s+/).filter(Boolean).length <= 2 && text.length > 60;
    const hasTooManySymbols = (text.match(/[^A-Za-z0-9\s.,!?@#%\-'\/]/g) || []).length > text.length * 0.22;

    return hasLongEncodedRun || hasFewWords || hasTooManySymbols;
};

const sanitizeSidebarPreview = (value, fallback = 'Trending post update', maxLength = 92) => {
    const text = String(value || '').replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || looksLikeCorruptBlob(text)) {
        return fallback;
    }

    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
};

const buildTrendingPostAnnouncements = (posts = [], limit = 4) => {
    if (!Array.isArray(posts) || posts.length === 0) {
        return [];
    }

    return posts
        .filter((post) => post && typeof post === 'object')
        .map((post) => {
            const likes = Number(post.likes) || 0;
            const reposts = Number(post.reposts) || 0;
            const comments = Array.isArray(post.comments) ? post.comments.length : (Number(post.comments) || 0);
            const momentum = (likes * 1.6) + (reposts * 2.4) + (comments * 1.2);
            const userName = String(post?.user?.name || 'Community voice').trim();
            const preview = sanitizeSidebarPreview(post.content, 'Trending post update', 92);

            return {
                id: String(post.id || `${post.userId || 'post'}-${Math.random().toString(36).slice(2)}`),
                userName: userName || 'Community voice',
                preview,
                momentum
            };
        })
        .sort((left, right) => right.momentum - left.momentum)
        .slice(0, limit);
};

const formatFollowers = (count) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return `${count}`;
};

const normalizeSearchValue = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');

const normalizeTopicValue = (value) => normalizeSearchValue(value).replace(/^[#%]+/, '');

const collapseForNameMatch = (value) => normalizeSearchValue(value).replace(/[^a-z0-9]/g, '');

const profileSearchScore = (profile, query) => {
    const cleanQuery = normalizeSearchValue(query);
    if (!cleanQuery) return 0;
    const collapsedQuery = collapseForNameMatch(query);

    const name = normalizeSearchValue(profile?.name);
    const handle = normalizeSearchValue(profile?.handle);
    const id = normalizeSearchValue(profile?.id);
    const collapsedName = collapseForNameMatch(profile?.name);
    const collapsedHandle = collapseForNameMatch(profile?.handle);
    const collapsedId = collapseForNameMatch(profile?.id);

    if (name.startsWith(cleanQuery) || handle.startsWith(cleanQuery)) return 3;
    if (name.includes(cleanQuery) || handle.includes(cleanQuery)) return 2;

    if (collapsedQuery) {
        if (collapsedName.startsWith(collapsedQuery) || collapsedHandle.startsWith(collapsedQuery)) return 3;
        if (collapsedName.includes(collapsedQuery) || collapsedHandle.includes(collapsedQuery)) return 2;
        if (collapsedId.includes(collapsedQuery)) return 1;
    }

    if (id.includes(cleanQuery)) return 1;
    return 0;
};

const readStoredProfiles = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem('wiseUserProfiles') || '{}');
        if (!parsed || typeof parsed !== 'object') {
            return [];
        }
        return Object.values(parsed).filter(Boolean);
    } catch {
        return [];
    }
};

const parseAdminEmails = () => {
    const fromEnv = String(import.meta.env.VITE_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return new Set(['admin@wise-ravens.com', ...fromEnv]);
};

const asPercent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

const formatCurrency = (value, currency = 'USD') => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return '--';
    }

    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD',
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        return `$${amount.toFixed(2)}`;
    }
};

const formatVolume = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }

    if (numeric >= 1000000000) return `${(numeric / 1000000000).toFixed(1)}B`;
    if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
    if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}K`;
    return `${Math.round(numeric)}`;
};

const normalizeMarketState = (value) => String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeMarketQuote = (quote = {}) => ({
    symbol: String(quote.symbol || '').trim(),
    name: String(quote.name || quote.symbol || 'Market quote').trim(),
    price: Number(quote.price),
    changePercent: Number(quote.changePercent),
    volume: Number(quote.volume),
    currency: String(quote.currency || 'USD').trim() || 'USD',
    marketState: normalizeMarketState(quote.marketState),
    asOf: quote.asOf || null
});

const extractMarketQuotes = (response) => {
    const body = response?.data;
    if (Array.isArray(body?.quotes)) {
        return body.quotes;
    }

    // Backward compatibility with older market endpoint payload shape.
    if (Array.isArray(body?.data)) {
        return body.data;
    }

    return [];
};

const buildFallbackQuotes = (symbols = MARKET_SYMBOLS) => symbols
    .map((symbol) => {
        const key = String(symbol || '').toUpperCase().trim();
        const sample = FALLBACK_QUOTES[key] || {
            name: key || 'Market quote',
            price: 100,
            changePercent: 0,
            volume: 0,
            currency: 'USD',
            marketState: 'Fallback Snapshot'
        };

        return normalizeMarketQuote({
            symbol: key,
            name: sample.name,
            price: sample.price,
            changePercent: sample.changePercent,
            volume: sample.volume,
            currency: sample.currency,
            marketState: sample.marketState
        });
    })
    .filter((quote) => quote.symbol && Number.isFinite(quote.price));

const isImageAvatar = (value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim();
    return normalized.startsWith('data:image/') || /^https?:\/\//i.test(normalized);
};

const avatarFallback = (profile) => {
    const base = String(profile?.name || profile?.handle || profile?.avatar || 'U').trim();
    if (!base) return 'U';

    const tokens = base
        .replace(/^@+/, '')
        .split(/\s+/)
        .filter(Boolean);

    if (tokens.length >= 2) {
        return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
    }

    return tokens[0].slice(0, 2).toUpperCase();
};

const AvatarBadge = ({ profile, size = 40, fontSize = 12 }) => {
    const avatar = String(profile?.avatar || '').trim();
    const canRenderImage = isImageAvatar(avatar);

    return (
        <div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: `${fontSize}px`,
            overflow: 'hidden',
            flexShrink: 0
        }}>
            {canRenderImage ? (
                <img
                    src={avatar}
                    alt={String(profile?.name || 'User avatar')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
            ) : (
                avatarFallback(profile)
            )}
        </div>
    );
};

const RightSidebar = ({ onNavigate }) => {
    const [trendingTopics, setTrendingTopics] = useState([]);
    const [trendingPostAnnouncements, setTrendingPostAnnouncements] = useState([]);
    const [suggestedUsers, setSuggestedUsers] = useState([]);
    const [followingIds, setFollowingIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showFollowDebug, setShowFollowDebug] = useState(false);
    const [stockData, setStockData] = useState([]);
    const [marketLoading, setMarketLoading] = useState(true);
    const [marketError, setMarketError] = useState('');
    const { user } = useAuth();
    const isAdminUser = parseAdminEmails().has(String(user?.email || '').trim().toLowerCase());

    useEffect(() => {
        let refreshTimer;

        const refreshSuggestions = () => {
            if (!user?.id) {
                setSuggestedUsers(seedUsers.slice(0, 3).map((seed, index) => ({
                    ...seed,
                    followers: `${(12 - (index * 2)).toFixed(1)}K`,
                    mutualCount: 0
                })));
                return;
            }

            socialGraphService.registerUserProfile(user);
            seedUsers.forEach((seed) => socialGraphService.registerUserProfile(seed));

            const posts = readPosts();
            posts.forEach((post) => {
                if (!post?.userId) return;
                socialGraphService.registerUserProfile({
                    id: post.userId,
                    name: post.user?.name,
                    handle: post.user?.handle,
                    avatar: post.user?.avatar
                });
            });

            const following = socialGraphService.getFollowingIds(user.id);
            setFollowingIds(following);

            const candidateIds = new Set(seedUsers.map((seed) => seed.id));
            posts.forEach((post) => {
                if (post?.userId) {
                    candidateIds.add(post.userId);
                }
            });

            const candidates = socialGraphService
                .getProfiles([...candidateIds])
                .filter((candidate) => candidate?.id && candidate.id !== user.id && !following.includes(candidate.id))
                .map((candidate) => {
                    const counts = socialGraphService.getCounts(candidate.id);
                    const candidateFollowerIds = socialGraphService.getFollowerIds(candidate.id);
                    const mutualCount = candidateFollowerIds.filter((id) => following.includes(id)).length;
                    const hasRecentPost = posts.some((post) => post.userId === candidate.id);
                    const followMetrics = socialGraphService.getFollowBehaviorMetrics(user.id, candidate.id, posts);
                    const rankScore = followMetrics.followScore;

                    return {
                        ...candidate,
                        followers: formatFollowers(counts.followers),
                        mutualCount,
                        rankScore,
                        followScore: followMetrics.followScore,
                        followMetrics,
                        hasRecentPost
                    };
                })
                .sort((a, b) => b.rankScore - a.rankScore)
                .slice(0, 4);

            if (candidates.length === 0) {
                const fallback = seedUsers
                    .filter((seed) => seed.id !== user.id && !following.includes(seed.id))
                    .slice(0, 3)
                    .map((seed, index) => ({
                        ...seed,
                        followers: `${(10 - (index * 1.6)).toFixed(1)}K`,
                        mutualCount: 0
                    }));
                setSuggestedUsers(fallback);
                return;
            }

            setSuggestedUsers(candidates);
        };

        const refreshTrending = () => {
            try {
                const feedPosts = JSON.parse(localStorage.getItem('wiseRecentPosts') || '[]');
                const discoverPosts = JSON.parse(localStorage.getItem('wiseDiscoverPosts') || '[]');
                const mergedPosts = [...feedPosts, ...discoverPosts].slice(0, MAX_POSTS_FOR_SIDEBAR);
                setTrendingTopics(computeTrendingTopics(mergedPosts, 6));
                setTrendingPostAnnouncements(buildTrendingPostAnnouncements(mergedPosts, 4));
            } catch (error) {
                setTrendingTopics(computeTrendingTopics([], 6));
                setTrendingPostAnnouncements([]);
            }
        };

        refreshTrending();
        refreshSuggestions();

        const listener = () => {
            if (refreshTimer) {
                clearTimeout(refreshTimer);
            }
            refreshTimer = setTimeout(() => {
                refreshTrending();
                refreshSuggestions();
            }, 120);
        };
        window.addEventListener('wiseraven:posts-updated', listener);
        window.addEventListener('wiseraven:social-updated', listener);

        return () => {
            if (refreshTimer) {
                clearTimeout(refreshTimer);
            }
            window.removeEventListener('wiseraven:posts-updated', listener);
            window.removeEventListener('wiseraven:social-updated', listener);
        };
    }, [user?.id]);

    useEffect(() => {
        let isMounted = true;

        const refreshMarketData = async ({ silent = false } = {}) => {
            if (!silent && isMounted) {
                setMarketLoading(true);
            }

            try {
                const response = await apiService.getMarketQuotes(MARKET_SYMBOLS);
                const quotes = extractMarketQuotes(response);
                const normalizedQuotes = quotes
                    .map(normalizeMarketQuote)
                    .filter((quote) => quote.symbol && Number.isFinite(quote.price));

                if (!isMounted) {
                    return;
                }

                const safeQuotes = normalizedQuotes.length > 0 ? normalizedQuotes : buildFallbackQuotes(MARKET_SYMBOLS);
                setStockData(safeQuotes);
                setMarketError(normalizedQuotes.length === 0 ? 'Showing snapshot quotes while live market data reconnects.' : '');
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setStockData(buildFallbackQuotes(MARKET_SYMBOLS));
                setMarketError('Showing snapshot quotes while live market data reconnects.');
            } finally {
                if (isMounted) {
                    setMarketLoading(false);
                }
            }
        };

        refreshMarketData();
        const interval = setInterval(() => {
            refreshMarketData({ silent: true });
        }, 60000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        const query = normalizeSearchValue(searchQuery);
        if (!query) {
            setSearchResults([]);
            return;
        }

        const postProfiles = readPosts()
            .map((post) => ({
                id: post?.user?.id || post?.userId,
                name: post?.user?.name,
                handle: post?.user?.handle,
                avatar: post?.user?.avatar
            }))
            .filter((profile) => profile?.id);

        const combined = [...seedUsers, ...readStoredProfiles(), ...postProfiles];
        const deduped = combined.reduce((acc, profile) => {
            if (!profile?.id || acc.some((item) => item.id === profile.id)) {
                return acc;
            }

            const normalizedProfile = {
                id: profile.id,
                name: profile.name || 'User',
                handle: profile.handle || profile.username || `@${profile.id}`,
                avatar: profile.avatar || (String(profile.name || 'U').charAt(0).toUpperCase())
            };

            socialGraphService.registerUserProfile(normalizedProfile);
            acc.push(normalizedProfile);
            return acc;
        }, []);

        const ranked = deduped
            .filter((profile) => profile.id !== user?.id)
            .map((profile) => {
                const score = profileSearchScore(profile, query);
                const counts = socialGraphService.getCounts(profile.id);
                return {
                    ...profile,
                    score,
                    followers: formatFollowers(counts.followers),
                    followersCount: counts.followers,
                    isFollowing: followingIds.includes(profile.id)
                };
            })
            .filter((profile) => profile.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.followersCount !== a.followersCount) return b.followersCount - a.followersCount;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 8);

        setSearchResults(ranked);
    }, [searchQuery, followingIds, user?.id]);

    const toggleFollow = (targetUserId) => {
        if (!user?.id || !targetUserId || targetUserId === user.id) {
            return;
        }

        if (socialGraphService.isFollowing(user.id, targetUserId)) {
            socialGraphService.unfollowUser(user.id, targetUserId);
        } else {
            socialGraphService.followUser(user.id, targetUserId);
        }

        window.dispatchEvent(new Event('wiseraven:social-updated'));
    };

    const handleTrendingClick = (topicLabel) => {
        const normalized = normalizeTopicValue(topicLabel);
        if (!normalized) {
            return;
        }

        try {
            localStorage.setItem('wiseDiscoverFocus', JSON.stringify({
                section: 'topics',
                topic: normalized,
                source: 'sidebar-trending',
                updatedAt: Date.now()
            }));
        } catch {
            // Ignore storage failures and still navigate when possible.
        }

        if (normalized.includes('breakingnews') || normalized.includes('breaking')) {
            onNavigate?.('breakingnews');
            return;
        }

        onNavigate?.('discover');
    };

    return (
        <aside className="right-column">
            {/* Search Box */}
            <div style={{
                display: 'flex',
                background: 'var(--card-bg)',
                borderRadius: '20px',
                padding: '8px 15px',
                marginBottom: '20px',
                border: '1px solid var(--border-color)'
            }}>
                <input
                    type="text"
                    placeholder="Search Wise-Raven..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        color: 'var(--text-color)'
                    }}
                />
                <button style={{ background: 'transparent', border: 'none', color: 'var(--highlight-color)' }}>
                    <i className="fas fa-search"></i>
                </button>
            </div>

            {searchQuery.trim().length > 0 && (
                <div style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    padding: '12px',
                    marginBottom: '20px',
                    border: '1px solid var(--border-color)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '8px' }}>
                        {searchResults.length > 0
                            ? `${searchResults.length} people found`
                            : 'No people found'}
                    </div>
                    {searchResults.map((result) => (
                        <div
                            key={`search-${result.id}`}
                            style={{
                                padding: '10px 0',
                                borderBottom: '1px solid var(--border-color)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '12px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                <AvatarBadge profile={result} size={34} fontSize={12} />
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '13px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{result.name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{result.handle}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--light-color)' }}>{result.followers} followers</div>
                                </div>
                            </div>
                            <button
                                onClick={() => toggleFollow(result.id)}
                                style={{
                                    background: result.isFollowing
                                        ? 'transparent'
                                        : 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                    color: 'var(--text-color)',
                                    border: `1px solid ${result.isFollowing ? 'var(--highlight-color)' : 'transparent'}`,
                                    padding: '5px 10px',
                                    borderRadius: '999px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {result.isFollowing ? 'Following' : 'Follow'}
                            </button>
                        </div>
                    ))}
                    {searchResults.length === 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--light-color)', padding: '6px 0 2px' }}>
                            Try a name or handle like "wiseravenshare" or "@wiseravenshare".
                        </div>
                    )}
                </div>
            )}

            {/* Trending Section */}
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                border: '1px solid var(--border-color)'
            }}>
                <h3 style={{ marginBottom: '12px', color: 'var(--light-color)' }}>
                    <i className="fas fa-bullhorn"></i> Trending Announcements
                </h3>
                <div style={{ fontSize: '11px', color: 'var(--highlight-color)', marginBottom: '12px' }}>
                    Live callouts for trending posts and topics.
                </div>

                {trendingPostAnnouncements.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                        {trendingPostAnnouncements.map((item) => (
                            <div
                                key={item.id}
                                style={{
                                    padding: '10px 0',
                                    borderBottom: '1px solid var(--border-color)'
                                }}
                            >
                                <div style={{ fontSize: '11px', color: 'var(--highlight-color)', marginBottom: '4px' }}>
                                    Post surge • {item.userName}
                                </div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        lineHeight: 1.45,
                                        overflowWrap: 'anywhere',
                                        wordBreak: 'break-word',
                                        whiteSpace: 'normal'
                                    }}
                                >
                                    {item.preview}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ fontSize: '11px', color: 'var(--highlight-color)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Topic Signals
                </div>
                {trendingTopics.map(topic => (
                    <div
                        key={topic.topic}
                        onClick={() => handleTrendingClick(topic.topic)}
                        style={{
                            padding: '10px 0',
                            borderBottom: '1px solid var(--border-color)',
                            cursor: 'pointer',
                            transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.paddingLeft = '10px'}
                        onMouseLeave={(e) => e.currentTarget.style.paddingLeft = '0'}
                    >
                        <div style={{ fontWeight: 'bold' }}>{topic.topic}</div>
                        <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>{topic.posts} posts</div>
                    </div>
                ))}
            </div>

            {/* Stock Market Widget */}
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ marginBottom: 0, color: 'var(--light-color)' }}>
                        <i className="fas fa-chart-line"></i> Market Watch
                    </h3>
                    <span style={{ fontSize: '11px', color: 'var(--highlight-color)' }}>Live quotes</span>
                </div>
                {marketLoading && stockData.length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>Loading live market data...</div>
                )}
                {!marketLoading && marketError && stockData.length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', lineHeight: 1.5 }}>{marketError}</div>
                )}
                {stockData.map(stock => (
                    <div
                        key={stock.symbol}
                        style={{
                            padding: '12px 0',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 'bold' }}>{stock.symbol}</div>
                            <div style={{ fontSize: '11px', opacity: 0.7 }}>{stock.name}</div>
                            {stock.marketState && (
                                <div style={{ fontSize: '10px', color: 'var(--light-color)', marginTop: '4px' }}>{stock.marketState}</div>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div>{formatCurrency(stock.price, stock.currency)}</div>
                            <div style={{ color: stock.changePercent >= 0 ? '#4caf50' : '#f44336', fontSize: '12px' }}>
                                {Number.isFinite(stock.changePercent)
                                    ? `(${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%)`
                                    : '(--%)'}
                            </div>
                            {formatVolume(stock.volume) && (
                                <div style={{ fontSize: '10px', color: 'var(--light-color)', marginTop: '4px' }}>
                                    Vol {formatVolume(stock.volume)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Who to Follow */}
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <h3 style={{ marginBottom: 0, color: 'var(--light-color)' }}>
                        <i className="fas fa-user-plus"></i> Who to Follow
                    </h3>
                    {isAdminUser && (
                        <button
                            onClick={() => setShowFollowDebug((prev) => !prev)}
                            style={{
                                border: '1px solid var(--border-color)',
                                background: showFollowDebug ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: 'var(--text-color)',
                                borderRadius: '999px',
                                padding: '5px 10px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            {showFollowDebug ? 'Hide Debug' : 'Show Debug'}
                        </button>
                    )}
                </div>
                {suggestedUsers.map(user => (
                    <div
                        key={user.id}
                        style={{
                            padding: '12px 0',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <AvatarBadge profile={user} size={40} fontSize={13} />
                            <div>
                                <div style={{ fontWeight: 'bold', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{user.name}</div>
                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{user.handle}</div>
                                <div style={{ fontSize: '11px', color: 'var(--light-color)' }}>
                                    {user.followers} followers
                                    {user.mutualCount > 0 ? ` • ${user.mutualCount} mutual` : ''}
                                </div>
                                {Number.isFinite(user.followScore) && (
                                    <div style={{ fontSize: '11px', color: 'var(--highlight-color)' }}>
                                        Follow score {user.followScore}
                                        {user.followMetrics?.isReciprocal ? ' • follows you' : ''}
                                        {user.hasRecentPost ? ' • active now' : ''}
                                    </div>
                                )}
                                {isAdminUser && showFollowDebug && user.followMetrics && (
                                    <div
                                        style={{
                                            marginTop: '6px',
                                            padding: '6px 8px',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            background: 'rgba(255,255,255,0.03)',
                                            fontSize: '10px',
                                            color: 'var(--light-color)',
                                            display: 'grid',
                                            gap: '2px'
                                        }}
                                    >
                                        <div>Mutual: {asPercent(user.followMetrics.components?.mutualScore)}</div>
                                        <div>Reciprocity: {asPercent(user.followMetrics.components?.reciprocityScore)}</div>
                                        <div>Social proof: {asPercent(user.followMetrics.components?.socialProofScore)}</div>
                                        <div>Activity: {asPercent(user.followMetrics.components?.activityScore)}</div>
                                        <div>Engagement: {asPercent(user.followMetrics.components?.engagementScore)}</div>
                                        <div>Retention: {asPercent(user.followMetrics.components?.retentionScore)}</div>
                                        <div>Affinity: {asPercent(user.followMetrics.components?.affinityScore)}</div>
                                        <div>
                                            Counts: {user.followMetrics.counts?.mutualCount || 0} mutual, {user.followMetrics.counts?.recentPostCount || 0} recent posts
                                        </div>
                                        <div>
                                            History: {user.followMetrics.counts?.followEvents || 0} follow / {user.followMetrics.counts?.unfollowEvents || 0} unfollow
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => toggleFollow(user.id)}
                            style={{
                                background: followingIds.includes(user.id)
                                    ? 'transparent'
                                    : 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                color: 'var(--text-color)',
                                border: `1px solid ${followingIds.includes(user.id) ? 'var(--highlight-color)' : 'transparent'}`,
                                padding: '6px 12px',
                                borderRadius: '15px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 700,
                                minWidth: '92px'
                            }}
                        >
                            {followingIds.includes(user.id) ? 'Following' : 'Follow'}
                        </button>
                    </div>
                ))}
            </div>
        </aside>
    );
};

export default RightSidebar;