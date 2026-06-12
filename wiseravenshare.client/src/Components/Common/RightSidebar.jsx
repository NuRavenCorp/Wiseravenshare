import React, { useState, useEffect } from 'react';
import { computeTrendingTopics } from '../../Services/EngagementAlgorithms';
import { useAuth } from '../../Contexts/AuthContext';
import { socialGraphService } from '../../Services/SocialGraph';

const seedUsers = [
    { id: 'seed-techguru', name: 'TechGuru', handle: '@techguru', avatar: 'TG' },
    { id: 'seed-truthseeker', name: 'TruthSeeker', handle: '@truthseeker', avatar: 'TS' },
    { id: 'seed-aiexpert', name: 'AIExpert', handle: '@aiexpert', avatar: 'AE' },
    { id: 'seed-dataweekly', name: 'DataWeekly', handle: '@dataweekly', avatar: 'DW' },
    { id: 'seed-ravensignal', name: 'RavenSignal', handle: '@ravensignal', avatar: 'RS' }
];

const readPosts = () => {
    const feedPosts = JSON.parse(localStorage.getItem('wiseRecentPosts') || '[]');
    const discoverPosts = JSON.parse(localStorage.getItem('wiseDiscoverPosts') || '[]');
    return [...feedPosts, ...discoverPosts];
};

const formatFollowers = (count) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return `${count}`;
};

const RightSidebar = ({ onNavigate }) => {
    const [trendingTopics, setTrendingTopics] = useState([]);
    const [suggestedUsers, setSuggestedUsers] = useState([]);
    const [followingIds, setFollowingIds] = useState([]);
    const { user } = useAuth();

    const [stockData, setStockData] = useState([
        { symbol: 'WRAV', name: 'Wise Raven', price: 145.23, change: 1.2 },
        { symbol: 'DSEEK', name: 'DeepSeek AI', price: 234.56, change: -0.8 },
        { symbol: 'TECH', name: 'Tech Giants', price: 189.75, change: 2.5 }
    ]);

    useEffect(() => {
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
                    const rankScore = (counts.followers * 2) + (mutualCount * 8) + (hasRecentPost ? 5 : 0);

                    return {
                        ...candidate,
                        followers: formatFollowers(counts.followers),
                        mutualCount,
                        rankScore
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
                const mergedPosts = [...feedPosts, ...discoverPosts];
                setTrendingTopics(computeTrendingTopics(mergedPosts, 6));
            } catch (error) {
                setTrendingTopics(computeTrendingTopics([], 6));
            }
        };

        refreshTrending();
        refreshSuggestions();

        const listener = () => {
            refreshTrending();
            refreshSuggestions();
        };
        window.addEventListener('wiseraven:posts-updated', listener);
        window.addEventListener('wiseraven:social-updated', listener);

        // Simulate real-time stock updates
        const interval = setInterval(() => {
            setStockData(prev => prev.map(stock => ({
                ...stock,
                price: Math.max(0, stock.price + (Math.random() - 0.5) * 2),
                change: parseFloat((stock.change + (Math.random() - 0.5) * 0.3).toFixed(2))
            })));
        }, 30000);

        return () => {
            clearInterval(interval);
            window.removeEventListener('wiseraven:posts-updated', listener);
            window.removeEventListener('wiseraven:social-updated', listener);
        };
    }, [user?.id]);

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
                            <div>${stock.price.toFixed(2)}</div>
                            <div style={{ color: stock.change >= 0 ? '#4caf50' : '#f44336', fontSize: '12px' }}>
                                ({stock.change >= 0 ? '+' : ''}{stock.change}%)
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