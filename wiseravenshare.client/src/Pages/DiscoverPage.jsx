import React, { useState, useEffect, useMemo } from 'react';
import PostCard from '../Components/Feed/PostCard.jsx';
import { apiService } from '../Services/api';
import { useAuth } from '../Contexts/AuthContext';
import { socialGraphService } from '../Services/SocialGraph';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';

const MAX_STORED_POSTS = 120;

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

const fallbackGroups = [
    {
        id: 'group-truth-watch',
        name: 'Truth Watch',
        description: 'Discuss misinformation, verification, and fact-checking strategies.',
        members: 1240,
        focus: 'Truth detection'
    },
    {
        id: 'group-political-desk',
        name: 'Civic Desk',
        description: 'Follow policy shifts, elections, and political headlines.',
        members: 860,
        focus: 'Politics'
    },
    {
        id: 'group-tech-briefing',
        name: 'Tech Briefing',
        description: 'Track new tools, launches, AI products, and platform news.',
        members: 2140,
        focus: 'Current events'
    }
];

const newsCategoryRules = [
    { category: 'Politics', words: ['election', 'campaign', 'senate', 'congress', 'parliament', 'president', 'vote', 'politic', 'policy'] },
    { category: 'Current Events', words: ['today', 'breaking', 'live', 'update', 'protest', 'war', 'flood', 'storm', 'summit', 'launch'] },
    { category: 'Headlines', words: ['headline', 'top story', 'breaking news', 'major', 'exclusive', 'report'] }
];

const inferNewsCategory = (item) => {
    const normalized = `${item?.title || ''} ${item?.summary || ''} ${item?.content || ''} ${item?.source || ''}`.toLowerCase();
    const hit = newsCategoryRules.find((rule) => rule.words.some((word) => normalized.includes(word)));
    return hit?.category || item?.category || 'News';
};

const normalizeNewsItem = (item, index) => ({
    ...item,
    id: item.id || `discover-news-${index}`,
    title: item.title || 'AI News update',
    source: item.source || 'WiseRaven',
    summary: item.summary || item.content || 'News summary unavailable.',
    externalUrl: item.externalUrl || item.url || null,
    category: inferNewsCategory(item)
});

