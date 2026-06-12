import React, { useState, useEffect, useRef } from 'react';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaExpand, FaThumbsUp, FaComment, FaShare, FaDownload, FaVideo } from 'react-icons/fa';
import { ravensightAPI } from '../../Services/RavensightAPI';
import { useAuth } from '../../Contexts/AuthContext';

const safeReadJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const normalizeVideo = (video, index = 0) => ({
    id: video.id || `local-video-${Date.now()}-${index}`,
    videoUrl: video.videoUrl || video.mediaUrl || '',
    thumbnailUrl: video.thumbnailUrl || '',
    duration: video.duration || '00:30',
    channelAvatar: video.channelAvatar || video.avatar || 'https://via.placeholder.com/40?text=WR',
    channelName: video.channelName || video.user?.name || 'WiseRaven',
    title: video.title || 'Uploaded Video',
    views: Number(video.views) || 0,
    createdAt: video.createdAt || new Date().toISOString(),
    likes: Number(video.likes) || 0,
    comments: Number(video.comments) || 0,
    isLiked: Boolean(video.isLiked),
    userId: video.userId || video.user?.id || null
});

const getLocalFallbackVideos = (currentUserId, filterMode = 'all') => {
    const ravensightVideos = safeReadJson('wiseRavensightVideos', []).map((video, index) => normalizeVideo(video, index));
    const recentPosts = safeReadJson('wiseRecentPosts', [])
        .filter((post) => post.mediaType === 'video' && post.mediaUrl)
        .map((post, index) => normalizeVideo({
            id: `post-video-${post.id || index}`,
            videoUrl: post.mediaUrl,
            thumbnailUrl: post.thumbnailUrl,
            duration: '00:45',
            channelAvatar: post.user?.avatar,
            channelName: post.user?.name,
            title: post.content?.slice(0, 70) || 'Feed Video',
            views: post.views || 0,
            createdAt: post.createdAt,
            likes: post.likes || 0,
            comments: Array.isArray(post.comments) ? post.comments.length : Number(post.comments) || 0,
            userId: post.userId || post.user?.id
        }, index));

    const combined = [...ravensightVideos, ...recentPosts]
        .filter((video) => !!video.videoUrl)
        .filter((video, idx, all) => all.findIndex((v) => v.videoUrl === video.videoUrl) === idx);

    return combined.filter((video) => {
        if (filterMode === 'my_videos') {
            return currentUserId ? video.userId === currentUserId : true;
        }
        return true;
    });
};

