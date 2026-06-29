import React, { useState, useEffect } from 'react';
import { computeTrendingTopics, computeWhoToFollowRecommendations } from '../../Services/EngagementAlgorithms';
import { useAuth } from '../../Contexts/AuthContext';
import { socialGraphService } from '../../Services/SocialGraph';

const MAX_POSTS_FOR_SIDEBAR = 200;

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

const RightSidebar = ({ onNavigate }) => {
    const [trendingTopics, setTrendingTopics] = useState([]);
    const [suggestedUsers, setSuggestedUsers] = useState([]);
    const [followingIds, setFollowingIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const { user } = useAuth();

    const marketSymbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];
    const [stockData, setStockData] = useState([
        { symbol: 'AAPL', name: 'Apple', price: 0, changePercent: 0 },
        { symbol: 'MSFT', name: 'Microsoft', price: 0, changePercent: 0 },
        { symbol: 'NVDA', name: 'NVIDIA', price: 0, changePercent: 0 },
        { symbol: 'TSLA', name: 'Tesla', price: 0, changePercent: 0 }
    ]);
    const [marketError, setMarketError] = useState('');

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

            const candidates = computeWhoToFollowRecommendations({
                currentUserId: user.id,
                candidateProfiles: socialGraphService.getProfiles([...candidateIds]),
                posts,
                followingIds: following,
                getCounts: (id) => socialGraphService.getCounts(id),
                getFollowerIds: (id) => socialGraphService.getFollowerIds(id),
                getFollowingIds: (id) => socialGraphService.getFollowingIds(id),
                limit: 4
            }).map((candidate) => ({
                ...candidate,
                followers: formatFollowers(candidate.followersCount || 0)
            }));

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
            } catch (error) {
                setTrendingTopics(computeTrendingTopics([], 6));
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

        const refreshMarketData = async () => {
            try {
                const response = await fetch(`/api/market/quotes?symbols=${marketSymbols.join(',')}`);
                if (!response.ok) {
                    throw new Error('Unable to load market data.');
                }

                const payload = await response.json();
                const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
                if (quotes.length > 0) {
                    setStockData(quotes);
                    setMarketError('');
                }
            } catch {
                setMarketError('Live market feed unavailable.');
            }
        };

        refreshMarketData();
        const interval = setInterval(refreshMarketData, 15000);

        return () => {
            clearInterval(interval);
            if (refreshTimer) {
                clearTimeout(refreshTimer);
            }
            window.removeEventListener('wiseraven:posts-updated', listener);
            window.removeEventListener('wiseraven:social-updated', listener);
        };
    }, [user?.id]);

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
        const normalized = String(topicLabel || '').toLowerCase();
        if (normalized.includes('breakingnews') || normalized.includes('breaking')) {
            onNavigate?.('breakingnews');
        }
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    fontSize: '12px'
                                }}>
                                    {result.avatar}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{result.name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>{result.handle}</div>
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
                <h3 style={{ marginBottom: '15px', color: 'var(--light-color)' }}>
                    <i className="fas fa-chart-line"></i> Trending Now
                </h3>
                {trendingTopics.map(topic => (
                    <div
                        key={topic.topic}
                        onClick={() => handleTrendingClick(topic.topic)}
                        style={{
                            padding: '12px 0',
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
                <h3 style={{ marginBottom: '15px', color: 'var(--light-color)' }}>
                    <i className="fas fa-chart-line"></i> Market Watch
                </h3>
                {marketError && (
                    <div style={{ fontSize: '11px', color: '#f44336', marginBottom: '8px' }}>{marketError}</div>
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
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div>${Number(stock.price || 0).toFixed(2)}</div>
                            <div style={{ color: Number(stock.changePercent || 0) >= 0 ? '#4caf50' : '#f44336', fontSize: '12px' }}>
                                ({Number(stock.changePercent || 0) >= 0 ? '+' : ''}{Number(stock.changePercent || 0).toFixed(2)}%)
                            </div>
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
                <h3 style={{ marginBottom: '15px', color: 'var(--light-color)' }}>
                    <i className="fas fa-user-plus"></i> Who to Follow
                </h3>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold'
                            }}>{user.avatar}</div>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{user.name}</div>
                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>{user.handle}</div>
                                <div style={{ fontSize: '11px', color: 'var(--light-color)' }}>
                                    {user.followers} followers
                                    {user.mutualCount > 0 ? ` • ${user.mutualCount} mutual` : ''}
                                    {user.reason ? ` • ${user.reason}` : ''}
                                </div>
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