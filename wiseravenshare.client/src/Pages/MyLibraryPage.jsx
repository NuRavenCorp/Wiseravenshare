import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FiAlertCircle,
    FiCheckCircle,
    FiClock,
    FiCopy,
    FiExternalLink,
    FiFolder,
    FiHardDrive,
    FiImage,
    FiMusic,
    FiRefreshCw,
    FiSearch,
    FiTrash2,
    FiUpload,
    FiVideo
} from 'react-icons/fi';
import { useNotification } from '../Contexts/NotificationContext';
import { useAuth } from '../Contexts/AuthContext';
import { apiService } from '../Services/api';

const TAB_OPTIONS = [
    { id: 'all', label: 'All' },
    { id: 'music', label: 'Music' },
    { id: 'photo', label: 'Photos' },
    { id: 'video', label: 'Videos' }
];

const LIMITS = {
    music: 30,
    photo: 30,
    video: 30
};

const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDate = (value) => {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};

// ✅ FIX: never persist blob: URLs. They are session-scoped and die on reload.
const isEphemeralUrl = (value) => /^blob:/i.test(String(value || '').trim());

const normalizeUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (isEphemeralUrl(raw)) return ''; // ✅ FIX
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            return `${parsed.pathname}${parsed.search}`;
        } catch {
            return raw;
        }
    }
    if (raw.startsWith('/') || raw.startsWith('data:')) return raw;
    if (raw.startsWith('api/')) return `/${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
    return '';
};

// ✅ FIX: use a single, generic media proxy route that works for images,
// audio, and video. Falls back to the video-streaming route only for video.
const buildMediaUrlFromPath = (relativePath = '', type = '') => {
    const normalized = String(relativePath || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
    if (!normalized) return '';
    const encoded = normalized.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    if (type === 'video') return `/api/videostreaming/blob/${encoded}`;
    // Generic Space-backed proxy route. If your backend exposes a different
    // one, change this single line.
    return `/api/media/blob/${encoded}`;
};

const inferTypeFromFile = (file) => {
    const mime = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|weba)$/i.test(name)) return 'music';
    if (mime.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name)) return 'video';
    return 'photo';
};

const pickFirstString = (...values) => {
    for (const value of values) {
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
};

// ✅ FIX: a single resolver that prefers a real server URL, then falls back
// to a deterministic proxy URL built from the persisted relative path.
const resolveMediaUrl = (item, type) => {
    const direct = normalizeUrl(
        pickFirstString(
            item?.mediaUrl,
            item?.MediaUrl,
            item?.url,
            item?.Url,
            item?.imageUrl,
            item?.ImageUrl,
            item?.videoUrl,
            item?.VideoUrl
        )
    );
    if (direct) return direct;

    const relativePath = pickFirstString(
        item?.relativePath,
        item?.RelativePath,
        item?.objectKey,
        item?.ObjectKey,
        item?.filePath,
        item?.FilePath,
        item?.file?.relativePath
    );
    return buildMediaUrlFromPath(relativePath, type);
};

const normalizeMusic = (item) => {
    const fileName = pickFirstString(item?.fileName, item?.FileName);
    const relativePath = pickFirstString(
        item?.relativePath,
        item?.RelativePath,
        item?.objectKey,
        item?.ObjectKey
    );
    const mediaUrl = resolveMediaUrl(item, 'music');

    return {
        id: pickFirstString(item?.id, item?.Id, fileName, `music-${Date.now()}`),
        type: 'music',
        title: pickFirstString(item?.title, item?.Title, fileName, 'Untitled track'),
        artist: pickFirstString(item?.artist, item?.Artist),
        album: pickFirstString(item?.album, item?.Album),
        genre: pickFirstString(item?.genre, item?.Genre),
        fileName,
        relativePath,
        mediaUrl,
        sizeBytes: Number(item?.sizeBytes || item?.SizeBytes || 0),
        uploadedAt: pickFirstString(
            item?.uploadedAt,
            item?.UploadedAt,
            item?.createdAt,
            item?.CreatedAt
        ),
        source: 'spaces'
    };
};

const normalizePhoto = (item) => {
    const fileName = pickFirstString(item?.fileName, item?.FileName);
    const relativePath = pickFirstString(
        item?.relativePath,
        item?.RelativePath,
        item?.objectKey,
        item?.ObjectKey
    );
    const mediaUrl = resolveMediaUrl(item, 'photo');

    return {
        id: pickFirstString(item?.id, item?.Id, fileName, `photo-${Date.now()}`),
        type: 'photo',
        title: pickFirstString(item?.title, item?.Title, fileName, 'Untitled photo'),
        description: pickFirstString(item?.description, item?.Description),
        fileName,
        relativePath,
        mediaUrl,
        thumbnailUrl: mediaUrl,
        sizeBytes: Number(item?.sizeBytes || item?.SizeBytes || 0),
        uploadedAt: pickFirstString(
            item?.uploadedAt,
            item?.UploadedAt,
            item?.createdAt,
            item?.CreatedAt
        ),
        source: 'spaces'
    };
};

const normalizeVideo = (item) => {
    const fileName = pickFirstString(item?.fileName, item?.FileName);
    const relativePath = pickFirstString(
        item?.relativePath,
        item?.RelativePath,
        item?.objectKey,
        item?.ObjectKey
    );
    const mediaUrl = resolveMediaUrl(item, 'video');

    return {
        id: pickFirstString(item?.id, item?.Id, fileName, `video-${Date.now()}`),
        type: 'video',
        title: pickFirstString(item?.title, item?.Title, fileName, 'Untitled video'),
        description: pickFirstString(item?.description, item?.Description),
        fileName,
        relativePath,
        mediaUrl,
        thumbnailUrl: normalizeUrl(item?.thumbnailUrl || item?.ThumbnailUrl) || mediaUrl,
        sizeBytes: Number(item?.sizeBytes || item?.SizeBytes || 0),
        uploadedAt: pickFirstString(
            item?.uploadedAt,
            item?.UploadedAt,
            item?.createdAt,
            item?.CreatedAt
        ),
        source: 'spaces'
    };
};

const readList = (payload, keys = ['items', 'data', 'tracks', 'videos', 'photos']) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
};

const MyLibraryPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const { addToast } = useNotification();
    const uploadInputRef = useRef(null);
    const isMountedRef = useRef(true);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [query, setQuery] = useState('');
    const [uploadType, setUploadType] = useState('music');
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadDescription, setUploadDescription] = useState('');
    const [uploadArtist, setUploadArtist] = useState('');
    const [uploadAlbum, setUploadAlbum] = useState('');
    const [uploadGenre, setUploadGenre] = useState('');
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [music, setMusic] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [videos, setVideos] = useState([]);
    const [error, setError] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // ✅ FIX: loadLibrary no longer depends on `refreshing`. That dependency
    // was causing the callback identity to change on every refresh toggle,
    // which re-fired the effect and produced duplicate/aborted fetches that
    // could overwrite freshly uploaded items with empty lists.
    const loadLibrary = useCallback(
        async ({ silent = false } = {}) => {
            if (!silent) setLoading(true);
            setError('');

            try {
                const [musicResult, photoResult, videoResult] = await Promise.allSettled([
                    apiService.getMusicLibrary(),
                    apiService.getPhotoLibrary(),
                    apiService.getVideoLibrary()
                ]);

                if (!isMountedRef.current) return;

                const musicItems =
                    musicResult.status === 'fulfilled'
                        ? readList(musicResult.value?.data, ['items', 'tracks', 'data']).map(normalizeMusic)
                        : [];
                const photoItems =
                    photoResult.status === 'fulfilled'
                        ? readList(photoResult.value?.data, ['data', 'items', 'photos']).map(normalizePhoto)
                        : [];
                const videoItems =
                    videoResult.status === 'fulfilled'
                        ? readList(videoResult.value?.data, ['videos', 'items', 'data']).map(normalizeVideo)
                        : [];

                setMusic(musicItems.filter(Boolean));
                setPhotos(photoItems.filter(Boolean));
                setVideos(videoItems.filter(Boolean));

                const failures = [musicResult, photoResult, videoResult].filter(
                    (r) => r.status === 'rejected'
                );
                if (failures.length) {
                    const reason = failures[0].reason;
                    const message =
                        reason?.message || 'Some media categories could not be loaded.';
                    setError(message);
                }
            } catch (loadError) {
                if (!isMountedRef.current) return;
                const message = loadError?.message || 'Unable to load the media library.';
                setError(message);
                addToast(message, 'error');
            } finally {
                if (isMountedRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [addToast]
    );

    useEffect(() => {
        void loadLibrary();
    }, [loadLibrary, user?.id]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        void loadLibrary({ silent: true });
    }, [loadLibrary]);

    const allItems = useMemo(() => [...music, ...photos, ...videos], [music, photos, videos]);

    const filteredItems = useMemo(() => {
        const term = query.trim().toLowerCase();
        const tabFilter = activeTab === 'all' ? null : activeTab;
        return allItems.filter((item) => {
            if (tabFilter && item.type !== tabFilter) return false;
            if (!term) return true;
            return [
                item.title,
                item.artist,
                item.album,
                item.genre,
                item.description,
                item.fileName,
                item.relativePath
            ].some((value) => String(value || '').toLowerCase().includes(term));
        });
    }, [activeTab, allItems, query]);

    useEffect(() => {
        if (
            selectedItem &&
            !allItems.some(
                (item) => item.id === selectedItem.id && item.type === selectedItem.type
            )
        ) {
            setSelectedItem(null);
        }
    }, [allItems, selectedItem]);

    const stats = useMemo(() => {
        const totalSize = allItems.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
        return {
            total: allItems.length,
            music: music.length,
            photo: photos.length,
            video: videos.length,
            totalSize
        };
    }, [allItems, music.length, photos.length, videos.length]);

    const uploadLimitReached = useMemo(() => {
        const counts = { music: music.length, photo: photos.length, video: videos.length };
        return Boolean(LIMITS[uploadType]) && counts[uploadType] >= LIMITS[uploadType];
    }, [music.length, photos.length, videos.length, uploadType]);

    const updateItemLists = useCallback((type, nextItem) => {
        if (!nextItem) return;
        if (type === 'music')
            setMusic((prev) => [nextItem, ...prev.filter((item) => item.id !== nextItem.id)]);
        if (type === 'photo')
            setPhotos((prev) => [nextItem, ...prev.filter((item) => item.id !== nextItem.id)]);
        if (type === 'video')
            setVideos((prev) => [nextItem, ...prev.filter((item) => item.id !== nextItem.id)]);
    }, []);

    const handleUpload = async (event) => {
        event.preventDefault();

        if (!uploadFile) {
            addToast('Choose a file first.', 'info');
            return;
        }

        if (uploadLimitReached) {
            addToast(
                `${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)} library is full. Delete an item first.`,
                'error'
            );
            return;
        }

        const title = String(uploadTitle || uploadFile.name || 'Untitled media').trim();
        const destinationFolder = `wiseravenshare/media/${uploadType}`;

        setUploading(true);
        setProgress(0);

        try {
            let response;
            if (uploadType === 'music') {
                response = await apiService.uploadMusicTrack(uploadFile, {
                    title,
                    artist: uploadArtist,
                    album: uploadAlbum,
                    genre: uploadGenre,
                    destinationFolder,
                    onProgress: setProgress
                });
            } else {
                response = await apiService.uploadMedia(uploadFile, uploadType, {
                    title,
                    description: uploadDescription,
                    destinationFolder,
                    caption: uploadDescription,
                    onProgress: setProgress
                });
            }

            const data = response?.data || response || {};

            // ✅ FIX: merge server response with local file info so we always
            // end up with a usable, persistent URL. If the server didn't echo
            // a mediaUrl but did give a relativePath, the normalizer builds a
            // deterministic proxy URL from it.
            const enriched = {
                id:
                    data.track?.id ||
                    data.id ||
                    `${uploadType}-${uploadFile.name}-${uploadFile.size}-${uploadFile.lastModified}`,
                title: data.track?.title || title,
                description: uploadDescription,
                artist: data.track?.artist || uploadArtist,
                album: data.track?.album || uploadAlbum,
                genre: data.track?.genre || uploadGenre,
                fileName: data.track?.fileName || data.fileName || uploadFile.name,
                relativePath:
                    data.track?.relativePath ||
                    data.relativePath ||
                    data.file?.relativePath ||
                    data.objectKey ||
                    data.filePath ||
                    '',
                mediaUrl:
                    data.track?.mediaUrl ||
                    data.mediaUrl ||
                    data.url ||
                    data.file?.mediaUrl ||
                    data.filePath ||
                    '',
                sizeBytes: uploadFile.size,
                uploadedAt: new Date().toISOString()
            };

            const nextItem =
                uploadType === 'music'
                    ? normalizeMusic(enriched)
                    : uploadType === 'photo'
                        ? normalizePhoto(enriched)
                        : normalizeVideo(enriched);

            // ✅ FIX: only commit the optimistic item if it actually has a
            // renderable URL. Otherwise we'd show a broken card that vanishes
            // on the next refresh anyway.
            if (!nextItem.mediaUrl) {
                // Try one silent re-sync from the server, since the upload
                // succeeded but the response shape was unexpected.
                await loadLibrary({ silent: true });
            } else {
                updateItemLists(uploadType, nextItem);
            }

            setUploadFile(null);
            setUploadTitle('');
            setUploadDescription('');
            setUploadArtist('');
            setUploadAlbum('');
            setUploadGenre('');
            setProgress(0);
            if (uploadInputRef.current) uploadInputRef.current.value = '';

            addToast(`${title} uploaded to Spaces.`, 'success');

            // ✅ FIX: silent re-sync so the server's canonical record (with
            // its persistent URL + id) replaces the optimistic one.
            await loadLibrary({ silent: true });
        } catch (uploadError) {
            addToast(uploadError?.message || 'Upload failed.', 'error');
        } finally {
            if (isMountedRef.current) setUploading(false);
        }
    };

    const handleDelete = async (item) => {
        const confirmed = window.confirm(`Delete "${item.title}" from the media library?`);
        if (!confirmed) return;

        // Optimistic remove
        if (item.type === 'music') {
            setMusic((prev) => prev.filter((entry) => entry.id !== item.id));
        } else if (item.type === 'photo') {
            setPhotos((prev) => prev.filter((entry) => entry.id !== item.id));
        } else if (item.type === 'video') {
            setVideos((prev) => prev.filter((entry) => entry.id !== item.id));
        }

        try {
            if (item.type === 'music') {
                await apiService.deleteMusicLibraryItem(item.id);
            } else if (item.type === 'photo') {
                await apiService.deletePhotoLibraryItem(item.id);
            } else if (item.type === 'video') {
                await apiService.deleteVideoLibraryItem(item.id);
            }
            addToast('Media removed.', 'success');
        } catch (deleteError) {
            addToast(deleteError?.message || 'Failed to delete media.', 'error');
            // ✅ FIX: re-sync so the UI matches the server after a failed delete.
            await loadLibrary({ silent: true });
        }
    };

    const handleCopy = async (value) => {
        const text = String(value || '').trim();
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            addToast('Copied media URL.', 'success');
        } catch {
            addToast('Unable to copy media URL.', 'error');
        }
    };

    const renderedItems = filteredItems.map((item) => (
        <article
            key={`${item.type}-${item.id}`}
            style={{
                ...cardStyle,
                cursor: 'pointer',
                outline:
                    selectedItem?.id === item.id && selectedItem?.type === item.type
                        ? '2px solid rgba(59,130,246,0.8)'
                        : 'none'
            }}
            onDoubleClick={() => setSelectedItem(item)}
            title="Double-click to render this file"
        >
            <div style={thumbStyle}>
                {item.type === 'photo' && item.mediaUrl ? (
                    <img
                        src={item.mediaUrl}
                        alt={item.title}
                        style={mediaPreviewStyle}
                        loading="lazy"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                ) : (
                    <div style={iconPlaceholderStyle}>
                        {item.type === 'music' ? (
                            <FiMusic />
                        ) : item.type === 'photo' ? (
                            <FiImage />
                        ) : (
                            <FiVideo />
                        )}
                    </div>
                )}
            </div>

            <div style={bodyStyle}>
                <div style={titleRowStyle}>
                    <strong style={titleStyle}>{item.fileName || item.title}</strong>
                    <span style={pillStyle}>
                        {item.type === 'music' ? 'music-library' : item.type}
                    </span>
                </div>
                {item.title && item.title !== item.fileName ? (
                    <div style={mutedStyle}>{item.title}</div>
                ) : null}
                {item.artist ? <div style={mutedStyle}>{item.artist}</div> : null}
                {item.album ? <div style={mutedStyle}>{item.album}</div> : null}
                {item.description ? (
                    <div style={descriptionStyle}>{item.description}</div>
                ) : null}

                <div style={metaGridStyle}>
                    <span>
                        <FiFolder style={metaIconStyle} />{' '}
                        {item.relativePath || 'Spaces managed'}
                    </span>
                    <span>
                        <FiHardDrive style={metaIconStyle} /> {formatBytes(item.sizeBytes)}
                    </span>
                    <span>
                        <FiClock style={metaIconStyle} /> {formatDate(item.uploadedAt)}
                    </span>
                    <span>{item.fileName || 'Unknown file'}</span>
                </div>

                <div style={actionsStyle}>
                    <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() =>
                            item.mediaUrl &&
                            window.open(item.mediaUrl, '_blank', 'noopener,noreferrer')
                        }
                        disabled={!item.mediaUrl}
                    >
                        <FiExternalLink /> Open
                    </button>

                    <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() => handleCopy(item.mediaUrl)}
                        disabled={!item.mediaUrl}
                    >
                        <FiCopy /> Copy URL
                    </button>

                    <button
                        type="button"
                        style={dangerButtonStyle}
                        onClick={() => handleDelete(item)}
                    >
                        <FiTrash2 /> Delete
                    </button>
                </div>
            </div>
        </article>
    ));

    return (
        <div style={pageStyle}>
            <section style={heroStyle}>
                <div>
                    <div style={eyebrowStyle}>
                        Media Library · DigitalOcean Spaces + metadata
                    </div>
                    <h1 style={headingStyle}>Media Library</h1>
                    <p style={subheadingStyle}>
                        Upload once, store in Spaces, and organize everything through metadata
                        instead of scanning buckets.
                    </p>
                </div>

                <div style={summaryGridStyle}>
                    <div style={summaryCardStyle}>
                        <strong>{stats.total}</strong>
                        <span>Total files</span>
                    </div>
                    <div style={summaryCardStyle}>
                        <strong>{stats.music}</strong>
                        <span>Music</span>
                    </div>
                    <div style={summaryCardStyle}>
                        <strong>{stats.photo}</strong>
                        <span>Photos</span>
                    </div>
                    <div style={summaryCardStyle}>
                        <strong>{stats.video}</strong>
                        <span>Videos</span>
                    </div>
                    <div style={summaryCardStyle}>
                        <strong>{formatBytes(stats.totalSize)}</strong>
                        <span>Total size</span>
                    </div>
                </div>
            </section>

            <section style={layoutStyle}>
                <aside style={panelStyle}>
                    <div style={panelHeaderStyle}>
                        <FiUpload />
                        <strong>Upload to Library</strong>
                    </div>
                    <form onSubmit={handleUpload} style={formStyle}>
                        <label style={fieldStyle}>
                            Type
                            <select
                                value={uploadType}
                                onChange={(e) => setUploadType(e.target.value)}
                                style={inputStyle}
                            >
                                <option value="music">Music</option>
                                <option value="photo">Photo</option>
                                <option value="video">Video</option>
                            </select>
                        </label>

                        <label style={fieldStyle}>
                            File
                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept="image/*,video/*,audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.mp4,.mov,.webm,.mkv,.avi"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    setUploadFile(file);
                                    if (file && !uploadTitle) {
                                        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
                                    }
                                    if (file) {
                                        setUploadType(inferTypeFromFile(file));
                                    }
                                }}
                                style={inputStyle}
                            />
                        </label>

                        <label style={fieldStyle}>
                            Title
                            <input
                                value={uploadTitle}
                                onChange={(e) => setUploadTitle(e.target.value)}
                                placeholder="File title"
                                style={inputStyle}
                            />
                        </label>

                        {uploadType === 'music' ? (
                            <>
                                <label style={fieldStyle}>
                                    Artist
                                    <input
                                        value={uploadArtist}
                                        onChange={(e) => setUploadArtist(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={fieldStyle}>
                                    Album
                                    <input
                                        value={uploadAlbum}
                                        onChange={(e) => setUploadAlbum(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={fieldStyle}>
                                    Genre
                                    <input
                                        value={uploadGenre}
                                        onChange={(e) => setUploadGenre(e.target.value)}
                                        style={inputStyle}
                                    />
                                </label>
                            </>
                        ) : (
                            <label style={fieldStyle}>
                                Description
                                <textarea
                                    value={uploadDescription}
                                    onChange={(e) => setUploadDescription(e.target.value)}
                                    rows={3}
                                    style={inputStyle}
                                />
                            </label>
                        )}

                        <button
                            type="submit"
                            disabled={uploading || !uploadFile}
                            style={uploadButtonStyle}
                        >
                            {uploading ? (
                                <>
                                    <FiRefreshCw className="spin" /> Uploading {progress}%
                                </>
                            ) : (
                                <>
                                    <FiUpload /> Upload
                                </>
                            )}
                        </button>
                    </form>

                    <div style={noteStyle}>
                        This library is for proprietary, original music only. Upload once to
                        Spaces, then shape your sound with the FM Radio graphic equalizer; the
                        database tracks metadata, ownership, and URLs.
                    </div>
                </aside>

                <main style={mainStyle}>
                    <div style={toolbarStyle}>
                        <div style={tabsStyle}>
                            {TAB_OPTIONS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    style={activeTab === tab.id ? activeTabStyle : tabStyle}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div style={searchWrapStyle}>
                            <FiSearch style={{ opacity: 0.7 }} />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by title, file name, path, artist..."
                                style={searchInputStyle}
                            />
                            <button
                                type="button"
                                onClick={handleRefresh}
                                style={refreshButtonStyle}
                                disabled={refreshing}
                            >
                                <FiRefreshCw className={refreshing ? 'spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {error ? (
                        <div style={errorStyle}>
                            <FiAlertCircle /> {error}
                        </div>
                    ) : null}

                    {loading ? (
                        <div style={emptyStyle}>Loading library...</div>
                    ) : filteredItems.length === 0 ? (
                        <div style={emptyStyle}>
                            <FiCheckCircle size={24} />
                            <strong>No media found</strong>
                            <span>Upload photos, videos, or music to populate your library.</span>
                        </div>
                    ) : (
                        <div style={gridStyle}>{renderedItems}</div>
                    )}

                    <section style={previewStyle}>
                        <div style={previewHeaderStyle}>
                            <strong>Render preview</strong>
                            <span>Double-click a file card to render it here.</span>
                        </div>
                        <div style={previewFrameStyle}>
                            {selectedItem ? (
                                renderPreview(selectedItem)
                            ) : (
                                <div style={previewEmptyStyle}>
                                    <FiExternalLink size={24} />
                                    <span>No file selected yet.</span>
                                </div>
                            )}
                        </div>
                    </section>
                </main>
            </section>
        </div>
    );
};

const renderPreview = (item) => {
    const source = item?.mediaUrl || '';
    if (!source) {
        return (
            <div style={previewEmptyStyle}>
                <FiAlertCircle size={24} />
                <span>That file does not have a renderable URL yet.</span>
            </div>
        );
    }

    if (item.type === 'photo') {
        return <img src={source} alt={item.title || item.fileName} style={previewMediaStyle} />;
    }

    if (item.type === 'video') {
        return <video src={source} controls style={previewMediaStyle} />;
    }

    if (item.type === 'music') {
        return (
            <div style={previewAudioWrapStyle}>
                <audio src={source} controls style={previewAudioStyle} />
                <div style={previewCaptionStyle}>
                    <strong>{item.fileName || item.title}</strong>
                    {item.artist ? <span>{item.artist}</span> : null}
                </div>
            </div>
        );
    }

    return (
        <div style={previewEmptyStyle}>
            <FiFolder size={24} />
            <span>{item.fileName || item.title}</span>
        </div>
    );
};

const DARK_BG = '#050816';
const DARK_PANEL = '#0b1220';
const DARK_PANEL_ALT = '#101a2d';
const DARK_PANEL_ELEVATED = '#14213b';
const DARK_BORDER = 'rgba(148, 163, 184, 0.22)';
const DARK_BORDER_STRONG = 'rgba(96, 165, 250, 0.38)';
const DARK_TEXT = '#e5eefb';
const DARK_MUTED = '#94a3b8';
const DARK_ACCENT = '#60a5fa';
const DARK_ACCENT_ALT = '#a855f7';

const pageStyle = {
    display: 'grid',
    gap: '16px',
    padding: '16px 0 24px',
    color: DARK_TEXT
};
const heroStyle = {
    display: 'grid',
    gap: '14px',
    padding: '20px',
    border: `1px solid ${DARK_BORDER_STRONG}`,
    borderRadius: '18px',
    background: `linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(17, 24, 39, 0.94)),
        radial-gradient(circle at top right, rgba(96, 165, 250, 0.20), transparent 40%),
        radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.18), transparent 38%)`,
    boxShadow: '0 18px 50px rgba(2, 6, 23, 0.45)'
};
const eyebrowStyle = {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: DARK_ACCENT,
    opacity: 0.92
};
const headingStyle = { margin: '6px 0 0', fontSize: '34px', lineHeight: 1.1, color: '#f8fbff' };
const subheadingStyle = {
    margin: '8px 0 0',
    maxWidth: '780px',
    color: DARK_MUTED,
    lineHeight: 1.6
};
const summaryGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '10px'
};
const summaryCardStyle = {
    border: `1px solid ${DARK_BORDER}`,
    borderRadius: '14px',
    padding: '12px',
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(9, 14, 26, 0.96))',
    display: 'grid',
    gap: '4px',
    color: DARK_TEXT,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
};
const layoutStyle = {
    display: 'grid',
    gridTemplateColumns: '320px minmax(0, 1fr)',
    gap: '16px',
    alignItems: 'start'
};
const panelStyle = {
    border: `1px solid ${DARK_BORDER}`,
    borderRadius: '18px',
    padding: '16px',
    background: `linear-gradient(180deg, ${DARK_PANEL_ALT}, ${DARK_PANEL})`,
    display: 'grid',
    gap: '14px',
    color: DARK_TEXT,
    boxShadow: '0 10px 28px rgba(2, 6, 23, 0.35)'
};
const panelHeaderStyle = { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px' };
const formStyle = { display: 'grid', gap: '10px' };
const fieldStyle = { display: 'grid', gap: '6px', fontSize: '13px', color: DARK_MUTED };
const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: '10px',
    border: `1px solid ${DARK_BORDER}`,
    background: 'rgba(15, 23, 42, 0.92)',
    color: DARK_TEXT,
    padding: '10px 12px'
};
const uploadButtonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 14px',
    color: '#fff',
    background: 'linear-gradient(135deg, #3b82f6, #a855f7)',
    cursor: 'pointer',
    fontWeight: 700
};
const noteStyle = {
    padding: '12px',
    borderRadius: '12px',
    border: `1px solid ${DARK_BORDER}`,
    background: 'rgba(37, 99, 235, 0.14)',
    color: DARK_MUTED,
    fontSize: '13px',
    lineHeight: 1.5
};
const mainStyle = { minWidth: 0, display: 'grid', gap: '14px' };
const toolbarStyle = { display: 'grid', gap: '12px' };
const tabsStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px' };
const tabStyle = {
    border: `1px solid ${DARK_BORDER}`,
    borderRadius: '999px',
    padding: '8px 14px',
    background: 'rgba(15, 23, 42, 0.88)',
    color: DARK_TEXT,
    cursor: 'pointer'
};
const activeTabStyle = {
    ...tabStyle,
    background: `linear-gradient(135deg, ${DARK_ACCENT}, ${DARK_ACCENT_ALT})`,
    color: '#fff',
    borderColor: 'transparent'
};
const searchWrapStyle = {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '14px',
    border: `1px solid ${DARK_BORDER}`,
    background: `linear-gradient(180deg, ${DARK_PANEL_ALT}, ${DARK_PANEL})`
};
const searchInputStyle = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: DARK_TEXT
};
const refreshButtonStyle = {
    border: 'none',
    background: 'transparent',
    color: DARK_TEXT,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center'
};
const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '14px'
};
const previewStyle = {
    display: 'grid',
    gap: '12px',
    border: `1px solid ${DARK_BORDER}`,
    borderRadius: '18px',
    padding: '16px',
    background: `linear-gradient(180deg, ${DARK_PANEL_ALT}, ${DARK_PANEL})`,
    boxShadow: '0 10px 28px rgba(2, 6, 23, 0.35)'
};
const previewHeaderStyle = {
    display: 'grid',
    gap: '4px',
    color: DARK_MUTED,
    fontSize: '13px'
};
const previewFrameStyle = {
    minHeight: '180px',
    display: 'grid',
    placeItems: 'center',
    border: `1px dashed ${DARK_BORDER}`,
    borderRadius: '16px',
    padding: '12px',
    background: 'rgba(5, 8, 22, 0.78)'
};
const previewMediaStyle = { maxWidth: '100%', maxHeight: '360px', borderRadius: '12px' };
const previewAudioWrapStyle = {
    width: '100%',
    display: 'grid',
    gap: '10px',
    justifyItems: 'center'
};
const previewAudioStyle = { width: '100%', maxWidth: '520px' };
const previewCaptionStyle = {
    display: 'grid',
    gap: '4px',
    textAlign: 'center',
    color: DARK_MUTED
};
const previewEmptyStyle = {
    display: 'grid',
    placeItems: 'center',
    gap: '10px',
    textAlign: 'center',
    color: DARK_MUTED
};
const cardStyle = {
    border: `1px solid ${DARK_BORDER}`,
    borderRadius: '18px',
    background: `linear-gradient(180deg, ${DARK_PANEL_ALT}, ${DARK_PANEL})`,
    overflow: 'hidden',
    display: 'grid',
    color: DARK_TEXT,
    boxShadow: '0 10px 24px rgba(2, 6, 23, 0.26)'
};
const thumbStyle = {
    aspectRatio: '16 / 9',
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(5, 8, 22, 0.98))',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden'
};
const mediaPreviewStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const iconPlaceholderStyle = {
    width: '100%',
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    fontSize: '42px',
    color: 'rgba(148, 163, 184, 0.45)'
};
const bodyStyle = { display: 'grid', gap: '10px', padding: '14px' };
const titleRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px'
};
const titleStyle = { fontSize: '16px', lineHeight: 1.3 };
const pillStyle = {
    padding: '4px 8px',
    borderRadius: '999px',
    background: 'rgba(59, 130, 246, 0.16)',
    color: '#bfdbfe',
    fontSize: '12px',
    textTransform: 'uppercase'
};
const mutedStyle = { color: DARK_MUTED, fontSize: '13px' };
const descriptionStyle = { color: DARK_MUTED, fontSize: '13px', lineHeight: 1.5 };
const metaGridStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '4px',
    fontSize: '12px',
    color: DARK_MUTED
};
const metaIconStyle = { verticalAlign: 'middle', marginRight: '4px' };
const actionsStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px' };
const secondaryButtonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    border: `1px solid ${DARK_BORDER}`,
    borderRadius: '10px',
    padding: '8px 10px',
    background: 'rgba(15, 23, 42, 0.92)',
    color: DARK_TEXT,
    cursor: 'pointer'
};
const dangerButtonStyle = {
    ...secondaryButtonStyle,
    background: 'rgba(239,68,68,0.10)',
    color: '#fca5a5',
    borderColor: 'rgba(239,68,68,0.30)'
};
const errorStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 14px',
    borderRadius: '12px',
    background: 'rgba(239,68,68,0.10)',
    border: '1px solid rgba(239,68,68,0.28)',
    color: '#fecaca'
};
const emptyStyle = {
    display: 'grid',
    placeItems: 'center',
    gap: '8px',
    padding: '32px',
    border: `1px dashed ${DARK_BORDER}`,
    borderRadius: '18px',
    color: DARK_MUTED,
    background: 'rgba(5, 8, 22, 0.78)'
};

export default MyLibraryPage;