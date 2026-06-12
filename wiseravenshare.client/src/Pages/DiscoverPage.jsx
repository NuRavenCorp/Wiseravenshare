import React, { useState, useEffect, useMemo } from 'react';
import PostCard from '../Components/Feed/PostCard.jsx';
import { apiService } from '../Services/api';
import { useAuth } from '../Contexts/AuthContext';
import { socialGraphService } from '../Services/SocialGraph';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';

const fallbackPosts = [
    {
        id: '2001',
        userId: 'user-trend-1',
        user: { name: 'Trend Analyst', handle: '@trendwise' },
        content: 'Discover is now live. Trending topics update throughout the day.',
        likes: 12,
        reposts: 4,
        comments: []
    },
    {
        id: '2002',
        userId: 'user-trend-2',
        user: { name: 'Daily Brief', handle: '@dailybrief' },
        content: 'Use Discover to find latest and popular posts across Wise-Raven.',
        likes: 9,
        reposts: 2,
        comments: []
    }
];

const fallbackTopics = [
    { name: 'WiseRaven', count: 12400 },
    { name: 'TruthDetection', count: 8200 },
    { name: 'Productivity', count: 3900 }
];

const fallbackNewsItems = [
    {
        id: 'discover-news-1',
        title: 'AI copilots move from prototypes into daily operations',
        source: 'RavenWire',
        summary: 'Teams are shifting copilots into planning, support, and reporting workflows.'
    },
    {
        id: 'discover-news-2',
        title: 'Model governance checklists become standard across enterprise rollouts',
        source: 'Policy Today',
        summary: 'Organizations are requiring policy and risk checks before model launches.'
    },
    {
        id: 'discover-news-3',
        title: 'Multimodal assistants improve issue triage speed',
        source: 'Signal Labs',
        summary: 'Support teams are reporting faster ticket routing with text-image tooling.'
    }
];

