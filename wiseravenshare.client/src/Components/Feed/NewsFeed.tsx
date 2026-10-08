import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { resolveArticleImage } from '../../utils/newsImageUtils';
import { useAuth } from '../../Contexts/AuthContext';

interface NewsArticle {
    markerKey?: string;
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

interface NewsMarkerEntry {
    markerKey: string;
    liked: boolean;
    bookmarked: boolean;
    updatedAtUtc: string;
    article: NewsArticle;
}

type NewsMarkerMap = Record<string, NewsMarkerEntry>;
interface NewsMarkerDto {
    markerKey: string;
    markerType: 'liked' | 'bookmarked';
    title?: string;
    source?: string;
    provider?: string;
    url?: string;
    imageUrl?: string;
}

const buildMarkerStorageKey = (userId?: string | null) => `wiseNewsMarkers_${userId || 'guest'}`;

const toMarkerKey = (article: NewsArticle): string => {
    const fromServer = String(article?.markerKey || '').trim().toLowerCase();
    if (fromServer) {
        return fromServer;
    }

    const fromUrl = String(article?.url || '').trim().toLowerCase();
    if (fromUrl) {
        return fromUrl;
    }

    return `${String(article?.provider || article?.source || 'news').trim().toLowerCase()}::${String(article?.title || '').trim().toLowerCase()}`;
};

const NewsFeed: React.FC = () => {
    const { user } = useAuth();
    const [articles, setArticles] = useState<NewsArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<'all' | 'liked' | 'bookmarked'>('all');
    const [markers, setMarkers] = useState<NewsMarkerMap>({});

    const storageKey = buildMarkerStorageKey(user?.id);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            const parsed = raw ? JSON.parse(raw) : {};
            setMarkers(parsed && typeof parsed === 'object' ? parsed : {});
        } catch {
            setMarkers({});
        }
    }, [storageKey]);

    const persistMarkers = (next: NewsMarkerMap) => {
        setMarkers(next);
        localStorage.setItem(storageKey, JSON.stringify(next));
    };

    const applyServerMarkers = (markerItems: NewsMarkerDto[]) => {
        if (!Array.isArray(markerItems)) {
            return;
        }

        const next: NewsMarkerMap = {};
        for (const marker of markerItems) {
            const markerKey = String(marker?.markerKey || '').trim().toLowerCase();
            if (!markerKey) {
                continue;
            }

            const current = next[markerKey] || {
                markerKey,
                liked: false,
                bookmarked: false,
                updatedAtUtc: new Date().toISOString(),
                article: {
                    markerKey,
                    provider: String(marker?.provider || '').trim(),
                    source: String(marker?.source || '').trim(),
                    title: String(marker?.title || '').trim() || 'News Article',
                    url: String(marker?.url || '').trim(),
                    imageUrl: String(marker?.imageUrl || '').trim()
                }
            };

            if (marker.markerType === 'liked') {
                current.liked = true;
            }
            if (marker.markerType === 'bookmarked') {
                current.bookmarked = true;
            }

            next[markerKey] = current;
        }

        persistMarkers(next);
    };

    const setMarkerState = (article: NewsArticle, change: { liked?: boolean; bookmarked?: boolean }) => {
        const markerKey = toMarkerKey(article);
        const current = markers[markerKey] || {
            markerKey,
            liked: false,
            bookmarked: false,
            updatedAtUtc: new Date().toISOString(),
            article: {
                ...article,
                markerKey
            }
        };

        const nextEntry: NewsMarkerEntry = {
            ...current,
            liked: typeof change.liked === 'boolean' ? change.liked : current.liked,
            bookmarked: typeof change.bookmarked === 'boolean' ? change.bookmarked : current.bookmarked,
            updatedAtUtc: new Date().toISOString(),
            article: {
                ...current.article,
                ...article,
                markerKey
            }
        };

        const next = { ...markers, [markerKey]: nextEntry };
        if (!nextEntry.liked && !nextEntry.bookmarked) {
            delete next[markerKey];
        }
        persistMarkers(next);

        if (user?.id) {
            const mutations: Array<{ markerType: 'liked' | 'bookmarked'; marked: boolean }> = [];
            if (typeof change.liked === 'boolean') {
                mutations.push({ markerType: 'liked', marked: nextEntry.liked });
            }
            if (typeof change.bookmarked === 'boolean') {
                mutations.push({ markerType: 'bookmarked', marked: nextEntry.bookmarked });
            }

            void Promise.all(mutations.map((mutation) => axios.post('/api/news/markers', {
                markerType: mutation.markerType,
                markerKey,
                marked: mutation.marked,
                title: article.title,
                source: article.source,
                provider: article.provider,
                url: article.url,
                imageUrl: article.imageUrl
            }))).catch(() => {
                // Keep local state if marker sync fails.
            });
        }
    };

    useEffect(() => {
        const fetchMarkers = async () => {
            if (!user?.id) {
                return;
            }

            try {
                const response = await axios.get<{ markers: NewsMarkerDto[] }>('/api/news/markers');
                applyServerMarkers(Array.isArray(response.data?.markers) ? response.data.markers : []);
            } catch {
                // Keep local markers as fallback.
            }
        };

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

        fetchMarkers();
        fetchFeed();

        // Set up polling or SignalR for real-time updates
        const interval = setInterval(fetchFeed, 30000);
        return () => clearInterval(interval);
    }, [user?.id]);

    if (loading) return <div>Loading...</div>;

    const markerArticles = Object.values(markers)
        .sort((a, b) => Date.parse(b.updatedAtUtc) - Date.parse(a.updatedAtUtc))
        .map((entry) => entry.article);

    const mergedArticleMap = new Map<string, NewsArticle>();
    for (const article of [...articles, ...markerArticles]) {
        mergedArticleMap.set(toMarkerKey(article), article);
    }

    const allArticles = Array.from(mergedArticleMap.values());
    const filteredArticles = allArticles.filter((article) => {
        const marker = markers[toMarkerKey(article)];
        if (activeFilter === 'liked') {
            return Boolean(marker?.liked);
        }
        if (activeFilter === 'bookmarked') {
            return Boolean(marker?.bookmarked);
        }
        return true;
    });

    return (
        <div className="news-feed">
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {[
                    { id: 'all', label: 'All' },
                    { id: 'liked', label: 'Liked' },
                    { id: 'bookmarked', label: 'Bookmarked' }
                ].map((filter) => (
                    <button
                        key={filter.id}
                        type="button"
                        onClick={() => setActiveFilter(filter.id as 'all' | 'liked' | 'bookmarked')}
                        style={{
                            borderRadius: '999px',
                            border: '1px solid var(--border-color)',
                            background: activeFilter === filter.id ? 'var(--highlight-color)' : 'var(--secondary-color)',
                            color: activeFilter === filter.id ? '#fff' : 'var(--text-color)',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600
                        }}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {filteredArticles.map((article, index) => {
                const markerKey = toMarkerKey(article);
                const marker = markers[markerKey];
                return (
                <article key={`${article.url ?? article.title}-${index}`} className="post-card">
                    <div className="post-header">
                        <h3>{article.title}</h3>
                    </div>

                    <img
                        src={resolveArticleImage(article)}
                        alt={article.title}
                        onError={(event) => {
                            event.currentTarget.src = resolveArticleImage({
                                title: article.title,
                                source: article.source ?? article.provider,
                                category: 'General'
                            });
                        }}
                        style={{
                            width: '100%',
                            maxHeight: '260px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            marginBottom: '10px',
                            background: 'rgba(255,255,255,0.04)'
                        }}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                    />

                    <p>{article.description ?? 'No summary available.'}</p>
                    <p>
                        <strong>Source:</strong> {article.source ?? article.provider}
                    </p>

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setMarkerState(article, { liked: !Boolean(marker?.liked) })}
                            style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '999px',
                                background: marker?.liked ? 'rgba(244,67,54,0.18)' : 'transparent',
                                color: marker?.liked ? '#f44336' : 'var(--text-color)',
                                padding: '6px 10px',
                                cursor: 'pointer'
                            }}
                        >
                            {marker?.liked ? '♥ Liked' : '♡ Like'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMarkerState(article, { bookmarked: !Boolean(marker?.bookmarked) })}
                            style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '999px',
                                background: marker?.bookmarked ? 'rgba(79,116,214,0.22)' : 'transparent',
                                color: marker?.bookmarked ? 'var(--highlight-color)' : 'var(--text-color)',
                                padding: '6px 10px',
                                cursor: 'pointer'
                            }}
                        >
                            {marker?.bookmarked ? '🔖 Bookmarked' : '🔖 Bookmark'}
                        </button>
                        <span style={{ fontSize: '11px', color: 'var(--highlight-color)', alignSelf: 'center' }}>
                            Marker: {markerKey.slice(0, 48)}
                        </span>
                    </div>

                    {article.url && (
                        <a href={article.url} target="_blank" rel="noreferrer">
                            Read full story
                        </a>
                    )}
                </article>
            );
            })}
            {filteredArticles.length === 0 && (
                <div style={{ color: 'var(--highlight-color)', padding: '16px 0' }}>
                    No {activeFilter === 'all' ? '' : activeFilter} articles found.
                </div>
            )}
        </div>
    );
};

export default NewsFeed;