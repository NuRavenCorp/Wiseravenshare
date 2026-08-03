import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface NewsArticle {
    provider: string;
    source?: string;
    title: string;
    description?: string;
    url?: string;
    mediaUrl?: string;
    imageUrl?: string;
    publishedAtUtc?: string;
}

interface NewsResponse {
    articles: NewsArticle[];
}

const NewsFeed: React.FC = () => {
    const [articles, setArticles] = useState<NewsArticle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFeed = async () => {
            try {
                const response = await axios.get<NewsResponse>('/api/news/trending?limit=20');
                setArticles(Array.isArray(response.data?.articles) ? response.data.articles : []);
            } catch (error) {
                console.error('Failed to load feed:', error);
                setArticles([]);
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
            {articles.map((article, index) => (
                <article key={`${article.url ?? article.title}-${index}`} className="post-card">
                    <div className="post-header">
                        <h3>{article.title}</h3>
                    </div>

                    <p>{article.description ?? 'No summary available.'}</p>
                    <p>
                        <strong>Source:</strong> {article.source ?? article.provider}
                    </p>

                    {article.imageUrl && (
                        <img src={article.imageUrl} alt={article.title} />
                    )}

                    {article.url && (
                        <a href={article.url} target="_blank" rel="noreferrer">
                            Read full story
                        </a>
                    )}
                </article>
            ))}
        </div>
    );
};

export default NewsFeed;