const DiscoverPage = () => {
    const [posts, setPosts] = useState([]);
    const [topics, setTopics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('people');
    const [followingIds, setFollowingIds] = useState([]);
    const { user } = useAuth();

    useEffect(() => {
        loadDiscoverContent();
    }, []);

    useEffect(() => {
        if (!user?.id) return;
        socialGraphService.registerUserProfile(user);
        setFollowingIds(socialGraphService.getFollowingIds(user.id));
    }, [user?.id]);

    const loadDiscoverContent = async () => {
        setLoading(true);
        try {
            const [postResponse, topicResponse] = await Promise.all([
                apiService.getPosts({ sort: 'trending', limit: 20 }),
                apiService.getTrending()
            ]);

            const nextPosts = postResponse.data || [];
            setPosts(nextPosts);
            localStorage.setItem('wiseDiscoverPosts', JSON.stringify(nextPosts.slice(0, MAX_STORED_POSTS)));
            window.dispatchEvent(new Event('wiseraven:posts-updated'));
            setTopics(topicResponse.data || []);
        } catch (error) {
            setPosts(fallbackPosts);
            localStorage.setItem('wiseDiscoverPosts', JSON.stringify(fallbackPosts.slice(0, MAX_STORED_POSTS)));
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

        const topicBuckets = (Array.isArray(topics) ? topics : [])
            .slice(0, 12)
            .map((topic, index) => ({
                id: topic.id || `topic-${index}`,
                name: topic.name || topic.topic || `Topic ${index + 1}`,
                count: Number(topic.count) || Number(topic.posts) || 0,
                description: `Explore the latest activity around ${topic.name || topic.topic || 'this topic'}.`
            }));

        let storedNews = [];
        try {
            const selectedArticle = JSON.parse(localStorage.getItem('wiseSelectedArticle') || 'null');
            const discoverNews = JSON.parse(localStorage.getItem('wiseDiscoverNews') || '[]');
            storedNews = [selectedArticle, ...(Array.isArray(discoverNews) ? discoverNews : [])].filter(Boolean);
        } catch {
            storedNews = [];
        }

        const normalizedNews = storedNews
            .map((item, index) => normalizeNewsItem(item, index))
            .slice(0, 16);

        const mergedNews = (normalizedNews.length > 0 ? normalizedNews : fallbackNewsItems.map(normalizeNewsItem))
            .slice(0, 16);

        const currentEvents = mergedNews.filter((item) => item.category === 'Current Events' || /breaking|update|live|today|protest|storm|flood|launch|summit|war/i.test(`${item.title} ${item.summary}`));
        const headlines = [...mergedNews].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 8);
        const political = mergedNews.filter((item) => item.category === 'Politics' || /election|senate|congress|vote|policy|government|campaign/i.test(`${item.title} ${item.summary}`));

        const dynamicGroups = topicBuckets.slice(0, 6).map((topic, index) => ({
            id: `topic-group-${index}`,
            name: `${topic.name} Circle`,
            description: `A community focused on ${topic.name.toLowerCase()}.`,
            members: Math.max(50, topic.count || 0),
            focus: topic.name
        }));

        const groups = [...fallbackGroups, ...dynamicGroups].filter((group, index, arr) => arr.findIndex((item) => item.id === group.id) === index);

        return {
            people: Array.from(peopleMap.values()).slice(0, 8),
            groups: groups.slice(0, 8),
            topics: topicBuckets,
            news: mergedNews,
            currentEvents: currentEvents.length > 0 ? currentEvents : mergedNews.slice(0, 6),
            headlines: headlines.length > 0 ? headlines : mergedNews.slice(0, 6),
            political: political.length > 0 ? political : mergedNews.filter((item) => item.category === 'Politics').slice(0, 6),
            posts: posts.slice(0, 8)
        };
    }, [followingIds, posts, topics]);

    useEffect(() => {
        const availableSections = ['people', 'groups', 'topics', 'news', 'currentEvents', 'headlines', 'political'];
        if (!availableSections.includes(activeSection)) {
            setActiveSection('people');
        }
    }, [activeSection]);

    const discoverSections = useMemo(() => ([
        { id: 'people', label: 'People', icon: 'fas fa-user-friends', count: discoverBuckets.people.length, helper: 'Creators and voices to follow' },
        { id: 'groups', label: 'Groups', icon: 'fas fa-layer-group', count: discoverBuckets.groups.length, helper: 'Communities and circles' },
        { id: 'topics', label: 'Topics', icon: 'fas fa-hashtag', count: discoverBuckets.topics.length, helper: 'What is being discussed now' },
        { id: 'news', label: 'News', icon: 'fas fa-newspaper', count: discoverBuckets.news.length, helper: 'Curated news items' },
        { id: 'currentEvents', label: 'Current Events', icon: 'fas fa-bolt', count: discoverBuckets.currentEvents.length, helper: 'What is happening now' },
        { id: 'headlines', label: 'Headlines', icon: 'fas fa-rss', count: discoverBuckets.headlines.length, helper: 'Top stories and headlines' },
        { id: 'political', label: 'Political', icon: 'fas fa-landmark', count: discoverBuckets.political.length, helper: 'Policy, elections, civic coverage' }
    ]), [discoverBuckets]);

    const activeDiscoverType = discoverSections.find((section) => section.id === activeSection) || discoverSections[0] || null;

    const renderLaneContent = () => {
        switch (activeSection) {
            case 'people':
                return (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {discoverBuckets.people.map((person) => (
                            <div
                                key={person.id}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    padding: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '42px',
                                        height: '42px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold'
                                    }}>{person.avatar}</div>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{person.name}</div>
                                        <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>{person.handle}</div>
                                        <div style={{ color: 'var(--highlight-color)', fontSize: '12px' }}>{person.followers} followers • {person.following} following</div>
                                    </div>
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
                                        fontSize: '12px',
                                        minWidth: '92px'
                                    }}
                                >
                                    {person.isFollowing ? 'Following' : 'Follow'}
                                </button>
                            </div>
                        ))}
                    </div>
                );

            case 'groups':
                return (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {discoverBuckets.groups.map((group) => (
                            <div
                                key={group.id}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    padding: '12px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start' }}>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{group.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>{group.members.toLocaleString()} members</div>
                                    </div>
                                    <span style={{ fontSize: '12px', color: 'var(--light-color)', border: '1px solid var(--border-color)', borderRadius: '999px', padding: '4px 8px' }}>
                                        {group.focus}
                                    </span>
                                </div>
                                <div style={{ marginTop: '8px', color: 'var(--light-color)' }}>{group.description}</div>
                            </div>
                        ))}
                    </div>
                );

            case 'topics':
                return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {discoverBuckets.topics.map((topic) => (
                            <div
                                key={topic.id}
                                style={{
                                    minWidth: '220px',
                                    flex: '1 1 220px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    padding: '12px'
                                }}
                            >
                                <div style={{ fontWeight: 700 }}>#{topic.name}</div>
                                <div style={{ color: 'var(--highlight-color)', fontSize: '12px' }}>{topic.count.toLocaleString()} mentions</div>
                                <div style={{ color: 'var(--light-color)', marginTop: '6px', fontSize: '13px' }}>{topic.description}</div>
                            </div>
                        ))}
                    </div>
                );

            case 'news':
            case 'headlines':
            case 'currentEvents':
            case 'political': {
                const laneItems = discoverBuckets[activeSection] || [];
                const laneTitle = activeSection === 'news'
                    ? 'News Items'
                    : activeSection === 'currentEvents'
                        ? 'Current Events'
                        : activeSection === 'headlines'
                            ? 'Headlines'
                            : 'Political Content';

                return (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {laneItems.map((item) => (
                            <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px', alignItems: 'start' }}>
                                    <strong>{item.title}</strong>
                                    <span style={{ fontSize: '12px', color: 'var(--light-color)', border: '1px solid var(--border-color)', padding: '4px 8px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                                        {item.category || laneTitle}
                                    </span>
                                </div>
                                <div style={{ fontSize: '14px', color: 'var(--light-color)' }}>{item.summary}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>{item.source}</span>
                                    {item.externalUrl && (
                                        <a href={item.externalUrl} target="_blank" rel="noreferrer noopener" style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            Open source
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            }

            default:
                return null;
        }
    };

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
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                        <h2 style={{ marginBottom: '4px' }}>Discover</h2>
                        <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>Browse people, groups, topics, news items, current events, headlines, and political coverage.</div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--light-color)', border: '1px solid var(--border-color)', borderRadius: '999px', padding: '6px 10px' }}>
                        {discoverSections.length} lanes
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                    {discoverSections.map((section) => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            style={{
                                padding: '14px',
                                borderRadius: '14px',
                                border: `1px solid ${activeSection === section.id ? 'var(--highlight-color)' : 'var(--border-color)'}`,
                                background: activeSection === section.id ? 'rgba(79, 116, 214, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                                color: 'var(--text-color)',
                                cursor: 'pointer',
                                textAlign: 'left'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <i className={section.icon}></i>
                                <strong>{section.label}</strong>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{section.helper}</div>
                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--highlight-color)' }}>{section.count} items</div>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>
                                <i className={activeDiscoverType.icon} style={{ marginRight: '8px' }}></i>
                                {activeDiscoverType.label}
                            </h3>
                            <div style={{ fontSize: '13px', color: 'var(--light-color)', marginTop: '4px' }}>{activeDiscoverType.helper}</div>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>{activeDiscoverType.count} items available</span>
                    </div>

                    {renderLaneContent()}
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
        </div>
    );
};

export default DiscoverPage;
