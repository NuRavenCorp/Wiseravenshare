import React, { useState, useEffect } from 'react';
import { FaTrash, FaEdit, FaYoutube, FaEye, FaThumbsUp, FaComment, FaCalendar, FaSearch, FaVideo } from 'react-icons/fa';
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
    title: video.title || 'Saved Video',
    description: video.description || '',
    tags: Array.isArray(video.tags) ? video.tags : [],
    videoUrl: video.videoUrl || video.mediaUrl || '',
    thumbnailUrl: video.thumbnailUrl || '',
    status: video.status || 'published',
    privacyStatus: video.privacyStatus || 'unlisted',
    storageMode: video.storageMode || 'temporary',
    retentionStatus: video.retentionStatus || 'active',
    expiresAt: video.expiresAt || null,
    youtubeUrl: video.youtubeUrl || null,
    tiktokUrl: video.tiktokUrl || null,
    facebookUrl: video.facebookUrl || null,
    views: Number(video.views) || 0,
    likes: Number(video.likes) || 0,
    comments: Number(video.comments) || 0,
    createdAt: video.createdAt || new Date().toISOString(),
    updatedAt: video.updatedAt || video.createdAt || new Date().toISOString(),
    userId: video.userId || video.user?.id || null,
    channelName: video.channelName || video.user?.name || 'WiseRaven Creator',
    channelAvatar: video.channelAvatar || video.user?.avatar || ''
});

const getLocalFallbackVideos = (currentUserId) => {
    const cachedVideos = safeReadJson('wiseRavensightVideos', [])
        .map((video, index) => normalizeVideo(video, index));

    const recentPosts = safeReadJson('wiseRecentPosts', [])
        .filter((post) => post?.mediaType === 'video' && (post?.mediaUrl || post?.videoUrl))
        .map((post, index) => normalizeVideo({
            id: `post-video-${post.id || index}`,
            title: post.content?.slice(0, 70) || 'Saved Video',
            description: post.content || '',
            videoUrl: post.mediaUrl || post.videoUrl,
            thumbnailUrl: post.thumbnailUrl || '',
            createdAt: post.createdAt,
            userId: post.userId || post.user?.id,
            channelName: post.user?.name || 'WiseRaven Creator',
            channelAvatar: post.user?.avatar || ''
        }, index));

    const combined = [...cachedVideos, ...recentPosts]
        .filter((video) => !!video.videoUrl)
        .filter((video, idx, all) => all.findIndex((item) => item.videoUrl === video.videoUrl) === idx);

    return currentUserId
        ? combined.filter((video) => !video.userId || video.userId === currentUserId)
        : combined;
};

