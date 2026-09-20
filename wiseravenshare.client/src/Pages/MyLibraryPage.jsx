import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiBookOpen, FiMusic, FiVideo, FiPlay, FiImage, FiFile, FiShield, FiCheck, FiAward, FiUpload, FiTrash2, FiX } from 'react-icons/fi';
import { resolveMediaUrl } from '../utils/mediaUtils';

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
import { useNotification } from '../Contexts/NotificationContext';
import { useAuth } from '../Contexts/AuthContext';
import { apiService } from '../Services/api';
import { ravensightAPI } from '../Services/RavensightAPI';

const TRACK_PLAYER_HANDOFF_KEY = 'wr_track_player_handoff';
const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPACT_GUID_REGEX = /^[0-9a-f]{32}$/i;

const inferUploadTypeFromFile = (file, fallback = 'photo') => {
    const mime = String(file?.type || '').toLowerCase();
    const fileName = String(file?.name || '').toLowerCase();

    if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|weba)$/i.test(fileName)) {
        return 'music';
    }

    if (mime.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(fileName)) {
        return 'video';
    }

    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|svg)$/i.test(fileName)) {
        return 'photo';
    }

    return fallback;
};

const normalizePlaybackUrl = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            return `${parsed.pathname}${parsed.search}`;
        } catch {
            return raw;
        }
    }

    if (raw.startsWith('/')) return raw;
    if (raw.startsWith('api/')) return `/${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    return '';
};

const toBlobStreamUrl = (relativePath = '') => {
    const normalized = String(relativePath || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
    if (!normalized) return '';

    const encoded = normalized
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');

    return encoded ? `/api/videostreaming/blob/${encoded}` : '';
};

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

    const fileName = String(video.fileName || video.FileName || video.title || 'video').trim();
    const relativePath = String(video.relativePath || video.RelativePath || video.objectKey || video.ObjectKey || '').trim();
    const sourceCandidates = [
        toBlobStreamUrl(relativePath),
        fileName ? `/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}` : '',
        normalizePlaybackUrl(video.videoUrl || ''),
        normalizePlaybackUrl(video.mediaUrl || ''),
        normalizePlaybackUrl(video.filePath || ''),
        normalizePlaybackUrl(video.publicUrl || ''),
        normalizePlaybackUrl(video.thumbnailUrl || ''),
        normalizePlaybackUrl(video.posterUrl || '')
    ].filter(Boolean).map((url) => resolveMediaUrl(url) || url);

    const videoUrl = sourceCandidates[0] || '';
    const thumbnailUrl = sourceCandidates[1] || sourceCandidates[0] || '';

    return {
        id: String(video.id || video.videoId || ''),
        title: String(video.title || 'Untitled video').trim(),
        description: String(video.description || '').trim(),
        videoUrl,
        mediaUrl: videoUrl,
        thumbnailUrl,
        relativePath,
        fileName,
        createdAt: String(video.createdAt || video.uploadedAt || ''),
        type: 'video'
    };
};

const normalizePhoto = (photo) => {
    if (!photo || typeof photo !== 'object') return null;

    const relativePath = String(
        photo.relativePath
        || photo.RelativePath
        || photo.objectKey
        || photo.ObjectKey
        || ''
    ).trim();
    const fileName = String(photo.fileName || photo.FileName || '').trim();

    const sourceCandidates = [
        toBlobStreamUrl(relativePath),
        fileName ? `/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}` : '',
        normalizePlaybackUrl(photo.thumbnailUrl || photo.ThumbnailUrl || ''),
        normalizePlaybackUrl(photo.mediaUrl || photo.MediaUrl || ''),
        normalizePlaybackUrl(photo.imageUrl || photo.ImageUrl || ''),
        normalizePlaybackUrl(photo.url || photo.Url || ''),
        normalizePlaybackUrl(photo.fileUrl || photo.FileUrl || ''),
        normalizePlaybackUrl(photo.publicUrl || photo.PublicUrl || '')
    ].filter(Boolean).map((url) => resolveMediaUrl(url) || url);

    const imageUrl = sourceCandidates[0] || '';
    const thumbnailUrl = sourceCandidates[1] || sourceCandidates[0] || '';

    return {
        id: String(photo.id || `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        title: String(photo.title || photo.fileName || 'Untitled photo').trim(),
        description: String(photo.description || '').trim(),
        fileName,
        relativePath,
        imageUrl,
        thumbnailUrl,
        url: imageUrl,
        uploadedAt: String(photo.uploadedAt || photo.createdAt || new Date().toISOString()),
        type: 'photo'
    };
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const LIBRARY_LIMITS = {
    music: 20,
    photo: 25,
    video: 10
};

