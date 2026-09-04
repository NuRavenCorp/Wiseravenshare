import React, { useEffect, useMemo, useState } from 'react';
import { FiBookOpen, FiMusic, FiVideo, FiPlay } from 'react-icons/fi';
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
        url: mediaUrl
    };
};

const normalizeVideo = (video) => {
    if (!video || typeof video !== 'object') return null;
    return {
        id: String(video.id || video.videoId || ''),
        title: String(video.title || 'Untitled video').trim(),
        description: String(video.description || '').trim(),
        videoUrl: String(video.videoUrl || video.mediaUrl || video.filePath || '').trim(),
        createdAt: String(video.createdAt || video.uploadedAt || '')
    };
};

const MyLibraryPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const { addToast } = useNotification();
    const [activeTab, setActiveTab] = useState('music');
    const [isLoading, setIsLoading] = useState(true);
    const [musicTracks, setMusicTracks] = useState([]);
    const [videos, setVideos] = useState([]);
    const [musicSearch, setMusicSearch] = useState('');
    const [videoSearch, setVideoSearch] = useState('');
    const [currentTrack, setCurrentTrack] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const loadLibrary = async () => {
            setIsLoading(true);
            try {
                const [musicResult, videoResult] = await Promise.allSettled([
                    apiService.getMusicLibrary(),
                    ravensightAPI.getUserVideos(user?.id || null)
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

                setMusicTracks(nextTracks);
                setVideos(nextVideos);
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

    return (
        <section style={{ display: 'grid', gap: '14px' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px', background: 'var(--card-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '20px' }}>
                    <FiBookOpen /> My Library
                </div>
                <div style={{ marginTop: '6px', color: 'var(--light-color)', fontSize: '13px' }}>
                    Your uploaded music and saved videos in one place.
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('music')}
                    style={{
                        border: activeTab === 'music' ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                        background: activeTab === 'music' ? 'rgba(255,255,255,0.08)' : 'var(--card-bg)',
                        color: 'var(--text-color)',
                        borderRadius: '999px',
                        padding: '8px 14px',
                        cursor: 'pointer'
                    }}
                >
                    <FiMusic style={{ marginRight: '6px' }} />
                    Music ({musicTracks.length})
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
                        cursor: 'pointer'
                    }}
                >
                    <FiVideo style={{ marginRight: '6px' }} />
                    Videos ({videos.length})
                </button>
            </div>

            {isLoading ? (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', background: 'var(--card-bg)' }}>
                    Loading your library...
                </div>
            ) : (
                <>
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
