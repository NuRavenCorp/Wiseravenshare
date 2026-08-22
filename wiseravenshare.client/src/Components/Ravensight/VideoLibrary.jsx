import React, { useState, useEffect, useMemo } from 'react';
import { FaTrash, FaEdit, FaYoutube, FaEye, FaThumbsUp, FaComment, FaCalendar, FaSearch, FaVideo } from 'react-icons/fa';
import { ravensightAPI } from '../../Services/RavensightAPI';
import { useAuth } from '../../Contexts/AuthContext';
import { normalizeVideoRecord, getMergedLocalVideos, mergeVideoRecords, removeLocalVideo, upsertLocalVideo, RAVENSIGHT_LIBRARY_PROTOCOL } from '../../Services/ravensightVideoStore';

const getVideoIdentity = (video) => String(video?.id || video?.videoUrl || video?.mediaUrl || '').trim();

const isLocalManagedVideo = (video) => {
    const identity = getVideoIdentity(video);
    return identity.startsWith('local-video-') || identity.startsWith('post-video-');
};

const normalizeVideo = (video, index = 0) => normalizeVideoRecord(video, index);

const getAccessLabel = (accessProtocol) => {
    if (accessProtocol === RAVENSIGHT_LIBRARY_PROTOCOL.access.remoteUrl) {
        return 'Remote URL';
    }

    if (accessProtocol === RAVENSIGHT_LIBRARY_PROTOCOL.access.streamUrl) {
        return 'API Stream';
    }

    if (accessProtocol === RAVENSIGHT_LIBRARY_PROTOCOL.access.blobSession) {
        return 'Session Blob';
    }

    return 'Unavailable';
};

const getSourceLabel = (sourceType) => {
    if (sourceType === RAVENSIGHT_LIBRARY_PROTOCOL.source.libraryStore) {
        return 'Library Store';
    }

    if (sourceType === RAVENSIGHT_LIBRARY_PROTOCOL.source.feedCache) {
        return 'Feed Cache';
    }

    return 'Local Fallback';
};

const getLocalFallbackVideos = (currentUserId) => {
    return getMergedLocalVideos(currentUserId).map((video, index) => normalizeVideo(video, index));
};

