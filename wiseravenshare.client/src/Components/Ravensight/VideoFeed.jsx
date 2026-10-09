import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaExpand, FaVideo, FaUsers, FaTrash } from 'react-icons/fa';
import '@flaticon/flaticon-uicons/css/all/all.css';
import Hls from 'hls.js';
import { ravensightAPI } from '../../Services/RavensightAPI';
import { socialService } from '../../Services/socialService';
import { useAuth } from '../../Contexts/AuthContext';
import { normalizeVideoRecord, getMergedLocalVideos, upsertLocalVideo, upsertLocalVideos, removeLocalVideo, RAVENSIGHT_LIBRARY_PROTOCOL } from '../../Services/ravensightVideoStore';
import CollaborativeScriptRoom from './CollaborativeScriptRoom';
import MultiCameraMonitor from './MultiCameraMonitor';
import MonitorArray from './MonitorArray';
import './VideoFeed.css';
import { resolveMediaUrl } from '../../utils/mediaUtils';
import { sharePost } from '../../utils/socialShare';
import { useCollaborationHub } from '../../hooks/useCollaborationHub';
import MultimediaPlayer from './MultimediaPlayer';
import { useSavedMedia } from '../../hooks/useSavedMedia';

const attachHls = (videoEl, src) => {
    if (!src) return;
    if (src.endsWith('.m3u8')) {
        if (Hls.isSupported()) {
            const hls = new Hls({ startLevel: -1 });
            hls.loadSource(src);
            hls.attachMedia(videoEl);
            videoEl._hlsInstance = hls;
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari native HLS
            videoEl.src = src;
        }
    } else {
        videoEl.src = src;
    }
};

/*
 * YouTube detection.
 *
 * A Ravensight record is a YouTube embed when either its mediaType marker says
 * so, or its resolved media URL points at youtube.com / youtu.be. This mirrors
 * the predicate MultimediaPlayer applies to its own `src` so the feed and the
 * player never disagree about which renderer a record needs.
 */
const YOUTUBE_URL_PATTERN = /(?:youtube\.com|youtu\.be)/i;

const normalizeMediaSource = (value, fallback = '') => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:video/')) {
        return trimmed;
    }

    return resolveMediaUrl(trimmed) || fallback;
};

const normalizeVideo = (video, index = 0) => {
    const normalized = normalizeVideoRecord(video, index);
    return {
        ...normalized,
        videoUrl: normalizeMediaSource(normalized.videoUrl || normalized.mediaUrl || '', ''),
        thumbnailUrl: normalizeMediaSource(normalized.thumbnailUrl || '', ''),
        channelAvatar: normalizeMediaSource(normalized.channelAvatar || '', '')
    };
};

/*
 * A record needs the YouTube embed renderer when its media URL resolves to a
 * YouTube host. Only the URL is authoritative here: the record's `mediaType`
 * is not part of the normalized shape (see normalizeVideoRecord), and a
 * self-hosted Spaces URL never matches this pattern, so the native <video>
 * path is the default.
 */
