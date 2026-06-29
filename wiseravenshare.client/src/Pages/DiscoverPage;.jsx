import React, { useState, useEffect } from 'react';
import PostCard from '../components/feed/PostCard';
import { apiService } from '../services/api';
import { useAuth } from '../Contexts/AuthContext';

const DiscoverPage = () => {
    const [trendingPosts, setTrendingPosts] = useState([]);
    const [trendingTopics, setTrendingTopics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('trending');
    const { user } = useAuth();

    useEffect(() => {
        loadDiscoverContent();
    }, [activeTab]);

    const loadDiscoverContent = async () => {
        setLoading(true);
        try {
            if (activeTab === 'trending') {
                const [posts, topics] = await Promise.all([
                    apiService.getPosts({ sort: 'trending', limit: 20 }),
                    apiService.getTrending()
                ]);
                setTrendingPosts(posts.data);
                setTrendingTopics(topics.data);
            } else if (activeTab === 'latest') {
                const response = await apiService.getPosts({ sort: 'latest', limit: 20 });
                setTrendingPosts(response.data);
            } else if (activeTab === 'popular') {
                const response = await apiService.getPosts({ sort: 'popular', limit: 20 });
                setTrendingPosts(response.data);
            }
        } catch (error) {
            console.error('Failed to load discover content:', error);
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { id: 'trending', label: '🔥 Trending', icon: 'fas fa-fire' },
        { id: 'latest', label: '🕒 Latest', icon: 'fas fa-clock' },
        { id: 'popular', label: '⭐ Popular', icon: 'fas fa-star' }
    ];

    return (
        <div>
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                border: '1px solid var(--border-color)'
            }}>
                <h2 style={{ marginBottom: '15px' }}>Discover</h2>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '25px',
                                border: 'none',
                                background: activeTab === tab.id ? 'var(--highlight-color)' : 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-color)',
                                cursor: 'pointer',
                                transition: 'all 0.3s'
                            }}
                        >
                            <i className={tab.icon} style={{ marginRight: '8px' }}></i>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'trending' && trendingTopics.length > 0 && (
                <div style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '20px',
                    border: '1px solid var(--border-color)'
                }}>
                    <h3 style={{ marginBottom: '15px' }}>
                        <i className="fas fa-hashtag"></i> Trending Topics
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {trendingTopics.map(topic => (
                            <span
                                key={topic.name}
                                style={{
                                    padding: '6px 14px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                            >
                                #{topic.name}
                                <span style={{ marginLeft: '5px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                                    {topic.count}
                                </span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                </div>
            ) : (
                trendingPosts.map(post => (
                    <PostCard
                        key={post.id}
                        post={post}
                        currentUser={user}
                    />
                ))
            )}

            {!loading && trendingPosts.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '50px',
                    color: 'var(--highlight-color)'
                }}>
                    <i className="fas fa-compass" style={{ fontSize: '50px', marginBottom: '15px' }}></i>
                    <p>No posts to discover yet. Check back later!</p>
                </div>
            )}
        </div>
    );
};

export default DiscoverPage;