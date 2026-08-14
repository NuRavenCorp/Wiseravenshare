import React, { useState, useEffect, useRef } from 'react';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaExpand, FaThumbsUp, FaComment, FaShare, FaDownload, FaVideo } from 'react-icons/fa';
import { ravensightAPI } from '../../Services/RavensightAPI';
import { useAuth } from '../../Contexts/AuthContext';
import { normalizeVideoRecord, getMergedLocalVideos } from '../../Services/ravensightVideoStore';

const normalizeMediaSource = (value, fallback = '') => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:video/')) {
        return trimmed.length <= 2_000_000 ? trimmed : fallback;
    }

    if (/^https?:\/\//i.test(trimmed) || /^blob:/i.test(trimmed) || trimmed.startsWith('/')) {
        return trimmed;
    }

    return fallback;
};

const normalizeVideo = (video, index = 0) => {
    const normalized = normalizeVideoRecord(video, index);
    return {
        ...normalized,
        videoUrl: normalizeMediaSource(normalized.videoUrl || normalized.mediaUrl || '', ''),
        thumbnailUrl: normalizeMediaSource(normalized.thumbnailUrl || '', ''),
        channelAvatar: normalizeMediaSource(normalized.channelAvatar || 'https://via.placeholder.com/40?text=WR', 'https://via.placeholder.com/40?text=WR')
    };
};

const getLocalFallbackVideos = (currentUserId, filterMode = 'all') => {
    const combined = getMergedLocalVideos(currentUserId).map((video, index) => normalizeVideo(video, index));

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
        const handleVideoSaved = () => {
            if (page === 1) {
                loadVideos();
            }
        };

        window.addEventListener('ravensight:video-saved', handleVideoSaved);
        return () => window.removeEventListener('ravensight:video-saved', handleVideoSaved);
    }, [page, filter]);

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
            let response = null;
            let attempts = 0;
            const maxAttempts = 2;
            while (attempts < maxAttempts) {
                attempts += 1;
                try {
                    response = await ravensightAPI.getVideoFeed({
                        filter,
                        page,
                        limit: 10
                    });
                    break;
                } catch (error) {
                    const status = Number(error?.status ?? error?.response?.status ?? 0);
                    const shouldRetry = attempts < maxAttempts && (status === 0 || status >= 500);
                    if (!shouldRetry) {
                        throw error;
                    }
                }
            }

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
                const status = Number(error?.status ?? error?.response?.status ?? 0);
                if (status === 401 || status === 403) {
                    onNotification('Sign in to load your Ravensight feed.', 'warning');
                } else if (status === 404 || status === 405) {
                    if (fallback.length > 0) {
                        onNotification('Ravensight feed is temporarily unavailable. Showing your local video feed.', 'warning');
                    } else {
                        onNotification('Ravensight feed is temporarily unavailable. Please refresh and try again.', 'error');
                    }
                } else if (status === 0) {
                    onNotification('Unable to reach Ravensight API. Check network/API host settings.', 'error');
                } else if (fallback.length > 0) {
                    onNotification('Showing local video feed while Ravensight API is unavailable.', 'warning');
                } else {
                    const message = typeof error?.message === 'string' && error.message.trim().length > 0
                        ? error.message.trim()
                        : 'Video feed is unavailable right now.';
                    onNotification(message, 'error');
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
        const [isBanging, setIsBanging] = useState(false);
        const videoRef = useRef(null);

        const triggerPlayback = async () => {
            if (!videoRef.current) return;

            setIsBanging(true);
            window.setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.play().catch(() => null);
                }
            }, 180);

            window.setTimeout(() => {
                setIsBanging(false);
            }, 700);
        };

        const handlePlayPause = async () => {
            if (videoRef.current) {
                if (isPlaying) {
                    videoRef.current.pause();
                    setIsPlaying(false);
                    return;
                }

                await triggerPlayback();
                setIsPlaying(true);
            }
        };

        return (
            <>
                <style>{`
                    @keyframes retroTvBang {
                        0% { transform: translateX(0) rotate(0deg) scale(1); opacity: 0; }
                        20% { opacity: 1; }
                        30% { transform: translateX(-9px) rotate(-6deg) scale(1.02); }
                        45% { transform: translateX(9px) rotate(7deg) scale(1.03); }
                        60% { transform: translateX(-6px) rotate(-5deg) scale(1); }
                        100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 0; }
                    }
                    @keyframes retroGlow {
                        0% { box-shadow: 0 0 0 rgba(255, 213, 94, 0); }
                        30% { box-shadow: 0 0 18px rgba(255, 213, 94, 0.9); }
                        100% { box-shadow: 0 0 0 rgba(255, 213, 94, 0); }
                    }
                `}</style>
                <div style={{
                    background: 'linear-gradient(145deg, rgba(18,18,18,0.96), rgba(35,35,35,0.88))',
                    border: '4px solid #7e6f4d',
                    borderRadius: '18px',
                    boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.5), 0 14px 30px rgba(0,0,0,0.2)',
                    overflow: 'hidden',
                    transition: 'transform 0.3s',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: '12px 12px 0'
                }}
                    onMouseEnter={() => setIsPlaying(true)}
                    onMouseLeave={() => {
                        if (videoRef.current) {
                            videoRef.current.pause();
                            setIsPlaying(false);
                        }
                    }}>
                    <div style={{
                        position: 'absolute',
                        left: '10px',
                        top: '14px',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, #f0d977, #c38a14)',
                        boxShadow: '0 0 12px rgba(255, 205, 86, 0.9)',
                        zIndex: 2,
                        opacity: isBanging ? 1 : 0.45,
                        animation: isBanging ? 'retroGlow 0.7s ease-in-out' : 'none'
                    }} />
                    <div style={{
                        position: 'absolute',
                        left: '8px',
                        top: '34px',
                        width: '3px',
                        height: '62px',
                        borderRadius: '999px',
                        background: '#c2a773',
                        opacity: 0.8,
                        zIndex: 2
                    }} />
                    <div style={{
                        position: 'absolute',
                        left: '0px',
                        top: '34px',
                        width: '38px',
                        height: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        transform: isBanging ? 'translateX(-8px) rotate(-12deg)' : 'translateX(0) rotate(0deg)',
                        transition: 'transform 0.13s ease-in-out',
                        animation: isBanging ? 'retroTvBang 0.7s ease-in-out' : 'none',
                        zIndex: 3,
                        textShadow: '0 0 12px rgba(255,255,255,0.5)'
                    }}>
                        ✋
                    </div>
                    <div style={{ position: 'relative' }} onClick={handlePlayPause}>
                        <video
                            ref={videoRef}
                            src={video.videoUrl}
                            poster={video.thumbnailUrl}
                            muted={isMuted}
                            loop
                            style={{
                                width: '100%',
                                height: 'auto',
                                background: '#000',
                                borderRadius: '8px',
                                border: '3px solid rgba(0,0,0,0.8)',
                                boxShadow: 'inset 0 0 18px rgba(255,255,255,0.08)'
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
                            <div
                                onClick={handlePlayPause}
                                style={{
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
                                    justifyContent: 'center',
                                    zIndex: 4,
                                    cursor: 'pointer'
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
            </>
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