const VideoFeed = ({ onNotification }) => {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [filter, setFilter] = useState('all'); // all, trending, subscribed, my_videos
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const observerRef = useRef();
    const { user } = useAuth();

    useEffect(() => {
        loadVideos();
    }, [filter, page]);

    useEffect(() => {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loading) {
                setPage(prev => prev + 1);
            }
        }, options);

        const sentinel = document.getElementById('feed-sentinel');
        if (sentinel) {
            observerRef.current.observe(sentinel);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [hasMore, loading]);

    const loadVideos = async () => {
        setLoading(true);
        try {
            const response = await ravensightAPI.getVideoFeed({
                filter,
                page,
                limit: 10
            });

            const responseVideos = Array.isArray(response?.videos)
                ? response.videos.map((video, index) => normalizeVideo(video, index))
                : [];

            if (responseVideos.length === 0 && page === 1) {
                const fallback = getLocalFallbackVideos(user?.id, filter);
                setVideos(fallback);
                setHasMore(false);
                return;
            }

            if (page === 1) {
                setVideos(responseVideos);
            } else {
                setVideos(prev => [...prev, ...responseVideos]);
            }

            setHasMore(Boolean(response?.hasMore));
        } catch (error) {
            console.error('Error loading videos:', error);
            if (page === 1) {
                const fallback = getLocalFallbackVideos(user?.id, filter);
                setVideos(fallback);
                if (fallback.length > 0) {
                    onNotification('Showing local video feed while Ravensight API is unavailable.', 'warning');
                } else {
                    onNotification('Video feed is unavailable right now.', 'error');
                }
            }
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    };

    const handleLike = async (videoId) => {
        try {
            await ravensightAPI.likeVideo(videoId);
            setVideos(prev => prev.map(video =>
                video.id === videoId
                    ? { ...video, likes: video.likes + 1, isLiked: true }
                    : video
            ));
            onNotification('Video liked!', 'success');
        } catch (error) {
            console.error('Error liking video:', error);
        }
    };

    const formatViews = (views) => {
        if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
        if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
        return views.toString();
    };

    const formatDate = (date) => {
        const now = new Date();
        const diff = now - new Date(date);
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
        if (days < 365) return `${Math.floor(days / 30)} months ago`;
        return `${Math.floor(days / 365)} years ago`;
    };

    const VideoCard = ({ video }) => {
        const [isPlaying, setIsPlaying] = useState(false);
        const [isMuted, setIsMuted] = useState(true);
        const videoRef = useRef(null);

        const handlePlayPause = () => {
            if (videoRef.current) {
                if (isPlaying) {
                    videoRef.current.pause();
                } else {
                    videoRef.current.play();
                }
                setIsPlaying(!isPlaying);
            }
        };

        return (
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'transform 0.3s',
                cursor: 'pointer'
            }}
                onMouseEnter={() => setIsPlaying(true)}
                onMouseLeave={() => {
                    if (videoRef.current) {
                        videoRef.current.pause();
                        setIsPlaying(false);
                    }
                }}>
                <div style={{ position: 'relative' }}>
                    <video
                        ref={videoRef}
                        src={video.videoUrl}
                        poster={video.thumbnailUrl}
                        muted={isMuted}
                        loop
                        style={{
                            width: '100%',
                            height: 'auto',
                            background: '#000'
                        }}
                    />

                    {/* Duration Badge */}
                    <div style={{
                        position: 'absolute',
                        bottom: '10px',
                        right: '10px',
                        background: 'rgba(0,0,0,0.8)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '12px'
                    }}>
                        {video.duration}
                    </div>

                    {/* Play Button Overlay */}
                    {!isPlaying && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            background: 'rgba(0,0,0,0.7)',
                            borderRadius: '50%',
                            width: '50px',
                            height: '50px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <FaPlay style={{ color: 'white', marginLeft: '4px' }} />
                        </div>
                    )}
                </div>

                <div style={{ padding: '15px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <img
                            src={video.channelAvatar}
                            alt={video.channelName}
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                objectFit: 'cover'
                            }}
                        />
                        <div style={{ flex: 1 }}>
                            <h4 style={{
                                fontSize: '16px',
                                marginBottom: '5px',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                            }}>
                                {video.title}
                            </h4>
                            <div style={{ fontSize: '14px', color: 'var(--highlight-color)' }}>
                                {video.channelName}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                {formatViews(video.views)} views • {formatDate(video.createdAt)}
                            </div>
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        gap: '15px',
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid var(--border-color)'
                    }}>
                        <button
                            onClick={() => handleLike(video.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'none',
                                border: 'none',
                                color: video.isLiked ? '#f44336' : 'var(--text-color)',
                                cursor: 'pointer'
                            }}
                        >
                            <FaThumbsUp /> {video.likes}
                        </button>
                        <button style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}>
                            <FaComment /> {video.comments}
                        </button>
                        <button style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}>
                            <FaShare /> Share
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const filters = [
        { id: 'all', label: 'All Videos' },
        { id: 'trending', label: 'Trending' },
        { id: 'subscribed', label: 'Subscribed' },
        { id: 'my_videos', label: 'My Videos' }
    ];

    return (
        <div>
            {/* Filter Bar */}
            <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '20px',
                overflowX: 'auto',
                paddingBottom: '10px'
            }}>
                {filters.map(f => (
                    <button
                        key={f.id}
                        onClick={() => {
                            setFilter(f.id);
                            setPage(1);
                        }}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '20px',
                            border: 'none',
                            background: filter === f.id ? 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))' : 'var(--secondary-color)',
                            color: 'white',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Video Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: '20px'
            }}>
                {videos.map(video => (
                    <VideoCard key={video.id} video={video} />
                ))}
            </div>

            {/* Loading Indicator */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                </div>
            )}

            {/* Sentinel for Infinite Scroll */}
            <div id="feed-sentinel" style={{ height: '20px' }}></div>

            {/* Empty State */}
            {!loading && videos.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '60px',
                    color: 'var(--highlight-color)'
                }}>
                    <FaVideo style={{ fontSize: '64px', marginBottom: '20px' }} />
                    <h3>No videos found</h3>
                    <p>Check back later for new content!</p>
                </div>
            )}
        </div>
    );
};

export default VideoFeed;