const isYouTubeRecord = (video) => {
    if (!video) return false;
    const candidate = [video.videoUrl, video.mediaUrl, video.youtubeUrl]
        .find((value) => typeof value === 'string' && value.trim());
    return typeof candidate === 'string' && YOUTUBE_URL_PATTERN.test(candidate);
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
    const [filter, setFilter] = useState('all'); // all, trending, subscribed, my_videos
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [sharingVideoIds, setSharingVideoIds] = useState([]);
    const [savingVideoIds, setSavingVideoIds] = useState([]);
    const [scriptVideo, setScriptVideo] = useState(null);
    const [activePodcastCommand, setActivePodcastCommand] = useState(null);
    const [monitorSlots, setMonitorSlots] = useState(['', '', '']);
    const [monitorMirror, setMonitorMirror] = useState([true, true, true]);
    const observerRef = useRef();
    const { user } = useAuth();
    const { saveMedia } = useSavedMedia();
    const {
        joinPodcastBridge,
        leavePodcastBridge,
        publishPodcastFootageSelection,
        acknowledgePodcastCommand,
        onEvent
    } = useCollaborationHub();

    const monitorCandidates = useMemo(() => {
        return videos
            .map((video, index) => normalizeVideo(video, index))
            .filter((video) => Boolean(resolveMediaUrl(video.videoUrl || video.mediaUrl || '')));
    }, [videos]);

    useEffect(() => {
        if (monitorCandidates.length === 0) {
            setMonitorSlots(['', '', '']);
            return;
        }

        setMonitorSlots((current) => current.map((slotId, index) => {
            const existing = monitorCandidates.find((candidate) => String(candidate.id || '') === slotId);
            if (existing) {
                return slotId;
            }

            const fallback = monitorCandidates[index] || monitorCandidates[0];
            return String(fallback?.id || '');
        }));
    }, [monitorCandidates]);

    useEffect(() => {
        loadVideos();
    }, [filter, page]);

    useEffect(() => {
        joinPodcastBridge('main').catch(() => null);

        const disposeCommand = onEvent('PodcastCommandIssued', (event) => {
            const command = event?.command;
            if (!command) {
                return;
            }

            setActivePodcastCommand(command);
            if (String(command.command || '').toLowerCase() === 'cut') {
                onNotification?.('Podcast team issued CUT on live footage.', 'warning');
            }
        });

        const disposeResponse = onEvent('PodcastCommandResponse', (event) => {
            const command = event?.command;
            if (!command) {
                return;
            }

            setActivePodcastCommand(command);
        });

        return () => {
            disposeCommand?.();
            disposeResponse?.();
            leavePodcastBridge('main').catch(() => null);
        };
    }, [joinPodcastBridge, leavePodcastBridge, onEvent, onNotification]);

    useEffect(() => {
        const handleVideoSaved = () => {
            if (page === 1) {
                loadVideos();
            }
        };

        window.addEventListener(RAVENSIGHT_LIBRARY_PROTOCOL.events.videoSaved, handleVideoSaved);
        return () => window.removeEventListener(RAVENSIGHT_LIBRARY_PROTOCOL.events.videoSaved, handleVideoSaved);
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

            if (responseVideos.length > 0 && page === 1) {
                upsertLocalVideos(responseVideos, { emitEvent: false });
            }

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

    const handleDeleteVideo = async (video) => {
        const videoId = String(video?.id || video?.videoUrl || video?.mediaUrl || '').trim();
        if (!videoId) return;

        const confirmed = window.confirm('Delete this video from Ravensight Video Studio? This action cannot be undone.');
        if (!confirmed) return;

        try {
            await ravensightAPI.deleteVideo(videoId);
            removeLocalVideo(videoId);
            setVideos((prev) => prev.filter((item) => String(item?.id || item?.videoUrl || item?.mediaUrl || '') !== videoId));
            onNotification('Video deleted successfully from Ravensight Video Studio.', 'success');
        } catch {
            removeLocalVideo(videoId);
            setVideos((prev) => prev.filter((item) => String(item?.id || item?.videoUrl || item?.mediaUrl || '') !== videoId));
            onNotification('Video removed from your local feed.', 'success');
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

    const handleSaveToLibrary = async (video) => {
        const videoId = String(video?.id || video?.videoUrl || video?.mediaUrl || '').trim();
        const mediaUrl = String(video?.videoUrl || video?.mediaUrl || '').trim();
        if (!mediaUrl || mediaUrl.startsWith('blob:') || mediaUrl.startsWith('file:')) {
            onNotification('This feed item has no public media URL to save.', 'warning');
            return;
        }

        setSavingVideoIds((prev) => [...new Set([...prev, videoId])]);
        try {
            await saveMedia({
                title: video?.title || 'Saved Feed Video',
                description: video?.description || '',
                mediaType: 'video',
                mediaUrl,
                thumbnailUrl: video?.thumbnailUrl || '',
                isVisibleInFeed: false,
                tags: Array.isArray(video?.tags) ? video.tags : [],
                fileSizeBytes: Number(video?.fileSizeBytes || 0) || null,
                durationSeconds: Number(video?.durationSeconds || 0) || null,
            });
            onNotification('Saved to My Library.', 'success');
        } catch (error) {
            onNotification(
                error?.message || 'Failed to save to My Library.',
                'error'
            );
        } finally {
            setSavingVideoIds((prev) => prev.filter((id) => id !== videoId));
        }
    };

    const handleShareVideo = async (video) => {
        const videoId = String(video?.id || video?.videoUrl || video?.mediaUrl || '').trim();
        if (!videoId) {
            onNotification('Cannot share this item yet. Missing video identity.', 'warning');
            return;
        }

        setSharingVideoIds((prev) => [...new Set([...prev, videoId])]);
        try {
            // Native share sheet / clipboard first; cross-post only when the user opts in via the sheet.
            await sharePost({ item: video, currentUser: null, onNotification });
        } finally {
            setSharingVideoIds((prev) => prev.filter((id) => id !== videoId));
        }
    };

    const sendVideoToPodcastBridge = async (video) => {
        const mediaUrl = String(video?.videoUrl || video?.mediaUrl || '').trim();
        if (!mediaUrl) {
            onNotification('Cannot send to podcast bridge without a playable video URL.', 'warning');
            return;
        }

        try {
            await publishPodcastFootageSelection('main', {
                footageId: String(video?.id || '').trim() || undefined,
                videoId: String(video?.id || '').trim(),
                title: String(video?.title || 'Ravensight Footage').trim(),
                mediaUrl,
                thumbnailUrl: String(video?.thumbnailUrl || '').trim(),
                sourceUserId: String(user?.id || '').trim(),
                sourceUserName: String(user?.name || user?.displayName || user?.username || 'Videographer').trim()
            });
            onNotification('Footage sent to Podcast Control Room.', 'success');
        } catch (error) {
            onNotification(error?.message || 'Unable to send footage to podcast bridge.', 'error');
        }
    };

    const acknowledgeCutCommand = async () => {
        const commandId = String(activePodcastCommand?.commandId || '').trim();
        if (!commandId) {
            return;
        }

        try {
            await acknowledgePodcastCommand('main', commandId, 'CUT acknowledged by videographer. Switching framing now.');
            onNotification('Cut command acknowledged to podcast team.', 'success');
        } catch (error) {
            onNotification(error?.message || 'Unable to acknowledge command.', 'error');
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

    const actionIconStyle = {
        fontSize: '16px',
        lineHeight: 1,
        width: '16px',
        textAlign: 'center'
    };

    const VideoCard = ({ video }) => {
        const [isPlaying, setIsPlaying] = useState(false);
        const [isMuted, setIsMuted] = useState(true);
        const [isBanging, setIsBanging] = useState(false);
        const videoRef = useRef(null);
        const videoIdentity = String(video?.id || video?.videoUrl || video?.mediaUrl || '').trim();
        const isSharing = sharingVideoIds.includes(videoIdentity);
        const isSaving = savingVideoIds.includes(videoIdentity);
        const isYouTube = isYouTubeRecord(video);

        const resolvedSrc = resolveMediaUrl(video.videoUrl);
        useEffect(() => {
            const el = videoRef.current;
            if (!el) return;
            attachHls(el, resolvedSrc);
            return () => {
                if (el._hlsInstance) {
                    el._hlsInstance.destroy();
                    el._hlsInstance = null;
                }
            };
        }, [resolvedSrc]);

        const triggerPlayback = async () => {
            if (!videoRef.current) return false;

            setIsBanging(true);
            try {
                await videoRef.current.play();
                return true;
            } catch {
                try {
                    videoRef.current.muted = true;
                    setIsMuted(true);
                    await videoRef.current.play();
                    return true;
                } catch {
                    return false;
                }
            } finally {
                window.setTimeout(() => {
                    setIsBanging(false);
                }, 700);
            }
        };

        const handlePlayPause = async () => {
            if (videoRef.current) {
                if (isPlaying) {
                    videoRef.current.pause();
                    setIsPlaying(false);
                    return;
                }

                const started = await triggerPlayback();
                setIsPlaying(started);
                if (!started) {
                    onNotification('Playback could not start for this video.', 'warning');
                }
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
                        textShadow: '0 0 12px rgba(255,255,255,0.5)',
                        cursor: 'pointer'
                    }}
                        onClick={handlePlayPause}
                        title="Play or pause video"
                    >
                        ✋
                    </div>
                    <div style={{ position: 'relative' }} onClick={isYouTube ? undefined : handlePlayPause}>
                        {isYouTube ? (
                            <MultimediaPlayer
                                mediaContentId={video.id}
                                src={video.videoUrl}
                                mediaType={"youtube"}
                                title={video.title}
                                thumbnailUrl={resolveMediaUrl(video.thumbnailUrl)}
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                poster={resolveMediaUrl(video.thumbnailUrl)}
                                muted={isMuted}
                                loop
                                playsInline
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    background: '#000',
                                    borderRadius: '8px',
                                    border: '3px solid rgba(0,0,0,0.8)',
                                    boxShadow: 'inset 0 0 18px rgba(255,255,255,0.08)'
                                }}
                            />
                        )}

                        {/* Duration Badge */}
                        {video.duration && (
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
                        )}

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
                        {video.channelAvatar ? (
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
                        ) : (
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'var(--secondary-color)',
                                fontWeight: 700,
                                fontSize: '14px'
                            }}>
                                {String(video.channelName || 'W').charAt(0).toUpperCase()}
                            </div>
                        )}
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
                            <i className="fi fi-br-heart" aria-hidden="true" style={actionIconStyle} /> {video.likes}
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
                            <i className="fi fi-br-comment-dots" aria-hidden="true" style={actionIconStyle} /> {video.comments}
                        </button>
                        <button style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-color)',
                            cursor: isSharing ? 'wait' : 'pointer',
                            opacity: isSharing ? 0.6 : 1
                        }}
                            onClick={() => handleShareVideo(video)}
                            disabled={isSharing}
                            title="Share this video to connected social channels"
                        >
                            <i className="fi fi-br-stamp" aria-hidden="true" style={actionIconStyle} /> {isSharing ? 'Sharing...' : 'Share'}
                        </button>
                        <button
                            onClick={() => handleSaveToLibrary(video)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-color)',
                                cursor: isSaving ? 'wait' : 'pointer',
                                opacity: isSaving ? 0.6 : 1
                            }}
                            disabled={isSaving}
                            title="Save this feed item to My Library"
                        >
                            <i className="fi fi-br-bookmark" aria-hidden="true" style={actionIconStyle} /> {isSaving ? 'Saving...' : 'Bookmark'}
                        </button>
                        <button
                            onClick={() => setScriptVideo(video)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-color)',
                                cursor: 'pointer'
                            }}
                            title="Open collaborative script room"
                        >
                            <FaUsers /> Script Room
                        </button>
                        <button
                            onClick={() => sendVideoToPodcastBridge(video)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'none',
                                border: 'none',
                                color: '#86efac',
                                cursor: 'pointer'
                            }}
                            title="Send this footage to Podcast Control Room"
                        >
                            🎙 Send to Podcast
                        </button>
                        <button
                            onClick={() => handleDeleteVideo(video)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'none',
                                border: 'none',
                                color: '#f44336',
                                cursor: 'pointer'
                            }}
                            title="Delete this video from Ravensight"
                        >
                            <FaTrash /> Delete
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
        <div className="wr-feed">
            {activePodcastCommand && (
                <div className="wr-feed__command">
                    <div>
                        <div className="wr-feed__command-label">Podcast Team Command</div>
                        <div className="wr-feed__command-text">
                            {String(activePodcastCommand.command || '').toUpperCase()} {activePodcastCommand.note ? `- ${activePodcastCommand.note}` : ''}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={acknowledgeCutCommand}
                        className="wr-feed__command-ack"
                    >
                        Acknowledge
                    </button>
                </div>
            )}

            {/* Multi-Camera Monitors */}
            <div style={{ marginBottom: 20 }}>
                <MultiCameraMonitor />
            </div>

            {/* Filter Bar */}
            <div className="wr-feed__filters">
                {filters.map(f => (
                    <button
                        key={f.id}
                        onClick={() => {
                            setFilter(f.id);
                            setPage(1);
                        }}
                        className={`wr-feed__filter${filter === f.id ? ' wr-feed__filter--active' : ''}`}
                        aria-pressed={filter === f.id}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Video Grid */}
            <div className="wr-feed__grid">
                {videos.map(video => (
                    <VideoCard key={video.id} video={video} />
                ))}
            </div>

            {/* Loading Indicator */}
            {loading && (
                <div className="wr-feed__loading">
                    <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                </div>
            )}

            {/* Sentinel for Infinite Scroll */}
            <div id="feed-sentinel" className="wr-feed__sentinel"></div>

            {/* Empty State */}
            {!loading && videos.length === 0 && (
                <div className="wr-feed__empty">
                    <FaVideo className="wr-feed__empty-icon" />
                    <h3>No videos found</h3>
                    <p>Check back later for new content!</p>
                </div>
            )}

            <MonitorArray
                candidates={monitorCandidates}
                slots={monitorSlots}
                mirrors={monitorMirror}
                onSelectSource={(slotIndex, nextId) =>
                    setMonitorSlots((current) =>
                        current.map((slot, idx) => (idx === slotIndex ? nextId : slot))
                    )
                }
                onToggleMirror={(slotIndex) =>
                    setMonitorMirror((current) =>
                        current.map((mirror, idx) => (idx === slotIndex ? !mirror : mirror))
                    )
                }
            />

            {scriptVideo && (
                <CollaborativeScriptRoom
                    video={scriptVideo}
                    onClose={() => setScriptVideo(null)}
                    onNotification={onNotification}
                />
            )}
        </div>
    );
};

export default VideoFeed;
