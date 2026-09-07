import React, { useEffect, useMemo, useState } from 'react';
import { FiBookOpen, FiMusic, FiVideo, FiPlay, FiImage, FiFile } from 'react-icons/fi';
import AudioPlayer from '../Components/Ravensight/AudioPlayer';
import { useNotification } from '../Contexts/NotificationContext';
import { useAuth } from '../Contexts/AuthContext';
import { apiService } from '../Services/api';
import { ravensightAPI } from '../Services/RavensightAPI';

const normalizeTrack = (track) => {
    if (!track || typeof track !== 'object') return null;
    const mediaUrl = String(
        track.mediaUrl
        || track.url
        || track.fileUrl
        || track.publicUrl
        || track.MediaUrl
        || track.Url
        || ''
    ).trim();

    return {
        id: String(track.id || track.Id || `track-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        title: String(track.title || track.Title || 'Untitled').trim(),
        artist: String(track.artist || track.Artist || '').trim(),
        album: String(track.album || track.Album || '').trim(),
        mediaUrl,
        url: mediaUrl,
        type: 'music'
    };
};

const normalizeVideo = (video) => {
    if (!video || typeof video !== 'object') return null;
    return {
        id: String(video.id || video.videoId || ''),
        title: String(video.title || 'Untitled video').trim(),
        description: String(video.description || '').trim(),
        videoUrl: String(video.videoUrl || video.mediaUrl || video.filePath || '').trim(),
        createdAt: String(video.createdAt || video.uploadedAt || ''),
        type: 'video'
    };
};

const normalizePhoto = (photo) => {
    if (!photo || typeof photo !== 'object') return null;
    const imageUrl = String(
        photo.mediaUrl
        || photo.url
        || photo.imageUrl
        || photo.fileUrl
        || photo.publicUrl
        || ''
    ).trim();

    return {
        id: String(photo.id || `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        title: String(photo.title || photo.fileName || 'Untitled photo').trim(),
        description: String(photo.description || '').trim(),
        imageUrl,
        url: imageUrl,
        uploadedAt: String(photo.uploadedAt || photo.createdAt || new Date().toISOString()),
        type: 'photo'
    };
};

const MyLibraryPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const { addToast } = useNotification();
    const [activeTab, setActiveTab] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [musicTracks, setMusicTracks] = useState([]);
    const [videos, setVideos] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [musicSearch, setMusicSearch] = useState('');
    const [videoSearch, setVideoSearch] = useState('');
    const [photoSearch, setPhotoSearch] = useState('');
    const [currentTrack, setCurrentTrack] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const loadLibrary = async () => {
            setIsLoading(true);
            try {
                const [musicResult, videoResult, photoResult] = await Promise.allSettled([
                    apiService.getMusicLibrary(),
                    ravensightAPI.getUserVideos(user?.id || null),
                    apiService.getLibraryMedia?.({ mediaType: 'image' }).catch(() => ({ data: [] }))
                ]);

                if (!isMounted) return;

                const nextTracks = musicResult.status === 'fulfilled'
                    ? (Array.isArray(musicResult.value?.data) ? musicResult.value.data : [])
                        .map(normalizeTrack)
                        .filter(Boolean)
                    : [];
                const nextVideos = videoResult.status === 'fulfilled'
                    ? (Array.isArray(videoResult.value?.videos) ? videoResult.value.videos : [])
                        .map(normalizeVideo)
                        .filter(Boolean)
                    : [];
                const nextPhotos = photoResult.status === 'fulfilled'
                    ? (Array.isArray(photoResult.value?.data) ? photoResult.value.data : [])
                        .map(normalizePhoto)
                        .filter(Boolean)
                    : [];

                setMusicTracks(nextTracks);
                setVideos(nextVideos);
                setPhotos(nextPhotos);
                if (nextTracks.length > 0) {
                    setCurrentTrack(nextTracks[0]);
                } else {
                    setCurrentTrack(null);
                }
            } catch (error) {
                addToast(error?.message || 'Unable to load your library.', 'error');
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void loadLibrary();
        return () => {
            isMounted = false;
        };
    }, [addToast, user?.id]);

    const filteredTracks = useMemo(() => {
        const query = musicSearch.trim().toLowerCase();
        if (!query) return musicTracks;
        return musicTracks.filter((track) =>
            String(track.title || '').toLowerCase().includes(query)
            || String(track.artist || '').toLowerCase().includes(query)
            || String(track.album || '').toLowerCase().includes(query)
        );
    }, [musicTracks, musicSearch]);

    const filteredVideos = useMemo(() => {
        const query = videoSearch.trim().toLowerCase();
        if (!query) return videos;
        return videos.filter((video) =>
            String(video.title || '').toLowerCase().includes(query)
            || String(video.description || '').toLowerCase().includes(query)
        );
    }, [videos, videoSearch]);

    const filteredPhotos = useMemo(() => {
        const query = photoSearch.trim().toLowerCase();
        if (!query) return photos;
        return photos.filter((photo) =>
            String(photo.title || '').toLowerCase().includes(query)
            || String(photo.description || '').toLowerCase().includes(query)
        );
    }, [photos, photoSearch]);

    const allMediaItems = useMemo(() => 
        [...filteredTracks, ...filteredVideos, ...filteredPhotos], 
        [filteredTracks, filteredVideos, filteredPhotos]
    );

    const totalItems = useMemo(() => ({
        all: allMediaItems.length,
        music: musicTracks.length,
        photos: photos.length,
        videos: videos.length
    }), [allMediaItems, musicTracks, photos, videos]);

    return (
        <section style={{ display: 'grid', gap: '14px' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px', background: 'var(--card-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '20px' }}>
                    <FiBookOpen /> My Media Library
                </div>
                <div style={{ marginTop: '6px', color: 'var(--light-color)', fontSize: '13px' }}>
                    All your uploaded photos, music, videos, and more in one unified library.
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    style={{
                        border: activeTab === 'all' ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                        background: activeTab === 'all' ? 'rgba(255,255,255,0.08)' : 'var(--card-bg)',
                        color: 'var(--text-color)',
                        borderRadius: '999px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px'
                    }}
                >
                    <FiFile style={{ marginRight: '6px', display: 'inline' }} />
                    All ({totalItems.all})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('photos')}
                    style={{
                        border: activeTab === 'photos' ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                        background: activeTab === 'photos' ? 'rgba(255,255,255,0.08)' : 'var(--card-bg)',
                        color: 'var(--text-color)',
                        borderRadius: '999px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px'
                    }}
                >
                    <FiImage style={{ marginRight: '6px', display: 'inline' }} />
                    Photos ({totalItems.photos})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('music')}
                    style={{
                        border: activeTab === 'music' ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                        background: activeTab === 'music' ? 'rgba(255,255,255,0.08)' : 'var(--card-bg)',
                        color: 'var(--text-color)',
                        borderRadius: '999px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px'
                    }}
                >
                    <FiMusic style={{ marginRight: '6px', display: 'inline' }} />
                    Music ({totalItems.music})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('videos')}
                    style={{
                        border: activeTab === 'videos' ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                        background: activeTab === 'videos' ? 'rgba(255,255,255,0.08)' : 'var(--card-bg)',
                        color: 'var(--text-color)',
                        borderRadius: '999px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px'
                    }}
                >
                    <FiVideo style={{ marginRight: '6px', display: 'inline' }} />
                    Videos ({totalItems.videos})
                </button>
            </div>

            {isLoading ? (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', background: 'var(--card-bg)' }}>
                    Loading your library...
                </div>
            ) : (
                <>
                    {/* All Media View */}
                    {activeTab === 'all' && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)', display: 'grid', gap: '12px' }}>
                            {allMediaItems.length === 0 ? (
                                <div style={{ color: 'var(--light-color)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                                    📦 Your library is empty. Start by uploading photos, music, or videos!
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {allMediaItems.map((item) => (
                                        <div key={item.id}
                                            style={{
                                                textAlign: 'left',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '10px',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'var(--text-color)',
                                                padding: '10px',
                                                display: 'flex',
                                                gap: '10px',
                                                alignItems: 'center'
                                            }}
                                        >
                                            {item.type === 'photo' && item.imageUrl && (
                                                <img src={item.imageUrl} alt={item.title} style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover' }} />
                                            )}
                                            {item.type === 'music' && <FiMusic style={{ fontSize: '32px', color: 'var(--highlight-color)' }} />}
                                            {item.type === 'video' && <FiVideo style={{ fontSize: '32px', color: 'var(--highlight-color)' }} />}
                                            <div style={{ flex: 1 }}>
                                                <div><strong>{item.title}</strong> <span style={{ fontSize: '11px', color: 'var(--light-color)' }}>({item.type})</span></div>
                                                {(item.artist || item.description) && (
                                                    <div style={{ marginTop: '2px', fontSize: '12px', color: 'var(--light-color)' }}>
                                                        {item.artist || item.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Photos View */}
                    {activeTab === 'photos' && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)', display: 'grid', gap: '12px' }}>
                            <input
                                type="search"
                                value={photoSearch}
                                onChange={(event) => setPhotoSearch(event.target.value)}
                                placeholder="Search photos by title or description"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: 'var(--text-color)'
                                }}
                            />

                            {filteredPhotos.length === 0 ? (
                                <div style={{ color: 'var(--light-color)', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                                    📸 No photos yet. Upload your first photo to get started!
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                                    {filteredPhotos.map((photo) => (
                                        <div
                                            key={photo.id}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '10px',
                                                background: 'rgba(255,255,255,0.03)',
                                                overflow: 'hidden',
                                                cursor: 'pointer',
                                                transition: 'transform 0.2s',
                                                ':hover': { transform: 'scale(1.02)' }
                                            }}
                                        >
                                            <img src={photo.imageUrl} alt={photo.title} style={{ width: '100%', height: '150px', objectFit: 'cover' }} />
                                            <div style={{ padding: '8px', fontSize: '12px' }}>
                                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {photo.title}
                                                </div>
                                                {photo.description && (
                                                    <div style={{ color: 'var(--light-color)', fontSize: '11px', marginTop: '2px' }}>
                                                        {photo.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Music View */}
                    {activeTab === 'music' && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)', display: 'grid', gap: '12px' }}>
                            <input
                                type="search"
                                value={musicSearch}
                                onChange={(event) => setMusicSearch(event.target.value)}
                                placeholder="Search music by title, artist, or album"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: 'var(--text-color)'
                                }}
                            />

                            {currentTrack && (
                                <AudioPlayer
                                    track={currentTrack}
                                    showVisualizer={true}
                                    onError={() => addToast('Unable to play this track.', 'error')}
                                />
                            )}

                            {filteredTracks.length === 0 ? (
                                <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>
                                    No music tracks found.
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {filteredTracks.map((track) => (
                                        <button
                                            key={track.id}
                                            type="button"
                                            onClick={() => setCurrentTrack(track)}
                                            style={{
                                                textAlign: 'left',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '10px',
                                                background: currentTrack?.id === track.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                                                color: 'var(--text-color)',
                                                padding: '10px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                <strong>{track.title || 'Untitled'}</strong>
                                                <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                                                    <FiPlay />
                                                </span>
                                            </div>
                                            <div style={{ marginTop: '2px', fontSize: '12px', color: 'var(--light-color)' }}>
                                                {track.artist || 'Unknown artist'}{track.album ? ` • ${track.album}` : ''}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'videos' && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)', display: 'grid', gap: '12px' }}>
                            <input
                                type="search"
                                value={videoSearch}
                                onChange={(event) => setVideoSearch(event.target.value)}
                                placeholder="Search videos by title or description"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: 'var(--text-color)'
                                }}
                            />

                            {filteredVideos.length === 0 ? (
                                <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>
                                    No saved videos found.
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {filteredVideos.map((video) => (
                                        <div
                                            key={video.id}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '10px',
                                                background: 'rgba(255,255,255,0.03)',
                                                padding: '10px'
                                            }}
                                        >
                                            <strong>{video.title || 'Untitled video'}</strong>
                                            {video.description && (
                                                <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--light-color)' }}>
                                                    {video.description}
                                                </div>
                                            )}
                                            <div style={{ marginTop: '8px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => onNavigate?.('ravensight')}
                                                    style={{
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '8px',
                                                        background: 'transparent',
                                                        color: 'var(--text-color)',
                                                        padding: '6px 10px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    Open in Ravensight
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default MyLibraryPage;