const VideoLibrary = ({ onNotification }) => {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState('all');
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [editingVideo, setEditingVideo] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        loadUserVideos();
    }, []);

    const loadUserVideos = async () => {
        setLoading(true);
        try {
            const response = await ravensightAPI.getUserVideos();
            const responseVideos = Array.isArray(response?.videos)
                ? response.videos.map((video, index) => normalizeVideo(video, index))
                : [];

            if (responseVideos.length === 0) {
                const fallbackVideos = getLocalFallbackVideos(user?.id);
                setVideos(fallbackVideos);
                if (fallbackVideos.length > 0) {
                    onNotification('Showing locally saved videos from your library.', 'info');
                }
                return;
            }

            setVideos(responseVideos);
        } catch (error) {
            console.error('Error loading videos:', error);
            const fallbackVideos = getLocalFallbackVideos(user?.id);
            setVideos(fallbackVideos);
            if (fallbackVideos.length > 0) {
                onNotification('Showing locally saved videos while the service is unavailable.', 'warning');
            } else {
                onNotification('Failed to load videos', 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteVideo = async (videoId) => {
        if (window.confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
            try {
                await ravensightAPI.deleteVideo(videoId);
                setVideos(prev => prev.filter(v => v.id !== videoId));
                onNotification('Video deleted successfully', 'success');
            } catch (error) {
                console.error('Error deleting video:', error);
                onNotification('Failed to delete video', 'error');
            }
        }
    };

    const handleUpdateVideo = async (videoId, updates) => {
        try {
            const updatedVideo = await ravensightAPI.updateVideo(videoId, updates);
            setVideos(prev => prev.map(v => v.id === videoId ? updatedVideo : v));
            setEditingVideo(null);
            onNotification('Video updated successfully', 'success');
        } catch (error) {
            console.error('Error updating video:', error);
            onNotification('Failed to update video', 'error');
        }
    };

    const filteredVideos = videos.filter(video => {
        const title = String(video?.title || '').toLowerCase();
        const description = String(video?.description || '').toLowerCase();
        const search = String(searchTerm || '').toLowerCase();
        const matchesSearch = title.includes(search) || description.includes(search);
        const matchesFilter = filter === 'all' ||
            (filter === 'published' && video.status === 'published') ||
            (filter === 'processing' && video.status === 'processing') ||
            (filter === 'failed' && video.status === 'failed');
        return matchesSearch && matchesFilter;
    });

    const getStatusBadge = (status) => {
        switch (status) {
            case 'published':
                return { color: '#4caf50', text: 'Published' };
            case 'processing':
                return { color: '#ff9800', text: 'Processing' };
            case 'failed':
                return { color: '#f44336', text: 'Failed' };
            default:
                return { color: '#9e9e9e', text: 'Draft' };
        }
    };

    const VideoCard = ({ video }) => {
        const [isEditing, setIsEditing] = useState(false);
        const [editData, setEditData] = useState({
            title: video.title,
            description: video.description || '',
            tags: video.tags || []
        });
        const status = getStatusBadge(video.status);

        return (
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                overflow: 'hidden',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <img
                        src={video.thumbnailUrl || 'https://via.placeholder.com/160x90?text=Video'}
                        alt={video.title}
                        style={{
                            width: '160px',
                            height: '90px',
                            objectFit: 'cover'
                        }}
                    />
                    <div style={{ flex: 1, padding: '10px 10px 10px 0' }}>
                        {isEditing ? (
                            <div>
                                <input
                                    type="text"
                                    value={editData.title}
                                    onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-color)',
                                        marginBottom: '8px'
                                    }}
                                />
                                <textarea
                                    value={editData.description}
                                    onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                                    rows="2"
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-color)',
                                        marginBottom: '8px',
                                        resize: 'vertical'
                                    }}
                                />
                                <div>
                                    <button
                                        onClick={() => handleUpdateVideo(video.id, editData)}
                                        style={{
                                            padding: '5px 15px',
                                            borderRadius: '15px',
                                            border: 'none',
                                            background: '#4caf50',
                                            color: 'white',
                                            cursor: 'pointer',
                                            marginRight: '8px'
                                        }}
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        style={{
                                            padding: '5px 15px',
                                            borderRadius: '15px',
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{video.title}</div>
                                <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginBottom: '5px' }}>
                                    {video.description?.substring(0, 100)}...
                                </div>
                                <div style={{ display: 'flex', gap: '15px', fontSize: '12px', color: 'var(--highlight-color)', marginBottom: '5px' }}>
                                    <span><FaEye /> {video.views?.toLocaleString()} views</span>
                                    <span><FaThumbsUp /> {video.likes}</span>
                                    <span><FaComment /> {video.comments}</span>
                                    <span><FaCalendar /> {new Date(video.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        background: status.color + '20',
                                        color: status.color
                                    }}>
                                        {status.text}
                                    </span>
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        background: video.storageMode === 'permanent' ? '#4caf50' : '#ff9800',
                                        color: video.storageMode === 'permanent' ? '#fff' : '#fff'
                                    }}>
                                        {video.storageMode === 'permanent' ? 'Permanent storage' : 'Temporary storage'}
                                    </span>
                                    {video.expiresAt && (
                                        <span style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            Expires {new Date(video.expiresAt).toLocaleDateString()}
                                        </span>
                                    )}
                                    {video.youtubeUrl && (
                                        <a
                                            href={video.youtubeUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#ff0000', fontSize: '14px' }}
                                        >
                                            <FaYoutube /> Watch on YouTube
                                        </a>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    <div style={{ padding: '10px', display: 'flex', gap: '8px' }}>
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--highlight-color)',
                                    cursor: 'pointer',
                                    fontSize: '16px'
                                }}
                            >
                                <FaEdit />
                            </button>
                        )}
                        <button
                            onClick={() => handleDeleteVideo(video.id)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#f44336',
                                cursor: 'pointer',
                                fontSize: '16px'
                            }}
                        >
                            <FaTrash />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const stats = [
        { label: 'Total Videos', value: videos.length, icon: '🎥' },
        { label: 'Total Views', value: videos.reduce((sum, v) => sum + (v.views || 0), 0).toLocaleString(), icon: '👁️' },
        { label: 'Total Likes', value: videos.reduce((sum, v) => sum + (v.likes || 0), 0).toLocaleString(), icon: '❤️' },
        { label: 'YouTube Published', value: videos.filter(v => v.youtubeUrl).length, icon: '📺' }
    ];

    return (
        <div>
            {/* Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '15px',
                marginBottom: '20px'
            }}>
                {stats.map(stat => (
                    <div key={stat.label} style={{
                        background: 'var(--secondary-color)',
                        borderRadius: '12px',
                        padding: '15px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '28px', marginBottom: '5px' }}>{stat.icon}</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stat.value}</div>
                        <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Search and Filter */}
            <div style={{
                display: 'flex',
                gap: '15px',
                marginBottom: '20px',
                flexWrap: 'wrap'
            }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <FaSearch style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--highlight-color)'
                    }} />
                    <input
                        type="text"
                        placeholder="Search your videos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 10px 10px 35px',
                            borderRadius: '25px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)'
                        }}
                    />
                </div>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{
                        padding: '10px 15px',
                        borderRadius: '25px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--card-bg)',
                        color: 'var(--text-color)'
                    }}
                >
                    <option value="all">All Videos</option>
                    <option value="published">Published</option>
                    <option value="processing">Processing</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            {/* Video List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                </div>
            ) : filteredVideos.length > 0 ? (
                filteredVideos.map(video => (
                    <VideoCard key={video.id} video={video} />
                ))
            ) : (
                <div style={{
                    textAlign: 'center',
                    padding: '60px',
                    color: 'var(--highlight-color)'
                }}>
                    <FaVideo style={{ fontSize: '64px', marginBottom: '20px' }} />
                    <h3>No videos found</h3>
                    <p>Upload your first video to get started!</p>
                </div>
            )}
        </div>
    );
};

export default VideoLibrary;