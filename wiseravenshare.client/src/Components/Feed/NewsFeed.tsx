import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Post {
    id: string;
    user: { name: string; avatar: string };
    content: string;
    mediaUrl?: string;
    mediaType: 'image' | 'video' | 'podcast';
    createdAt: Date;
}

const NewsFeed: React.FC = () => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFeed = async () => {
            try {
                const response = await axios.get('/api/feed');
                setPosts(response.data);
            } catch (error) {
                console.error('Failed to load feed:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchFeed();

        // Set up polling or SignalR for real-time updates
        const interval = setInterval(fetchFeed, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div>Loading...</div>;

    return (
        <div className="news-feed">
            {posts.map(post => (
                <article key={post.id} className="post-card">
                    <div className="post-header">
                        <img src={post.user.avatar} alt={post.user.name} />
                        <h3>{post.user.name}</h3>
                    </div>

                    <p>{post.content}</p>

                    {post.mediaUrl && post.mediaType === 'image' && (
                        <img src={post.mediaUrl} alt="Post media" />
                    )}

                    {post.mediaUrl && post.mediaType === 'video' && (
                        <video controls src={post.mediaUrl} />
                    )}

                    {post.mediaUrl && post.mediaType === 'podcast' && (
                        <audio controls src={post.mediaUrl} />
                    )}
                </article>
            ))}
        </div>
    );
};

export default NewsFeed;