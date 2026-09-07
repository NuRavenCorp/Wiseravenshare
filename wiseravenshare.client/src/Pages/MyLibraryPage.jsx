import React, { useEffect, useMemo, useState } from 'react';
import { FiBookOpen, FiMusic, FiVideo, FiPlay, FiImage, FiFile, FiShield, FiCheck, FiAward } from 'react-icons/fi';

// ─── IP Protection Plans ──────────────────────────────────────────────────────
const PROTECTION_PLANS = [
    {
        id: 'basic',
        name: 'Basic Protection',
        price: '$4.99 / mo',
        color: '#22c55e',
        features: [
            'Timestamped proof of creation',
            'SHA-256 cryptographic fingerprint',
            'WiseRavenShare rights registration',
            'DMCA takedown template',
        ],
    },
    {
        id: 'standard',
        name: 'Standard Protection',
        price: '$14.99 / mo',
        badge: 'Popular',
        color: '#3b82f6',
        features: [
            'Everything in Basic',
            'Cross-platform monitoring (FB, TikTok, YouTube)',
            'Automated takedown support',
            'Licensing agreement templates',
            'Revenue split tracking',
        ],
    },
    {
        id: 'pro',
        name: 'Pro Protection',
        price: '$29.99 / mo',
        badge: 'Best Value',
        color: '#a855f7',
        features: [
            'Everything in Standard',
            'PRO registration guidance (ASCAP/BMI)',
            'Master + publishing documentation',
            'Priority legal support',
            'Custom licensing templates',
            'Dedicated IP advisor',
        ],
    },
];
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
    const [selectedPlanId, setSelectedPlanId] = useState(null);
    const handleProtectTrack = (planId) => {
        if (!currentTrack) {
            addToast('Please select a music track first', 'info');
            return;
        }
        setSelectedPlanId(planId);
        addToast(`Selected ${PROTECTION_PLANS.find(p => p.id === planId)?.name || 'plan'} for: ${currentTrack.title}`, 'success');
    };

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
                <button
                    type="button"
                    onClick={() => setActiveTab('protect')}
                    style={{
                        border: activeTab === 'protect' ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                        background: activeTab === 'protect' ? 'rgba(255,255,255,0.08)' : 'var(--card-bg)',
                        color: 'var(--text-color)',
                        borderRadius: '999px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px'
                    }}
                >
                    <FiShield style={{ marginRight: '6px', display: 'inline' }} />
                    Protect
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

                    {/* Music Rights Protection View */}
                    {activeTab === 'protect' && (
                        <div style={{ display: 'grid', gap: '16px' }}>
                            {!currentTrack ? (
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', background: 'var(--card-bg)', textAlign: 'center', color: 'var(--light-color)' }}>
                                    🎵 Select a music track from the Music tab to protect your intellectual property
                                </div>
                            ) : (
                                <>
                                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                            <FiMusic style={{ fontSize: '24px', color: 'var(--highlight-color)' }} />
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{currentTrack.title}</div>
                                                {currentTrack.artist && (
                                                    <div style={{ fontSize: '13px', color: 'var(--light-color)' }}>
                                                        by {currentTrack.artist}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '8px' }}>
                                            Protect your music with IP registration, proof-of-creation, monitoring, and legal support.
                                        </div>
                                    </div>

                                    {/* Protection Plans Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                                        {PROTECTION_PLANS.map((plan) => (
                                            <div
                                                key={plan.id}
                                                style={{
                                                    border: selectedPlanId === plan.id ? `2px solid ${plan.color}` : '1px solid var(--border-color)',
                                                    borderRadius: '12px',
                                                    padding: '16px',
                                                    background: 'var(--card-bg)',
                                                    position: 'relative'
                                                }}
                                            >
                                                {plan.badge && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '-12px',
                                                        right: '12px',
                                                        background: plan.color,
                                                        color: '#000',
                                                        padding: '4px 10px',
                                                        borderRadius: '999px',
                                                        fontSize: '11px',
                                                        fontWeight: 700
                                                    }}>
                                                        {plan.badge}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <FiAward style={{ fontSize: '18px', color: plan.color }} />
                                                    <div style={{ fontWeight: 700, fontSize: '16px' }}>{plan.name}</div>
                                                </div>
                                                <div style={{ fontSize: '18px', fontWeight: 700, color: plan.color, marginBottom: '12px' }}>
                                                    {plan.price}
                                                </div>
                                                <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
                                                    {plan.features.map((feature, idx) => (
                                                        <div key={idx} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--light-color)' }}>
                                                            <FiCheck style={{ color: plan.color, flexShrink: 0, marginTop: '2px' }} />
                                                            <span>{feature}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleProtectTrack(plan.id)}
                                                    style={{
                                                        width: '100%',
                                                        border: `1px solid ${plan.color}`,
                                                        background: selectedPlanId === plan.id ? plan.color : 'transparent',
                                                        color: selectedPlanId === plan.id ? '#000' : 'var(--text-color)',
                                                        padding: '10px',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {selectedPlanId === plan.id ? '✓ Selected' : 'Select Plan'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--light-color)', lineHeight: '1.6' }}>
                                            <strong>What's included:</strong> Proof-of-creation timestamping, SHA-256 fingerprinting, cross-platform monitoring, DMCA support, and licensing templates. All plans help protect your music rights and provide documentation for registration with PROs like ASCAP, BMI, and SESAC.
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default MyLibraryPage;