const VideoLibrary = ({ onNotification }) => {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState('all');
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [editingVideo, setEditingVideo] = useState(null);
    const [selectedVideoIds, setSelectedVideoIds] = useState([]);
    const [deletingVideoIds, setDeletingVideoIds] = useState([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const { user } = useAuth();

    useEffect(() => {
        loadUserVideos();
    }, []);

    useEffect(() => {
        const handleSaved = () => {
            loadUserVideos();
        };

        const handlePostsUpdated = () => {
            loadUserVideos();
        };

        window.addEventListener(RAVENSIGHT_LIBRARY_PROTOCOL.events.videoSaved, handleSaved);
        window.addEventListener(RAVENSIGHT_LIBRARY_PROTOCOL.events.postsUpdated, handlePostsUpdated);

        return () => {
            window.removeEventListener(RAVENSIGHT_LIBRARY_PROTOCOL.events.videoSaved, handleSaved);
            window.removeEventListener(RAVENSIGHT_LIBRARY_PROTOCOL.events.postsUpdated, handlePostsUpdated);
        };
    }, [user?.id]);

    const loadUserVideos = async () => {
        setLoading(true);
        try {
            const response = await ravensightAPI.getUserVideos();
            const responseVideos = Array.isArray(response?.videos)
                ? response.videos.map((video, index) => normalizeVideo(video, index))
                : [];

            const fallbackVideos = getLocalFallbackVideos(user?.id);
            const mergedVideos = mergeVideoRecords(responseVideos, fallbackVideos)
                .filter((video) => !!video.videoUrl);

            setVideos(mergedVideos);
            setSelectedVideoIds([]);
            if (responseVideos.length === 0 && fallbackVideos.length > 0) {
                onNotification('Showing locally saved videos from your library.', 'info');
            }
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

    const removeVideoFromLocalCaches = (videoId) => {
        const normalizedId = String(videoId);
        removeLocalVideo(normalizedId);
        setVideos((prev) => prev.filter((video) => getVideoIdentity(video) !== normalizedId && String(video?.videoUrl || video?.mediaUrl || '') !== normalizedId));
        setSelectedVideoIds((prev) => prev.filter((id) => id !== normalizedId));
    };

    const deleteVideoOnce = async (video, { skipConfirm = false, notify = true } = {}) => {
        const videoId = getVideoIdentity(video);
        if (!videoId) {
            return false;
        }

        if (!skipConfirm) {
            const confirmed = window.confirm('Delete this video and remove it from Ravensight storage? This cannot be undone.');
            if (!confirmed) {
                return false;
            }
        }

        setDeletingVideoIds((prev) => [...new Set([...prev, videoId])]);
        try {
            if (!isLocalManagedVideo(video)) {
                const response = await ravensightAPI.deleteVideo(videoId);
                removeVideoFromLocalCaches(videoId);
                const blobDeleted = Boolean(response?.blobDeleted);
                if (notify) {
                    onNotification(
                        blobDeleted ? 'Video and blob storage object deleted.' : 'Video deleted. Storage cleanup may still be in progress.',
                        blobDeleted ? 'success' : 'warning'
                    );
                }
                return true;
            }

            removeVideoFromLocalCaches(videoId);
            if (notify) {
                onNotification('Local video removed from your library.', 'success');
            }
            return true;
        } catch (error) {
            console.error('Error deleting video:', error);
            if (notify) {
                onNotification('Delete failed. The video was kept in the library.', 'error');
            }
            return false;
        } finally {
            setDeletingVideoIds((prev) => prev.filter((id) => id !== videoId));
        }
    };

    const handleDeleteVideo = async (video) => {
        await deleteVideoOnce(video);
    };

    const handleBulkDelete = async () => {
        if (selectedVideoIds.length === 0) {
            return;
        }

        const confirmed = window.confirm(`Delete ${selectedVideoIds.length} selected video${selectedVideoIds.length === 1 ? '' : 's'}?`);
        if (!confirmed) {
            return;
        }

        setIsBulkDeleting(true);
        let deletedCount = 0;
        try {
            for (const id of selectedVideoIds) {
                const video = videos.find((item) => getVideoIdentity(item) === id);
                if (!video) {
                    continue;
                }

                // eslint-disable-next-line no-await-in-loop
                const deleted = await deleteVideoOnce(video, { skipConfirm: true, notify: false });
                if (deleted) {
                    deletedCount += 1;
                }
            }

            onNotification(`${deletedCount} selected video${deletedCount === 1 ? '' : 's'} deleted.`, deletedCount > 0 ? 'success' : 'warning');
        } finally {
            setIsBulkDeleting(false);
            setSelectedVideoIds([]);
        }
    };

    const handleUpdateVideo = async (videoId, updates) => {
        try {
            const updatedVideo = await ravensightAPI.updateVideo(videoId, updates);
            const normalized = normalizeVideo(updatedVideo);
            upsertLocalVideo(normalized);
            setVideos(prev => prev.map(v => v.id === videoId ? normalized : v));
            setEditingVideo(null);
            onNotification('Video updated successfully', 'success');
        } catch (error) {
            console.error('Error updating video:', error);
            onNotification('Failed to update video', 'error');
        }
    };

    const filteredVideos = useMemo(() => videos.filter(video => {
        const title = String(video?.title || '').toLowerCase();
        const description = String(video?.description || '').toLowerCase();
        const search = String(searchTerm || '').toLowerCase();
        const matchesSearch = title.includes(search) || description.includes(search);
        const matchesFilter = filter === 'all' ||
            (filter === 'published' && video.status === 'published') ||
            (filter === 'processing' && video.status === 'processing') ||
            (filter === 'failed' && video.status === 'failed');
        return matchesSearch && matchesFilter;
    }), [filter, searchTerm, videos]);

    const selectedCount = selectedVideoIds.length;
    const selectedVisibleCount = filteredVideos.filter((video) => selectedVideoIds.includes(getVideoIdentity(video))).length;
    const allVisibleSelected = filteredVideos.length > 0 && selectedVisibleCount === filteredVideos.length;

    const toggleVideoSelected = (videoId) => {
        const normalizedId = String(videoId);
        setSelectedVideoIds((prev) => (
            prev.includes(normalizedId)
                ? prev.filter((id) => id !== normalizedId)
                : [...prev, normalizedId]
        ));
    };

    const toggleSelectVisible = () => {
        if (allVisibleSelected) {
            setSelectedVideoIds((prev) => prev.filter((id) => !filteredVideos.some((video) => getVideoIdentity(video) === id)));
            return;
        }

        setSelectedVideoIds((prev) => [
            ...new Set([
                ...prev,
                ...filteredVideos.map((video) => getVideoIdentity(video)).filter(Boolean)
            ])
        ]);
    };

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
        const videoId = getVideoIdentity(video);
        const isSelected = selectedVideoIds.includes(videoId);
        const isDeleting = deletingVideoIds.includes(videoId);

        return (
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                overflow: 'hidden',
                marginBottom: '20px',
                border: isSelected ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                boxShadow: isSelected ? '0 0 0 1px rgba(79,116,214,0.25), 0 14px 28px rgba(0,0,0,0.18)' : 'none'
            }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'stretch' }}>
                    <div style={{ padding: '14px 0 0 14px' }}>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleVideoSelected(videoId)}
                            aria-label={`Select ${video.title}`}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--highlight-color)' }}
                        />
                    </div>
                    {video.videoUrl || video.mediaUrl ? (
                        <video
                            src={resolveMediaUrl(video.videoUrl || video.mediaUrl)}
                            controls
                            preload="metadata"
                            poster={resolveMediaUrl(video.thumbnailUrl) || undefined}
                            style={{
                                width: '160px',
                                height: '90px',
                                objectFit: 'cover'
                            }}
                        />
                    ) : (
                        <img
                            src={video.thumbnailUrl || 'https://via.placeholder.com/160x90?text=Video'}
                            alt={video.title}
                            style={{
                                width: '160px',
                                height: '90px',
                                objectFit: 'cover'
                            }}
                        />
                    )}
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
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        background: 'rgba(79,116,214,0.18)',
                                        color: '#9cc1ff'
                                    }}>
                                        Source: {getSourceLabel(video.sourceType)}
                                    </span>
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        background: 'rgba(255,255,255,0.08)',
                                        color: 'var(--text-color)'
                                    }}>
                                        Access: {getAccessLabel(video.accessProtocol)}
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
                    <div style={{ padding: '10px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
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
                            onClick={() => handleDeleteVideo(video)}
                            disabled={isDeleting || isBulkDeleting}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: isDeleting ? 'var(--highlight-color)' : '#f44336',
                                cursor: isDeleting || isBulkDeleting ? 'wait' : 'pointer',
                                fontSize: '16px'
                            }}
                            title={isDeleting ? 'Deleting...' : 'Delete video'}
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
        { label: 'Selected', value: selectedCount, icon: '✅' },
        { label: 'Total Views', value: videos.reduce((sum, v) => sum + (v.views || 0), 0).toLocaleString(), icon: '👁️' },
        { label: 'Permanent', value: videos.filter(v => v.storageMode === 'permanent').length, icon: '🗂️' }
    ];

    return (
        <div>
            <div style={{
                background: 'linear-gradient(135deg, rgba(79, 116, 214, 0.16), rgba(163, 58, 93, 0.18))',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '18px 20px',
                marginBottom: '18px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>Ravensight Library</div>
                        <h2 style={{ margin: '4px 0 0', fontSize: '26px' }}>Manage saved objects</h2>
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--light-color)' }}>
                            Protocol: Save to library first, then display by validated URL source with local fallback continuity.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={loadUserVideos}
                            style={{
                                padding: '9px 14px',
                                borderRadius: '999px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-color)',
                                cursor: 'pointer'
                            }}
                        >
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={toggleSelectVisible}
                            disabled={filteredVideos.length === 0}
                            style={{
                                padding: '9px 14px',
                                borderRadius: '999px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-color)',
                                cursor: filteredVideos.length === 0 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {allVisibleSelected ? 'Clear visible selection' : 'Select visible'}
                        </button>
                        <button
                            type="button"
                            onClick={handleBulkDelete}
                            disabled={selectedCount === 0 || isBulkDeleting}
                            style={{
                                padding: '9px 14px',
                                borderRadius: '999px',
                                border: 'none',
                                background: selectedCount === 0 ? 'rgba(244,67,54,0.35)' : 'linear-gradient(135deg, #ef4444, #c2410c)',
                                color: '#fff',
                                cursor: selectedCount === 0 || isBulkDeleting ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {isBulkDeleting ? 'Deleting...' : `Delete selected (${selectedCount})`}
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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

            {selectedCount > 0 && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginBottom: '14px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(79,116,214,0.35)',
                    background: 'rgba(79,116,214,0.12)'
                }}>
                    <div style={{ fontSize: '13px' }}>
                        {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
                    </div>
                    <button
                        type="button"
                        onClick={() => setSelectedVideoIds([])}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '999px',
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}
                    >
                        Clear selection
                    </button>
                </div>
            )}

            {/* Search and Filter */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(280px, 1fr) 180px',
                gap: '15px',
                marginBottom: '20px'
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

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {['all', 'published', 'processing', 'failed'].map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => setFilter(option)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '999px',
                            border: '1px solid var(--border-color)',
                            background: filter === option ? 'var(--highlight-color)' : 'rgba(255,255,255,0.03)',
                            color: 'var(--text-color)',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                        }}
                    >
                        {option}
                    </button>
                ))}
            </div>

            {/* Video List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                </div>
            ) : filteredVideos.length > 0 ? (
                <div style={{ display: 'grid', gap: '14px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '2px' }}>
                        Showing {filteredVideos.length} of {videos.length} saved object{videos.length === 1 ? '' : 's'}
                    </div>
                    {filteredVideos.map(video => (
                        <VideoCard key={video.id} video={video} />
                    ))}
                </div>
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