const DiscoverPage = () => {
    const [posts, setPosts] = useState([]);
    const [topics, setTopics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('trending');
    const [followingIds, setFollowingIds] = useState([]);
    const [discoverTypeIndex, setDiscoverTypeIndex] = useState(0);
    const { user } = useAuth();

    useEffect(() => {
        loadDiscoverContent();
    }, [activeTab]);

    useEffect(() => {
        if (!user?.id) return;
        socialGraphService.registerUserProfile(user);
        setFollowingIds(socialGraphService.getFollowingIds(user.id));
    }, [user?.id]);

    const loadDiscoverContent = async () => {
        setLoading(true);
        try {
            const [postResponse, topicResponse] = await Promise.all([
                apiService.getPosts({ sort: activeTab, limit: 20 }),
                apiService.getTrending()
            ]);

            const nextPosts = postResponse.data || [];
            setPosts(nextPosts);
            localStorage.setItem('wiseDiscoverPosts', JSON.stringify(nextPosts));
            window.dispatchEvent(new Event('wiseraven:posts-updated'));
            setTopics(topicResponse.data || []);
        } catch (error) {
            setPosts(fallbackPosts);
            localStorage.setItem('wiseDiscoverPosts', JSON.stringify(fallbackPosts));
            window.dispatchEvent(new Event('wiseraven:posts-updated'));
            setTopics(fallbackTopics);
        } finally {
            setLoading(false);
        }
    };

    const handleFollowToggle = (targetUserId, targetUser) => {
        if (!user?.id || !targetUserId || targetUserId === user.id) {
            return;
        }

        socialGraphService.registerUserProfile({
            id: targetUserId,
            name: targetUser?.name || 'User',
            handle: targetUser?.handle || 'user',
            avatar: targetUser?.avatar
        });

        if (socialGraphService.isFollowing(user.id, targetUserId)) {
            socialGraphService.unfollowUser(user.id, targetUserId);
        } else {
            socialGraphService.followUser(user.id, targetUserId);
        }

        setFollowingIds(socialGraphService.getFollowingIds(user.id));
    };

    const tabs = [
        { id: 'trending', label: 'Trending' },
        { id: 'latest', label: 'Latest' },
        { id: 'popular', label: 'Popular' }
    ];

    const discoverBuckets = useMemo(() => {
        const peopleMap = new Map();
        posts.forEach((post) => {
            if (!post?.userId || !post?.user) return;
            if (peopleMap.has(post.userId)) return;

            const counts = socialGraphService.getCounts(post.userId);
            peopleMap.set(post.userId, {
                id: post.userId,
                name: post.user.name || 'User',
                handle: post.user.handle || 'user',
                avatar: post.user.avatar || (post.user.name?.[0] || 'U').toUpperCase(),
                followers: counts.followers,
                following: counts.following,
                isFollowing: followingIds.includes(post.userId)
            });
        });

        let storedNews = [];
        try {
            const selectedArticle = JSON.parse(localStorage.getItem('wiseSelectedArticle') || 'null');
            const discoverNews = JSON.parse(localStorage.getItem('wiseDiscoverNews') || '[]');
            storedNews = [selectedArticle, ...(Array.isArray(discoverNews) ? discoverNews : [])].filter(Boolean);
        } catch {
            storedNews = [];
        }

        const normalizedNews = storedNews
            .map((item, index) => ({
                id: item.id || `stored-news-${index}`,
                title: item.title || 'AI News update',
                source: item.source || 'WiseRaven',
                summary: item.summary || item.content || 'News summary unavailable.',
                externalUrl: item.externalUrl || item.url || null
            }))
            .slice(0, 8);

        return {
            people: Array.from(peopleMap.values()).slice(0, 8),
            posts: posts.slice(0, 8),
            trends: topics.slice(0, 8),
            news: normalizedNews.length > 0 ? normalizedNews : fallbackNewsItems
        };
    }, [followingIds, posts, topics]);

    const discoverTypes = useMemo(() => {
        const ordered = [
            { id: 'people', label: 'People', icon: 'fas fa-user-friends' },
            { id: 'posts', label: 'Posts', icon: 'fas fa-stream' },
            { id: 'trends', label: 'Trends', icon: 'fas fa-chart-line' },
            { id: 'news', label: 'News Items', icon: 'fas fa-newspaper' }
        ];

        return ordered.filter((type) => {
            const items = discoverBuckets[type.id] || [];
            return items.length > 0;
        });
    }, [discoverBuckets]);

    const activeDiscoverType = discoverTypes[discoverTypeIndex] || discoverTypes[0] || null;

    useEffect(() => {
        if (discoverTypes.length === 0) return;

        if (discoverTypeIndex >= discoverTypes.length) {
            setDiscoverTypeIndex(0);
        }
    }, [discoverTypeIndex, discoverTypes]);

    useEffect(() => {
        if (loading || discoverTypes.length < 2) {
            return undefined;
        }

        const rotateTimer = setInterval(() => {
            setDiscoverTypeIndex((prev) => (prev + 1) % discoverTypes.length);
        }, 5000);

        return () => clearInterval(rotateTimer);
    }, [discoverTypes.length, loading]);

    return (
        <div>
            <div
                style={{
                    position: 'sticky',
                    top: '88px',
                    zIndex: 15,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginBottom: '12px',
                    pointerEvents: 'none'
                }}
            >
                <div
                    style={{
                        background: 'rgba(17, 24, 39, 0.7)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '8px 10px',
                        backdropFilter: 'blur(6px)',
                        pointerEvents: 'auto'
                    }}
                >
                    <WiseRavenLogo showTagline={false} />
                </div>
            </div>
            <div
                style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '20px',
                    border: '1px solid var(--border-color)'
                }}
            >
                <h2 style={{ marginBottom: '15px' }}>Discover</h2>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '25px',
                                border: 'none',
                                background: activeTab === tab.id ? 'var(--highlight-color)' : 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-color)',
                                cursor: 'pointer'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {!loading && activeDiscoverType && (
                <div
                    style={{
                        background: 'var(--card-bg)',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '20px',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        <h3 style={{ margin: 0 }}>
                            <i className={activeDiscoverType.icon} style={{ marginRight: '8px' }}></i>
                            Discover Mix: {activeDiscoverType.label}
                        </h3>
                        <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>Auto-rotates every 5s</span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        {discoverTypes.map((type, index) => (
                            <button
                                key={type.id}
                                onClick={() => setDiscoverTypeIndex(index)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '999px',
                                    border: '1px solid var(--border-color)',
                                    background: activeDiscoverType.id === type.id ? 'var(--highlight-color)' : 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-color)',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>

                    {activeDiscoverType.id === 'people' && (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {discoverBuckets.people.map((person) => (
                                <div
                                    key={person.id}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '10px',
                                        padding: '12px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{person.name} <span style={{ color: 'var(--light-color)', fontWeight: 500 }}>{person.handle}</span></div>
                                        <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{person.followers} followers • {person.following} following</div>
                                    </div>
                                    <button
                                        onClick={() => handleFollowToggle(person.id, { name: person.name, handle: person.handle, avatar: person.avatar })}
                                        style={{
                                            border: '1px solid var(--border-color)',
                                            background: person.isFollowing ? 'rgba(255,255,255,0.06)' : 'var(--highlight-color)',
                                            color: 'var(--text-color)',
                                            borderRadius: '999px',
                                            padding: '7px 12px',
                                            cursor: 'pointer',
                                            fontSize: '12px'
                                        }}
                                    >
                                        {person.isFollowing ? 'Following' : 'Follow'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeDiscoverType.id === 'posts' && (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {discoverBuckets.posts.map((post) => (
                                <div key={post.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ fontSize: '13px', color: 'var(--light-color)', marginBottom: '6px' }}>{post.user?.name || 'User'} {post.user?.handle || ''}</div>
                                    <div style={{ marginBottom: '8px' }}>{post.content || 'No content'}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>❤ {post.likes || 0} • ↻ {post.reposts || 0}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeDiscoverType.id === 'trends' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            {discoverBuckets.trends.map((topic) => (
                                <span
                                    key={topic.name}
                                    style={{
                                        padding: '8px 14px',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: '20px',
                                        border: '1px solid var(--border-color)'
                                    }}
                                >
                                    #{topic.name} <span style={{ color: 'var(--highlight-color)' }}>{topic.count}</span>
                                </span>
                            ))}
                        </div>
                    )}

                    {activeDiscoverType.id === 'news' && (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {discoverBuckets.news.map((news) => (
                                <div key={news.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                                        <strong>{news.title}</strong>
                                        <span style={{ fontSize: '12px', color: 'var(--light-color)', whiteSpace: 'nowrap' }}>{news.source}</span>
                                    </div>
                                    <div style={{ fontSize: '14px', color: 'var(--light-color)' }}>{news.summary}</div>
                                    {news.externalUrl && (
                                        <a href={news.externalUrl} target="_blank" rel="noreferrer noopener" style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            Open source
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {topics.length > 0 && (
                <div
                    style={{
                        background: 'var(--card-bg)',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '20px',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    <h3 style={{ marginBottom: '12px' }}>Trending Topics</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {topics.map((topic) => (
                            <span
                                key={topic.name}
                                style={{
                                    padding: '6px 14px',
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: '20px'
                                }}
                            >
                                #{topic.name} <span style={{ color: 'var(--highlight-color)' }}>{topic.count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>Loading discover feed...</div>
            ) : (
                posts.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        currentUser={user}
                        isFollowing={followingIds.includes(post.userId)}
                        onFollow={(targetUserId) => handleFollowToggle(targetUserId, post.user)}
                    />
                ))
            )}
        </div>
    );
};

export default DiscoverPage;