const LOCAL_ARCHIVE_STORAGE_KEY = 'wiseLocalMediaArchive';
const LOCAL_ARCHIVE_HIDDEN_KEY = 'wiseLocalMediaArchiveHiddenIds';

const readJsonLocal = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const writeJsonLocal = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Best effort local persistence.
    }
};

const normalizeArchiveStore = (value) => {
    const source = value && typeof value === 'object' ? value : {};
    return {
        music: Array.isArray(source.music) ? source.music : [],
        photo: Array.isArray(source.photo) ? source.photo : [],
        video: Array.isArray(source.video) ? source.video : []
    };
};

const getMediaDateValue = (item) => {
    const candidates = [item?.uploadedAt, item?.createdAt, item?.updatedAt, item?.archivedAt];
    for (const candidate of candidates) {
        const parsed = new Date(candidate || '').getTime();
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return 0;
};

const makeArchiveEntry = (item, mediaType) => {
    const type = String(mediaType || '').trim().toLowerCase();
    const sourceUrl = String(item?.mediaUrl || item?.videoUrl || item?.imageUrl || item?.url || '').trim();
    const title = String(item?.title || `${type} item`).trim() || `${type} item`;
    return {
        id: `archive-${type}-${item?.id || Date.now()}-${Date.now()}`,
        mediaId: String(item?.id || '').trim(),
        type,
        title,
        description: String(item?.description || '').trim(),
        sourceUrl,
        thumbnailUrl: String(item?.thumbnailUrl || item?.imageUrl || '').trim(),
        folderPath: `/wiseravenshare/local/${type}`,
        archivedAt: new Date().toISOString()
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
    const [isPlaying, setIsPlaying] = useState(false);
    const [photoLightbox, setPhotoLightbox] = useState(null);
    const [playingVideoId, setPlayingVideoId] = useState(null);
    const [removingMediaId, setRemovingMediaId] = useState('');
    const audioRef = useRef(null);
    const isMountedRef = useRef(true);
    const uploadInputRef = useRef(null);
    const [selectedPlanId, setSelectedPlanId] = useState(null);
    const [libraryVersion, setLibraryVersion] = useState(0);
    const [uploadType, setUploadType] = useState('photo');
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadDescription, setUploadDescription] = useState('');
    const [uploading, setUploading] = useState(false);
    const [localArchive, setLocalArchive] = useState(() => normalizeArchiveStore(readJsonLocal(LOCAL_ARCHIVE_STORAGE_KEY, {})));
    const [hiddenArchivedIds, setHiddenArchivedIds] = useState(() => normalizeArchiveStore(readJsonLocal(LOCAL_ARCHIVE_HIDDEN_KEY, {})));

    useEffect(() => {
        writeJsonLocal(LOCAL_ARCHIVE_STORAGE_KEY, localArchive);
    }, [localArchive]);

    useEffect(() => {
        writeJsonLocal(LOCAL_ARCHIVE_HIDDEN_KEY, hiddenArchivedIds);
    }, [hiddenArchivedIds]);

    const playTrack = (track) => {
        if (!track) {
            return;
        }

        const payload = {
            source: 'my-library',
            requestedAtUtc: new Date().toISOString(),
            track: {
                id: String(track.id || '').trim(),
                title: String(track.title || '').trim(),
                artist: String(track.artist || '').trim(),
                album: String(track.album || '').trim(),
                fileName: String(track.fileName || track.title || '').trim(),
                mediaUrl: String(track.mediaUrl || track.url || '').trim(),
                url: String(track.mediaUrl || track.url || '').trim(),
                relativePath: String(track.relativePath || '').trim()
            }
        };

        try {
            localStorage.setItem(TRACK_PLAYER_HANDOFF_KEY, JSON.stringify(payload));
        } catch {
            // If storage write fails, continue and still navigate so user can load manually.
        }

        setCurrentTrack(track);
        setIsPlaying(true);
        onNavigate?.('radio-creator');
    };

    const togglePlayPause = () => {
        if (!currentTrack) return;
        setIsPlaying((prev) => !prev);
    };

    // Sync the audio element with currentTrack + isPlaying state.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!currentTrack?.mediaUrl) { audio.pause(); return; }
        if (audio.src !== currentTrack.mediaUrl) {
            audio.src = currentTrack.mediaUrl;
            audio.load();
        }
        if (isPlaying) { audio.play().catch(() => {}); }
        else { audio.pause(); }
    }, [currentTrack, isPlaying]);
    const handleProtectTrack = (planId) => {
        if (!currentTrack) {
            addToast('Please select a music track first', 'info');
            return;
        }
        setSelectedPlanId(planId);
        addToast(`Selected ${PROTECTION_PLANS.find(p => p.id === planId)?.name || 'plan'} for: ${currentTrack.title}`, 'success');
    };

    const openPhotoLightbox = (photo) => {
        const source = String(photo?.imageUrl || photo?.thumbnailUrl || photo?.url || '').trim();
        if (!source) {
            addToast('This photo does not have a visible source URL yet.', 'warning');
            return;
        }

        setPhotoLightbox({
            id: String(photo?.id || ''),
            src: source,
            title: String(photo?.title || 'Photo')
        });
    };

    const handleRemoveMedia = async (item, event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        await removeMediaItem(item, { skipConfirm: false, suppressToast: false });
    };

    const removeMediaItem = async (item, { skipConfirm = false, suppressToast = false } = {}) => {
        const mediaId = String(item?.id || '').trim();
        const mediaType = String(item?.type || '').toLowerCase();
        if (!mediaId) {
            addToast('Unable to remove this media because the id is missing.', 'error');
            return false;
        }

        const mediaTitle = String(item?.title || `this ${mediaType || 'media item'}`).trim() || `this ${mediaType || 'media item'}`;
        if (!skipConfirm) {
            const confirmed = window.confirm(`Remove "${mediaTitle}" from your library? This cannot be undone.`);
            if (!confirmed) {
                return false;
            }
        }

        setRemovingMediaId(mediaId);
        try {
            if (mediaType === 'photo') {
                try {
                    await apiService.deletePhotoLibraryItem(mediaId);
                } catch (error) {
                    const status = Number(error?.status || error?.response?.status || 0);
                    if ((status === 404 || status === 400) && GUID_REGEX.test(mediaId)) {
                        await apiService.deleteSavedMediaItem(mediaId);
                    } else {
                        throw error;
                    }
                }
                setPhotos((previous) => previous.filter((entry) => entry.id !== mediaId));
                setPhotoLightbox((previous) => (previous?.id === mediaId ? null : previous));
                setHiddenArchivedIds((previous) => ({ ...previous, photo: previous.photo.filter((id) => id !== mediaId) }));
                setLocalArchive((previous) => ({ ...previous, photo: previous.photo.filter((entry) => entry.mediaId !== mediaId) }));
            } else if (mediaType === 'video') {
                try {
                    await apiService.deleteVideoLibraryItem(mediaId);
                } catch (error) {
                    const status = Number(error?.status || error?.response?.status || 0);
                    if ((status === 404 || status === 400) && GUID_REGEX.test(mediaId)) {
                        await apiService.deleteSavedMediaItem(mediaId);
                    } else {
                        throw error;
                    }
                }
                setVideos((previous) => previous.filter((entry) => entry.id !== mediaId));
                setPlayingVideoId((previous) => (previous === mediaId ? null : previous));
                setHiddenArchivedIds((previous) => ({ ...previous, video: previous.video.filter((id) => id !== mediaId) }));
                setLocalArchive((previous) => ({ ...previous, video: previous.video.filter((entry) => entry.mediaId !== mediaId) }));
            } else if (mediaType === 'music') {
                try {
                    await apiService.deleteMusicLibraryItem(mediaId);
                } catch (error) {
                    const status = Number(error?.status || error?.response?.status || 0);
                    const canFallback = status === 404 || status === 400 || status === 405;
                    if (canFallback && (GUID_REGEX.test(mediaId) || COMPACT_GUID_REGEX.test(mediaId))) {
                        await apiService.deleteSavedMediaItem(mediaId);
                    } else {
                        throw error;
                    }
                }
                setMusicTracks((previous) => {
                    const next = previous.filter((entry) => entry.id !== mediaId);
                    if (currentTrack?.id === mediaId) {
                        setCurrentTrack(next[0] || null);
                        setIsPlaying(false);
                    }
                    return next;
                });
                setHiddenArchivedIds((previous) => ({ ...previous, music: previous.music.filter((id) => id !== mediaId) }));
                setLocalArchive((previous) => ({ ...previous, music: previous.music.filter((entry) => entry.mediaId !== mediaId) }));
            } else {
                throw new Error('Unsupported media type for removal.');
            }

            if (!suppressToast) {
                addToast(`Removed ${mediaTitle} from your library.`, 'success');
            }
            return true;
        } catch (error) {
            if (!suppressToast) {
                addToast(error?.message || 'Failed to remove media.', 'error');
            }
            return false;
        } finally {
            setRemovingMediaId('');
        }
    };

    const archiveMediaItem = (item) => {
        const mediaId = String(item?.id || '').trim();
        const mediaType = String(item?.type || '').toLowerCase();
        if (!mediaId || !['music', 'photo', 'video'].includes(mediaType)) {
            addToast('Unable to archive this item.', 'error');
            return false;
        }

        const archiveEntry = makeArchiveEntry(item, mediaType);
        setLocalArchive((previous) => ({
            ...previous,
            [mediaType]: [archiveEntry, ...(previous[mediaType] || []).filter((entry) => entry.mediaId !== mediaId)].slice(0, 400)
        }));
        setHiddenArchivedIds((previous) => ({
            ...previous,
            [mediaType]: Array.from(new Set([...(previous[mediaType] || []), mediaId]))
        }));

        if (mediaType === 'music' && currentTrack?.id === mediaId) {
            setCurrentTrack(null);
            setIsPlaying(false);
        }
        if (mediaType === 'video' && playingVideoId === mediaId) {
            setPlayingVideoId(null);
        }
        if (mediaType === 'photo' && photoLightbox?.id === mediaId) {
            setPhotoLightbox(null);
        }

        addToast(`Moved to local archive folder /wiseravenshare/local/${mediaType}.`, 'success');
        return true;
    };

    const restoreArchivedItem = (entry) => {
        const mediaType = String(entry?.type || '').toLowerCase();
        const mediaId = String(entry?.mediaId || '').trim();
        if (!mediaType || !mediaId) {
            return;
        }

        setHiddenArchivedIds((previous) => ({
            ...previous,
            [mediaType]: (previous[mediaType] || []).filter((id) => id !== mediaId)
        }));
        addToast(`${entry?.title || 'Item'} restored to active library.`, 'success');
    };

    const removeArchiveRecord = (entry) => {
        const mediaType = String(entry?.type || '').toLowerCase();
        const archiveId = String(entry?.id || '').trim();
        if (!mediaType || !archiveId) {
            return;
        }

        setLocalArchive((previous) => ({
            ...previous,
            [mediaType]: (previous[mediaType] || []).filter((item) => item.id !== archiveId)
        }));
        addToast('Archive record removed.', 'info');
    };

    const enforceCapacityBeforeUpload = async (incomingType) => {
        const mediaType = String(incomingType || '').toLowerCase();
        const visibleCounts = {
            music: musicTracks.filter((item) => !hiddenArchivedIds.music.includes(String(item?.id || ''))).length,
            photo: photos.filter((item) => !hiddenArchivedIds.photo.includes(String(item?.id || ''))).length,
            video: videos.filter((item) => !hiddenArchivedIds.video.includes(String(item?.id || ''))).length
        };
        const currentCount = visibleCounts[mediaType] || 0;
        const limit = LIBRARY_LIMITS[mediaType] || 0;
        if (limit <= 0 || currentCount < limit) {
            return true;
        }

        const items = mediaType === 'music'
            ? musicTracks.filter((item) => !hiddenArchivedIds.music.includes(String(item?.id || '')))
            : mediaType === 'photo'
                ? photos.filter((item) => !hiddenArchivedIds.photo.includes(String(item?.id || '')))
                : videos.filter((item) => !hiddenArchivedIds.video.includes(String(item?.id || '')));

        const oldest = [...items].sort((left, right) => getMediaDateValue(left) - getMediaDateValue(right))[0];
        if (!oldest) {
            return false;
        }

        const action = String(window.prompt(
            `${mediaType.toUpperCase()} library limit reached (${limit}). Type ARCHIVE to move oldest item to local storage folder, DELETE to remove oldest item, or CANCEL to stop upload.`,
            'ARCHIVE'
        ) || '').trim().toLowerCase();

        if (action === 'archive') {
            return archiveMediaItem(oldest);
        }

        if (action === 'delete') {
            return await removeMediaItem(oldest, { skipConfirm: true, suppressToast: false });
        }

        addToast('Upload canceled. No files were changed.', 'info');
        return false;
    };

    const loadLibrary = async () => {
        setIsLoading(true);
        try {
            const [musicResult, videoResult, photoResult] = await Promise.allSettled([
                apiService.getMusicLibrary(),
                apiService.getVideoLibrary
                    ? apiService.getVideoLibrary()
                    : ravensightAPI.getUserVideos(user?.id || null),
                apiService.getPhotoLibrary ? apiService.getPhotoLibrary() : Promise.resolve({ data: [] })
            ]);

            if (!isMountedRef.current) return;

            const nextTracks = musicResult.status === 'fulfilled'
                ? asArray(musicResult.value?.data?.data ?? musicResult.value?.data)
                    .map(normalizeTrack)
                    .filter(Boolean)
                : [];
            const nextVideos = videoResult.status === 'fulfilled'
                ? asArray(
                    videoResult.value?.data?.videos
                    ?? videoResult.value?.videos
                    ?? videoResult.value?.data
                )
                    .map(normalizeVideo)
                    .filter(Boolean)
                : [];
            const nextPhotos = photoResult.status === 'fulfilled'
                ? asArray(
                    photoResult.value?.data?.data
                    ?? photoResult.value?.photos
                    ?? photoResult.value?.data
                )
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
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    };

    const handleUpload = async (event) => {
        event.preventDefault();
        if (!uploadFile) {
            addToast('Choose a file to upload first.', 'info');
            return;
        }

        const title = String(uploadTitle || uploadFile.name || 'Uploaded media').trim();
        const description = String(uploadDescription || '').trim();
        const resolvedUploadType = inferUploadTypeFromFile(uploadFile, uploadType);
        const type = resolvedUploadType === 'music' ? 'audio' : resolvedUploadType;
        const canProceed = await enforceCapacityBeforeUpload(resolvedUploadType);
        if (!canProceed) {
            return;
        }

        const destinationFolderByType = {
            music: '/wiseravenshare/music',
            photo: '/wiseravenshare/photo',
            video: '/wiseravenshare/video'
        };
        const destinationFolder = destinationFolderByType[resolvedUploadType] || '/wiseravenshare/media';

        setUploading(true);
        try {
            if (resolvedUploadType === 'music') {
                await apiService.uploadMusicTrack(uploadFile, {
                    title,
                    artist: '',
                    album: '',
                    genre: '',
                    destinationFolder,
                    fingerprint: ''
                });
            } else {
                await apiService.uploadMedia(uploadFile, type, {
                    title,
                    description,
                    destinationFolder
                });
            }

            addToast(`${resolvedUploadType === 'music' ? 'Music' : resolvedUploadType.charAt(0).toUpperCase() + resolvedUploadType.slice(1)} uploaded successfully.`, 'success');
            setUploadFile(null);
            setUploadTitle('');
            setUploadDescription('');
            if (uploadInputRef.current) {
                uploadInputRef.current.value = '';
            }
            setLibraryVersion((value) => value + 1);
        } catch (error) {
            addToast(error?.message || 'Upload failed. Please try again.', 'error');
        } finally {
            setUploading(false);
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        void loadLibrary();
        return () => {
            isMountedRef.current = false;
        };
    }, [addToast, user?.id, libraryVersion]);

    const filteredTracks = useMemo(() => {
        const query = musicSearch.trim().toLowerCase();
        const visibleTracks = musicTracks.filter((track) => !hiddenArchivedIds.music.includes(String(track?.id || '')));
        if (!query) return visibleTracks;
        return visibleTracks.filter((track) =>
            String(track.title || '').toLowerCase().includes(query)
            || String(track.artist || '').toLowerCase().includes(query)
            || String(track.album || '').toLowerCase().includes(query)
        );
    }, [musicTracks, musicSearch, hiddenArchivedIds.music]);

    const filteredVideos = useMemo(() => {
        const query = videoSearch.trim().toLowerCase();
        const visibleVideos = videos.filter((video) => !hiddenArchivedIds.video.includes(String(video?.id || '')));
        if (!query) return visibleVideos;
        return visibleVideos.filter((video) =>
            String(video.title || '').toLowerCase().includes(query)
            || String(video.description || '').toLowerCase().includes(query)
        );
    }, [videos, videoSearch, hiddenArchivedIds.video]);

    const filteredPhotos = useMemo(() => {
        const query = photoSearch.trim().toLowerCase();
        const visiblePhotos = photos.filter((photo) => !hiddenArchivedIds.photo.includes(String(photo?.id || '')));
        if (!query) return visiblePhotos;
        return visiblePhotos.filter((photo) =>
            String(photo.title || '').toLowerCase().includes(query)
            || String(photo.description || '').toLowerCase().includes(query)
        );
    }, [photos, photoSearch, hiddenArchivedIds.photo]);

    const allMediaItems = useMemo(() => 
        [...filteredTracks, ...filteredVideos, ...filteredPhotos], 
        [filteredTracks, filteredVideos, filteredPhotos]
    );

    const totalItems = useMemo(() => ({
        all: allMediaItems.length,
        music: filteredTracks.length,
        photos: filteredPhotos.length,
        videos: filteredVideos.length
    }), [allMediaItems, filteredTracks.length, filteredPhotos.length, filteredVideos.length]);

    const archiveCounts = useMemo(() => ({
        music: localArchive.music.length,
        photo: localArchive.photo.length,
        video: localArchive.video.length,
        all: localArchive.music.length + localArchive.photo.length + localArchive.video.length
    }), [localArchive]);

    return (
        <section style={{ display: 'grid', gap: '14px' }}>
            {/* Hidden audio engine */}
            <audio ref={audioRef} preload="metadata" onEnded={() => setIsPlaying(false)} />

            {/* Now-playing bar — visible whenever a track is loaded */}
            {currentTrack && (
                <div style={{
                    position: 'sticky', top: '72px', zIndex: 20,
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 14px',
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(168,85,247,0.18))',
                    border: '1px solid rgba(168,85,247,0.4)',
                    borderRadius: '12px',
                    backdropFilter: 'blur(10px)'
                }}>
                    <button type="button" onClick={togglePlayPause}
                        style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #a855f7)', color: '#fff', cursor: 'pointer', fontSize: '14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack.title}</div>
                        {currentTrack.artist && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{currentTrack.artist}</div>}
                    </div>
                    <FiMusic style={{ color: isPlaying ? '#a855f7' : 'rgba(255,255,255,0.3)', fontSize: '18px', flexShrink: 0 }} />
                </div>
            )}

            {/* Photo lightbox */}
            {photoLightbox && (
                <div onClick={() => setPhotoLightbox(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
                    <button
                        type="button"
                        aria-label="Close photo preview"
                        onClick={() => setPhotoLightbox(null)}
                        style={{ position: 'absolute', top: '20px', right: '20px', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(15,23,42,0.8)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                    >
                        <FiX />
                    </button>
                    <img
                        src={photoLightbox.src}
                        alt={photoLightbox.title}
                        onClick={(event) => event.stopPropagation()}
                        onError={(event) => {
                            event.currentTarget.style.display = 'none';
                        }}
                        style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: '10px', boxShadow: '0 8px 40px rgba(0,0,0,0.8)', cursor: 'default' }}
                    />
                </div>
            )}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px', background: 'var(--card-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '20px' }}>
                    <FiBookOpen /> My Media Library
                </div>
                <div style={{ marginTop: '6px', color: 'var(--light-color)', fontSize: '13px' }}>
                    All your uploaded photos, music, videos, and more in one unified library.
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--light-color)' }}>
                    Capacity limits: Music {LIBRARY_LIMITS.music}, Photos {LIBRARY_LIMITS.photo}, Videos {LIBRARY_LIMITS.video}. When full, you will be prompted to archive or delete.
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    <span style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                        Photos ({totalItems.photos})
                    </span>
                    <span style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                        Music ({totalItems.music})
                    </span>
                    <span style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                        Videos ({totalItems.videos})
                    </span>
                    <span style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                        Local Archive ({archiveCounts.all})
                    </span>
                </div>
                <form onSubmit={handleUpload} style={{ display: 'grid', gap: '10px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                        <select
                            value={uploadType}
                            onChange={(event) => setUploadType(event.target.value)}
                            style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-color)' }}
                        >
                            <option value="photo">Photo</option>
                            <option value="music">Music</option>
                            <option value="video">Video</option>
                        </select>
                        <input
                            ref={uploadInputRef}
                            type="file"
                            accept="image/*,audio/*,video/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus,.weba,.mp4,.mov,.webm,.mkv,.avi,.m4v"
                            onChange={(event) => {
                                const file = event.target.files?.[0] || null;
                                setUploadFile(file);
                                if (file) {
                                    setUploadType(inferUploadTypeFromFile(file, uploadType));
                                }
                            }}
                            style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-color)' }}
                        />
                    </div>
                    <input
                        type="text"
                        value={uploadTitle}
                        onChange={(event) => setUploadTitle(event.target.value)}
                        placeholder={`${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)} title`}
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-color)' }}
                    />
                    <textarea
                        value={uploadDescription}
                        onChange={(event) => setUploadDescription(event.target.value)}
                        placeholder="Optional description"
                        rows={2}
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-color)' }}
                    />
                    <button
                        type="submit"
                        disabled={uploading || !uploadFile}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            background: uploading ? 'rgba(148,163,184,0.35)' : 'linear-gradient(135deg, #3b82f6, #a855f7)',
                            color: '#fff',
                            cursor: uploading || !uploadFile ? 'not-allowed' : 'pointer',
                            fontWeight: 700
                        }}
                    >
                        <FiUpload />
                        {uploading ? 'Uploading…' : 'Upload to Library'}
                    </button>
                </form>
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
                    onClick={() => setActiveTab('archive')}
                    style={{
                        border: activeTab === 'archive' ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                        background: activeTab === 'archive' ? 'rgba(255,255,255,0.08)' : 'var(--card-bg)',
                        color: 'var(--text-color)',
                        borderRadius: '999px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px'
                    }}
                >
                    <FiFile style={{ marginRight: '6px', display: 'inline' }} />
                    Archive ({archiveCounts.all})
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
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => {
                                                if (item.type === 'music') playTrack(item);
                                                else if (item.type === 'photo') openPhotoLightbox(item);
                                                else if (item.type === 'video') setPlayingVideoId((id) => id === item.id ? null : item.id);
                                            }}
                                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
                                            style={{
                                                textAlign: 'left',
                                                border: `1px solid ${(item.type === 'music' && currentTrack?.id === item.id) || playingVideoId === item.id ? 'var(--highlight-color)' : 'var(--border-color)'}`,
                                                borderRadius: '10px',
                                                background: (item.type === 'music' && currentTrack?.id === item.id) ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
                                                color: 'var(--text-color)',
                                                padding: '10px',
                                                cursor: 'pointer',
                                                display: 'grid',
                                                gap: '8px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                {item.type === 'photo' && (item.imageUrl || item.url) && (
                                                    <img
                                                        src={item.thumbnailUrl || item.imageUrl || item.url}
                                                        alt={item.title}
                                                        onError={(event) => {
                                                            event.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="120"%3E%3Crect fill="%23202b3d" width="120" height="120"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle" fill="%2394a3b8" font-size="12"%3ENo Preview%3C/text%3E%3C/svg%3E';
                                                        }}
                                                        style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'contain', background: 'rgba(15,23,42,0.75)' }}
                                                    />
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
                                                <FiPlay style={{ color: 'var(--light-color)', flexShrink: 0 }} />
                                                {(item.type === 'photo' || item.type === 'video' || item.type === 'music') && (
                                                    <button
                                                        type="button"
                                                        title={`Remove ${item.type}`}
                                                        aria-label={`Remove ${item.title}`}
                                                        disabled={removingMediaId === item.id}
                                                        onClick={(event) => handleRemoveMedia(item, event)}
                                                        style={{ marginLeft: '8px', border: '1px solid rgba(248,113,113,0.45)', background: removingMediaId === item.id ? 'rgba(248,113,113,0.25)' : 'rgba(248,113,113,0.12)', color: '#fca5a5', borderRadius: '8px', padding: '6px 8px', cursor: removingMediaId === item.id ? 'not-allowed' : 'pointer' }}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                )}
                                            </div>
                                            {/* Inline video for All tab */}
                                            {item.type === 'video' && playingVideoId === item.id && item.videoUrl && (
                                                <video src={item.videoUrl} controls autoPlay
                                                    style={{ width: '100%', maxHeight: '340px', borderRadius: '8px', background: '#000' }}
                                                    onClick={(e) => e.stopPropagation()} />
                                            )}
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
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => openPhotoLightbox(photo)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    openPhotoLightbox(photo);
                                                }
                                            }}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '10px',
                                                background: 'rgba(255,255,255,0.03)',
                                                overflow: 'hidden',
                                                cursor: 'zoom-in',
                                                padding: 0,
                                                textAlign: 'left',
                                                transition: 'transform 0.15s, border-color 0.15s',
                                                position: 'relative'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = 'var(--highlight-color)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                                        >
                                            <button
                                                type="button"
                                                title="Remove photo"
                                                aria-label={`Remove ${photo.title}`}
                                                disabled={removingMediaId === photo.id}
                                                onClick={(event) => handleRemoveMedia(photo, event)}
                                                style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 2, border: '1px solid rgba(248,113,113,0.55)', background: removingMediaId === photo.id ? 'rgba(248,113,113,0.4)' : 'rgba(15,23,42,0.7)', color: '#fecaca', borderRadius: '8px', padding: '6px', cursor: removingMediaId === photo.id ? 'not-allowed' : 'pointer' }}
                                            >
                                                <FiTrash2 />
                                            </button>
                                            <div style={{ width: '100%', height: '150px', background: 'rgba(15,23,42,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img
                                                    src={photo.thumbnailUrl || photo.imageUrl || photo.url}
                                                    alt={photo.title}
                                                    onError={(event) => {
                                                        event.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300"%3E%3Crect fill="%23202b3d" width="300" height="300"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle" fill="%2394a3b8" font-size="16"%3ENo Preview%3C/text%3E%3C/svg%3E';
                                                    }}
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                                />
                                            </div>
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

                            {filteredTracks.length === 0 ? (
                                <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>
                                    No music tracks found.
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {filteredTracks.map((track) => (
                                        <div
                                            key={track.id}
                                            style={{
                                                textAlign: 'left',
                                                border: `1px solid ${currentTrack?.id === track.id ? 'var(--highlight-color)' : 'var(--border-color)'}`,
                                                borderRadius: '10px',
                                                background: currentTrack?.id === track.id ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.03)',
                                                color: 'var(--text-color)',
                                                padding: '10px',
                                                display: 'grid',
                                                gap: '8px'
                                            }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => playTrack(track)}
                                                style={{ background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left', padding: 0, cursor: 'pointer' }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                                                    <strong>{track.title || 'Untitled'}</strong>
                                                    <span style={{ fontSize: '18px', color: 'var(--highlight-color)', flexShrink: 0 }}>
                                                        {currentTrack?.id === track.id && isPlaying ? '⏸' : '▶'}
                                                    </span>
                                                </div>
                                                <div style={{ marginTop: '2px', fontSize: '12px', color: 'var(--light-color)' }}>
                                                    {track.artist || 'Unknown artist'}{track.album ? ` • ${track.album}` : ''}
                                                </div>
                                            </button>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button
                                                    type="button"
                                                    title="Remove music"
                                                    aria-label={`Remove ${track.title || 'track'}`}
                                                    disabled={removingMediaId === track.id}
                                                    onClick={(event) => handleRemoveMedia(track, event)}
                                                    style={{ border: '1px solid rgba(248,113,113,0.45)', background: removingMediaId === track.id ? 'rgba(248,113,113,0.25)' : 'rgba(248,113,113,0.12)', color: '#fca5a5', borderRadius: '8px', padding: '6px 8px', cursor: removingMediaId === track.id ? 'not-allowed' : 'pointer' }}
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </div>
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
                                                border: `1px solid ${playingVideoId === video.id ? 'var(--highlight-color)' : 'var(--border-color)'}`,
                                                borderRadius: '10px',
                                                background: 'rgba(255,255,255,0.03)',
                                                overflow: 'hidden',
                                                position: 'relative'
                                            }}
                                        >
                                            <button
                                                type="button"
                                                title="Remove video"
                                                aria-label={`Remove ${video.title || 'video'}`}
                                                disabled={removingMediaId === video.id}
                                                onClick={(event) => handleRemoveMedia(video, event)}
                                                style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 3, border: '1px solid rgba(248,113,113,0.55)', background: removingMediaId === video.id ? 'rgba(248,113,113,0.4)' : 'rgba(15,23,42,0.7)', color: '#fecaca', borderRadius: '8px', padding: '6px', cursor: removingMediaId === video.id ? 'not-allowed' : 'pointer' }}
                                            >
                                                <FiTrash2 />
                                            </button>
                                            {/* Collapsed row — tap to expand player */}
                                            <button type="button"
                                                onClick={() => setPlayingVideoId((id) => id === video.id ? null : video.id)}
                                                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-color)', padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ fontSize: '20px', color: 'var(--highlight-color)', flexShrink: 0 }}>
                                                    {playingVideoId === video.id ? '⏸' : '▶'}
                                                </span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title || 'Untitled video'}</div>
                                                    {video.description && (
                                                        <div style={{ marginTop: '2px', fontSize: '12px', color: 'var(--light-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.description}</div>
                                                    )}
                                                </div>
                                            </button>
                                            {/* Inline player — expands when row is active */}
                                            {playingVideoId === video.id && video.videoUrl && (
                                                <video src={video.videoUrl} controls autoPlay
                                                    style={{ width: '100%', maxHeight: '420px', display: 'block', background: '#000' }}
                                                    onEnded={() => setPlayingVideoId(null)} />
                                            )}
                                            {playingVideoId === video.id && !video.videoUrl && (
                                                <div style={{ padding: '14px', fontSize: '12px', color: 'var(--light-color)' }}>
                                                    No playable URL for this video.
                                                </div>
                                            )}
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

                    {activeTab === 'archive' && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)', display: 'grid', gap: '12px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--light-color)' }}>
                                Local archive stores folder path + retrieval URL metadata for on-demand access.
                            </div>
                            {archiveCounts.all === 0 ? (
                                <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>
                                    No archived media yet.
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {[...localArchive.music, ...localArchive.photo, ...localArchive.video].map((entry) => (
                                        <div key={entry.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                <div>
                                                    <strong>{entry.title}</strong>
                                                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{entry.type} · {entry.folderPath}</div>
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                                                    {new Date(entry.archivedAt).toLocaleString()}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#93c5fd', overflowWrap: 'anywhere' }}>
                                                URL: {entry.sourceUrl || 'Unavailable'}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => restoreArchivedItem(entry)}
                                                    style={{ border: '1px solid var(--border-color)', background: 'rgba(56,189,248,0.16)', color: 'var(--text-color)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}
                                                >
                                                    Restore to active
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeArchiveRecord(entry)}
                                                    style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.12)', color: '#fca5a5', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}
                                                >
                                                    Remove archive record
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
