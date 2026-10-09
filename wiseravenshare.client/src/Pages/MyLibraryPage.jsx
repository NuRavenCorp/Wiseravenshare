import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
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
    FiVideo,
} from 'react-icons/fi';
import { useNotification } from '../Contexts/NotificationContext';
import { useAuth } from '../Contexts/AuthContext';
import { apiService } from '../Services/api';
import { useSavedMedia } from '../hooks/useSavedMedia';
import { buildMediaSharePayload, socialService } from '../Services/socialService';

/* =====================================================================
 *  Constants
 * ===================================================================== */

const TAB_OPTIONS = [
    { id: 'all', label: 'All' },
    { id: 'music', label: 'Music' },
    { id: 'photo', label: 'Photos' },
    { id: 'video', label: 'Videos' },
    { id: 'archive', label: 'Local Archive' },
];

const LIMITS = { music: 30, photo: 30, video: 30 };

const STORAGE_KEYS = {
    state: 'ml:state:v2',
    cache: 'ml:cache:v2',
    pending: 'ml:pending-uploads:v1',
};

const MAX_CACHE_ITEMS = 500;

const SAVED_MEDIA_TYPE_LOOKUP = {
    0: 'photo',
    1: 'video',
    2: 'music',
    3: 'audio',
    4: 'podcast',
    5: 'document',
};

/* =====================================================================
 *  Utilities
 * ===================================================================== */

const safeStorage = {
    get(key) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },
};

const readState = () => safeStorage.get(STORAGE_KEYS.state) || {};
const writeState = (state) => safeStorage.set(STORAGE_KEYS.state, state || {});
const readCache = () => safeStorage.get(STORAGE_KEYS.cache) || [];
const writeCache = (items) =>
    safeStorage.set(
        STORAGE_KEYS.cache,
        (items || []).slice(0, MAX_CACHE_ITEMS)
    );
const readPending = () => safeStorage.get(STORAGE_KEYS.pending) || [];
const writePending = (rows) => safeStorage.set(STORAGE_KEYS.pending, rows || []);

const pickFirstString = (...values) => {
    for (const value of values) {
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
};

const isEphemeralUrl = (value) => /^blob:/i.test(String(value || '').trim());

const normalizeUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (isEphemeralUrl(raw)) return '';
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

const buildMediaUrlFromPath = (relativePath = '', type = '') => {
    const normalized = String(relativePath || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
    if (!normalized) return '';
    const encoded = normalized
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');
    if (type === 'video') return `/api/videostreaming/blob/${encoded}`;
    return `/api/media/blob/${encoded}`;
};

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

const inferTypeFromFile = (file) => {
    const mime = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (
        mime.startsWith('audio/') ||
        /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|weba)$/i.test(name)
    ) {
        return 'music';
    }
    if (
        mime.startsWith('video/') ||
        /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name)
    ) {
        return 'video';
    }
    return 'photo';
};

const normalizeSavedMediaType = (value) => {
    if (typeof value === 'number') return SAVED_MEDIA_TYPE_LOOKUP[value] || '';
    return String(value || '').trim().toLowerCase();
};

const readList = (
    payload,
    keys = ['items', 'data', 'tracks', 'videos', 'photos']
) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
};

const getItemKey = (item) =>
    `${String(item?.type || 'media').toLowerCase()}:${String(
        item?.id || item?.relativePath || item?.fileName || ''
    )}`;

const getItemState = (item, state) =>
    state?.[getItemKey(item)] || {
        archived: Boolean(item?.archived || item?.isArchived || item?.Archived),
        protected: Boolean(
            item?.protected || item?.isProtected || item?.Protected
        ),
    };

const getMediaIdentity = (item) => {
    const type = String(item?.type || item?.mediaType || '')
        .trim()
        .toLowerCase();
    const key = String(item?.objectKey || item?.relativePath || '')
        .trim()
        .toLowerCase();
    const url = String(item?.mediaUrl || '').trim().toLowerCase();
    const id = String(item?.id || '').trim().toLowerCase();
    return `${type}:${key || url || id}`;
};

const mergeUniqueMedia = (...groups) => {
    const seen = new Set();
    const merged = [];
    for (const group of groups) {
        for (const item of group || []) {
            if (!item) continue;
            const key = getMediaIdentity(item);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
        }
    }
    return merged;
};

const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDate = (value) => {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};

/* =====================================================================
 *  Normalizers — every item that enters state has this exact shape:
 *
 *    { id, type, title, artist, album, genre, description,
 *      fileName, relativePath, objectKey, mediaUrl, thumbnailUrl,
 *      sizeBytes, uploadedAt, archived, protected, source }
 * ===================================================================== */

const normalizeSavedMediaItem = (item) => {
    const metadata = item?.mediaMetadata || {};
    const mediaType = normalizeSavedMediaType(item?.mediaType);
    const relativePath = pickFirstString(
        metadata?.relativePath,
        metadata?.objectKey,
        metadata?.filePath
    );
    return {
        id: item?.id,
        type: mediaType,
        title: String(item?.title || '').trim(),
        artist: String(metadata?.artist || '').trim(),
        album: String(metadata?.album || '').trim(),
        genre: String(metadata?.genre || '').trim(),
        description: String(
            item?.description || metadata?.description || ''
        ).trim(),
        fileName: String(metadata?.fileName || item?.title || '').trim(),
        relativePath,
        objectKey: pickFirstString(metadata?.objectKey, metadata?.relativePath),
        mediaUrl: resolveMediaUrl(
            { mediaUrl: item?.mediaUrl, relativePath },
            mediaType
        ),
        thumbnailUrl: String(
            item?.thumbnailUrl || metadata?.thumbnailUrl || ''
        ).trim(),
        sizeBytes: Number(item?.fileSizeBytes || 0),
        uploadedAt: String(item?.createdAt || item?.updatedAt || '').trim(),
        archived: Boolean(metadata?.archived),
        protected: Boolean(metadata?.protected),
        source: 'saved-media',
        mediaMetadata: metadata,
    };
};

const normalizeMusic = (item) => {
    const fileName = pickFirstString(item?.fileName, item?.FileName);
    const relativePath = pickFirstString(
        item?.relativePath,
        item?.RelativePath,
        item?.objectKey,
        item?.ObjectKey
    );
    return {
        id: pickFirstString(item?.id, item?.Id, fileName, `music-${Date.now()}`),
        type: 'music',
        title: pickFirstString(
            item?.title,
            item?.Title,
            fileName,
            'Untitled track'
        ),
        artist: pickFirstString(item?.artist, item?.Artist),
        album: pickFirstString(item?.album, item?.Album),
        genre: pickFirstString(item?.genre, item?.Genre),
        description: '',
        fileName,
        relativePath,
        objectKey: relativePath,
        mediaUrl: resolveMediaUrl({ ...item, relativePath }, 'music'),
        thumbnailUrl: '',
        sizeBytes: Number(item?.sizeBytes || item?.SizeBytes || 0),
        uploadedAt: pickFirstString(
            item?.uploadedAt,
            item?.UploadedAt,
            item?.createdAt,
            item?.CreatedAt
        ),
        archived: Boolean(item?.archived || item?.isArchived || item?.Archived),
        protected: Boolean(
            item?.protected || item?.isProtected || item?.Protected
        ),
        source: 'spaces',
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
    const mediaUrl = resolveMediaUrl({ ...item, relativePath }, 'photo');
    return {
        id: pickFirstString(item?.id, item?.Id, fileName, `photo-${Date.now()}`),
        type: 'photo',
        title: pickFirstString(
            item?.title,
            item?.Title,
            fileName,
            'Untitled photo'
        ),
        artist: '',
        album: '',
        genre: '',
        description: pickFirstString(item?.description, item?.Description),
        fileName,
        relativePath,
        objectKey: relativePath,
        mediaUrl,
        thumbnailUrl: mediaUrl,
        sizeBytes: Number(item?.sizeBytes || item?.SizeBytes || 0),
        uploadedAt: pickFirstString(
            item?.uploadedAt,
            item?.UploadedAt,
            item?.createdAt,
            item?.CreatedAt
        ),
        archived: Boolean(
            item?.archived ||
            item?.isArchived ||
            item?.Archived ||
            item?.mediaMetadata?.archived
        ),
        protected: Boolean(
            item?.protected ||
            item?.isProtected ||
            item?.Protected ||
            item?.mediaMetadata?.protected
        ),
        source: 'spaces',
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
    const mediaUrl = resolveMediaUrl({ ...item, relativePath }, 'video');
    return {
        id: pickFirstString(item?.id, item?.Id, fileName, `video-${Date.now()}`),
        type: 'video',
        title: pickFirstString(
            item?.title,
            item?.Title,
            fileName,
            'Untitled video'
        ),
        artist: '',
        album: '',
        genre: '',
        description: pickFirstString(item?.description, item?.Description),
        fileName,
        relativePath,
        objectKey: relativePath,
        mediaUrl,
        thumbnailUrl:
            normalizeUrl(item?.thumbnailUrl || item?.ThumbnailUrl) || mediaUrl,
        sizeBytes: Number(item?.sizeBytes || item?.SizeBytes || 0),
        uploadedAt: pickFirstString(
            item?.uploadedAt,
            item?.UploadedAt,
            item?.createdAt,
            item?.CreatedAt
        ),
        archived: Boolean(item?.archived || item?.isArchived || item?.Archived),
        protected: Boolean(
            item?.protected || item?.isProtected || item?.Protected
        ),
        source: 'spaces',
    };
};

/* =====================================================================
 *  Styles — declared before anything reads them, so no TDZ risk.
 * ===================================================================== */

const DARK_PANEL = '#0b1220';
const DARK_PANEL_ALT = '#101a2d';
const DARK_BORDER = 'rgba(148, 163, 184, 0.22)';
const DARK_BORDER_STRONG = 'rgba(96, 165, 250, 0.38)';
const DARK_TEXT = '#e5eefb';
const DARK_MUTED = '#94a3b8';
const DARK_ACCENT = '#60a5fa';
const DARK_ACCENT_ALT = '#a855f7';

const pillBase = {
    padding: '4px 8px',
    borderRadius: '999px',
    fontSize: '12px',
    textTransform: 'uppercase',
};

const buttonBase = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    border: `1px solid ${DARK_BORDER}`,
    borderRadius: '10px',
    padding: '8px 10px',
    background: 'rgba(15, 23, 42, 0.92)',
    color: DARK_TEXT,
    cursor: 'pointer',
};

const styles = {
    page: {
        display: 'grid',
        gap: '16px',
        padding: '16px 0 24px',
        color: DARK_TEXT,
    },
    hero: {
        display: 'grid',
        gap: '14px',
        padding: '20px',
        border: `1px solid ${DARK_BORDER_STRONG}`,
        borderRadius: '18px',
        background: `linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(17, 24, 39, 0.94)),
            radial-gradient(circle at top right, rgba(96, 165, 250, 0.20), transparent 40%),
            radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.18), transparent 38%)`,
        boxShadow: '0 18px 50px rgba(2, 6, 23, 0.45)',
    },
    eyebrow: {
        fontSize: '12px',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: DARK_ACCENT,
        opacity: 0.92,
    },
    heading: {
        margin: '6px 0 0',
        fontSize: '34px',
        lineHeight: 1.1,
        color: '#f8fbff',
    },
    subheading: {
        margin: '8px 0 0',
        maxWidth: '780px',
        color: DARK_MUTED,
        lineHeight: 1.6,
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '10px',
    },
    summaryCard: {
        border: `1px solid ${DARK_BORDER}`,
        borderRadius: '14px',
        padding: '12px',
        background:
            'linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(9, 14, 26, 0.96))',
        display: 'grid',
        gap: '4px',
        color: DARK_TEXT,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    },
    layout: {
        display: 'grid',
        gridTemplateColumns: '320px minmax(0, 1fr)',
        gap: '16px',
        alignItems: 'start',
    },
    panel: {
        border: `1px solid ${DARK_BORDER}`,
        borderRadius: '18px',
        padding: '16px',
        background: `linear-gradient(180deg, ${DARK_PANEL_ALT}, ${DARK_PANEL})`,
        display: 'grid',
        gap: '14px',
        color: DARK_TEXT,
        boxShadow: '0 10px 28px rgba(2, 6, 23, 0.35)',
    },
    panelHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '16px',
    },
    form: { display: 'grid', gap: '10px' },
    field: { display: 'grid', gap: '6px', fontSize: '13px', color: DARK_MUTED },
    input: {
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: '10px',
        border: `1px solid ${DARK_BORDER}`,
        background: 'rgba(15, 23, 42, 0.92)',
        color: DARK_TEXT,
        padding: '10px 12px',
    },
    uploadButton: {
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
        fontWeight: 700,
    },
    note: {
        padding: '12px',
        borderRadius: '12px',
        border: `1px solid ${DARK_BORDER}`,
        background: 'rgba(37, 99, 235, 0.14)',
        color: DARK_MUTED,
        fontSize: '13px',
        lineHeight: 1.5,
    },
    main: { minWidth: 0, display: 'grid', gap: '14px' },
    toolbar: { display: 'grid', gap: '12px' },
    tabs: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
    tab: {
        border: `1px solid ${DARK_BORDER}`,
        borderRadius: '999px',
        padding: '8px 14px',
        background: 'rgba(15, 23, 42, 0.88)',
        color: DARK_TEXT,
        cursor: 'pointer',
    },
    activeTab: {
        border: '1px solid transparent',
        borderRadius: '999px',
        padding: '8px 14px',
        background: `linear-gradient(135deg, ${DARK_ACCENT}, ${DARK_ACCENT_ALT})`,
        color: '#fff',
        cursor: 'pointer',
    },
    searchWrap: {
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '14px',
        border: `1px solid ${DARK_BORDER}`,
        background: `linear-gradient(180deg, ${DARK_PANEL_ALT}, ${DARK_PANEL})`,
    },
    searchInput: {
        width: '100%',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        color: DARK_TEXT,
    },
    refreshButton: {
        border: 'none',
        background: 'transparent',
        color: DARK_TEXT,
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '14px',
    },
    card: {
        border: `1px solid ${DARK_BORDER}`,
        borderRadius: '18px',
        background: `linear-gradient(180deg, ${DARK_PANEL_ALT}, ${DARK_PANEL})`,
        overflow: 'hidden',
        display: 'grid',
        color: DARK_TEXT,
        boxShadow: '0 10px 24px rgba(2, 6, 23, 0.26)',
    },
    thumb: {
        aspectRatio: '16 / 9',
        background:
            'linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(5, 8, 22, 0.98))',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
    },
    mediaPreview: { width: '100%', height: '100%', objectFit: 'cover' },
    iconPlaceholder: {
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        fontSize: '42px',
        color: 'rgba(148, 163, 184, 0.45)',
    },
    body: { display: 'grid', gap: '10px', padding: '14px' },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
    },
    title: { fontSize: '16px', lineHeight: 1.3 },
    pill: {
        ...pillBase,
        background: 'rgba(59, 130, 246, 0.16)',
        color: '#bfdbfe',
    },
    archivePill: {
        ...pillBase,
        background: 'rgba(251, 191, 36, 0.16)',
        color: '#fde68a',
    },
    protectedPill: {
        ...pillBase,
        background: 'rgba(34, 197, 94, 0.16)',
        color: '#86efac',
    },
    muted: { color: DARK_MUTED, fontSize: '13px' },
    description: { color: DARK_MUTED, fontSize: '13px', lineHeight: 1.5 },
    metaGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '4px',
        fontSize: '12px',
        color: DARK_MUTED,
    },
    metaIcon: { verticalAlign: 'middle', marginRight: '4px' },
    actions: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
    secondaryButton: { ...buttonBase },
    dangerButton: {
        ...buttonBase,
        background: 'rgba(239,68,68,0.10)',
        color: '#fca5a5',
        borderColor: 'rgba(239,68,68,0.30)',
    },
    error: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 14px',
        borderRadius: '12px',
        background: 'rgba(239,68,68,0.10)',
        border: '1px solid rgba(239,68,68,0.28)',
        color: '#fecaca',
    },
    empty: {
        display: 'grid',
        placeItems: 'center',
        gap: '8px',
        padding: '32px',
        border: `1px dashed ${DARK_BORDER}`,
        borderRadius: '18px',
        color: DARK_MUTED,
        background: 'rgba(5, 8, 22, 0.78)',
    },
    preview: {
        display: 'grid',
        gap: '12px',
        border: `1px solid ${DARK_BORDER}`,
        borderRadius: '18px',
        padding: '16px',
        background: `linear-gradient(180deg, ${DARK_PANEL_ALT}, ${DARK_PANEL})`,
        boxShadow: '0 10px 28px rgba(2, 6, 23, 0.35)',
    },
    previewHeader: {
        display: 'grid',
        gap: '4px',
        color: DARK_MUTED,
        fontSize: '13px',
    },
    previewFrame: {
        minHeight: '180px',
        display: 'grid',
        placeItems: 'center',
        border: `1px dashed ${DARK_BORDER}`,
        borderRadius: '16px',
        padding: '12px',
        background: 'rgba(5, 8, 22, 0.78)',
    },
    previewMedia: {
        maxWidth: '100%',
        maxHeight: '360px',
        borderRadius: '12px',
    },
    previewAudioWrap: {
        width: '100%',
        display: 'grid',
        gap: '10px',
        justifyItems: 'center',
    },
    previewAudio: { width: '100%', maxWidth: '520px' },
    previewCaption: {
        display: 'grid',
        gap: '4px',
        textAlign: 'center',
        color: DARK_MUTED,
    },
    previewEmpty: {
        display: 'grid',
        placeItems: 'center',
        gap: '10px',
        textAlign: 'center',
        color: DARK_MUTED,
    },
    resumeBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 14px',
        borderRadius: '14px',
        border: '1px solid rgba(251, 191, 36, 0.4)',
        background: 'rgba(251, 191, 36, 0.10)',
        color: '#fde68a',
        fontSize: '13px',
    },
};

/* =====================================================================
 *  renderPreview — single definition, single call site.
 *  Styles are declared above, so no TDZ risk on module evaluation.
 * ===================================================================== */

const renderPreview = (item) => {
    if (!item) {
        return (
            <div style={styles.previewEmpty}>
                <FiExternalLink size={24} />
                <span>No file selected yet.</span>
            </div>
        );
    }

    const source = item.mediaUrl || '';
    if (!source) {
        return (
            <div style={styles.previewEmpty}>
                <FiAlertCircle size={24} />
                <span>That file does not have a renderable URL yet.</span>
            </div>
        );
    }

    if (item.type === 'photo') {
        return (
            <img
                src={source}
                alt={item.title || item.fileName || 'preview'}
                style={styles.previewMedia}
                onError={(e) => {
                    e.currentTarget.style.display = 'none';
                }}
            />
        );
    }

    if (item.type === 'video') {
        return (
            <video
                src={source}
                controls
                preload="metadata"
                style={styles.previewMedia}
            />
        );
    }

    if (item.type === 'music' || item.type === 'audio') {
        return (
            <div style={styles.previewAudioWrap}>
                <audio
                    src={source}
                    controls
                    preload="metadata"
                    style={styles.previewAudio}
                />
                <div style={styles.previewCaption}>
                    <strong>{item.fileName || item.title}</strong>
                    {item.artist ? <span>{item.artist}</span> : null}
                    {item.album ? <span>{item.album}</span> : null}
                </div>
            </div>
        );
    }

    return (
        <div style={styles.previewEmpty}>
            <FiFolder size={24} />
            <span>{item.fileName || item.title || 'Unknown file'}</span>
        </div>
    );
};

/* =====================================================================
 *  Page
 * ===================================================================== */

const MyLibraryPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const { addToast } = useNotification();

    const {
        getLibrary,
        saveMedia,
        updateMedia,
        deleteMedia,
        toggleVisibility,
        bulkToggleVisibility,
        loading: savedMediaLoading,
        error: savedMediaError,
    } = useSavedMedia();

    if (typeof saveMedia !== 'function') {
        // eslint-disable-next-line no-console
        console.error(
            '[MyLibraryPage] useSavedMedia() did not return saveMedia(). Uploads will fail.'
        );
    }

    const uploadInputRef = useRef(null);
    const isMountedRef = useRef(true);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');

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

    const [libraryState, setLibraryState] = useState(() => readState());
    const [pendingUploads, setPendingUploads] = useState(() => readPending());
    const [selectedItem, setSelectedItem] = useState(null);
    const [publishingByItem, setPublishingByItem] = useState({});

    useEffect(() => {
        writeState(libraryState);
    }, [libraryState]);

    useEffect(() => {
        const snapshot = [...music, ...photos, ...videos].map((item) => ({
            id: item.id,
            type: item.type,
            title: item.title,
            artist: item.artist,
            album: item.album,
            genre: item.genre,
            description: item.description,
            fileName: item.fileName,
            relativePath: item.relativePath,
            objectKey: item.objectKey,
            mediaUrl: item.mediaUrl,
            thumbnailUrl: item.thumbnailUrl,
            sizeBytes: item.sizeBytes,
            uploadedAt: item.uploadedAt,
            archived: item.archived,
            protected: item.protected,
            source: item.source,
        }));
        writeCache(snapshot);
    }, [music, photos, videos]);

    useEffect(() => {
        writePending(pendingUploads);
    }, [pendingUploads]);

    useEffect(() => {
        if (savedMediaError) setError(String(savedMediaError));
    }, [savedMediaError]);

    useEffect(() => {
        const cached = readCache();
        if (!cached.length) return;
        setMusic(cached.filter((i) => i.type === 'music' || i.type === 'audio'));
        setPhotos(cached.filter((i) => i.type === 'photo'));
        setVideos(cached.filter((i) => i.type === 'video'));
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const loadLibrary = useCallback(
        async ({ silent = false } = {}) => {
            if (!silent) setLoading(true);
            setError('');

            try {
                const results = await Promise.allSettled([
                    getLibrary(1, 500, {
                        sortBy: 'createdAt',
                        sortDir: 'desc',
                    }),
                    apiService.getMusicLibrary(),
                    apiService.getPhotoLibrary(),
                    apiService.getVideoLibrary(),
                ]);

                if (!isMountedRef.current) return;

                const [savedR, musicR, photoR, videoR] = results;

                const savedItems =
                    savedR.status === 'fulfilled'
                        ? readList(
                            savedR.value?.items || savedR.value?.data,
                            ['items', 'data']
                        ).map(normalizeSavedMediaItem)
                        : [];

                const musicItems =
                    musicR.status === 'fulfilled'
                        ? readList(musicR.value?.data, [
                            'items',
                            'tracks',
                            'data',
                        ]).map(normalizeMusic)
                        : [];

                const photoItems =
                    photoR.status === 'fulfilled'
                        ? readList(photoR.value?.data, [
                            'data',
                            'items',
                            'photos',
                        ]).map(normalizePhoto)
                        : [];

                const videoItems =
                    videoR.status === 'fulfilled'
                        ? readList(videoR.value?.data, [
                            'videos',
                            'items',
                            'data',
                        ]).map(normalizeVideo)
                        : [];

                const legacyItems = [
                    ...musicItems,
                    ...photoItems,
                    ...videoItems,
                ].map((item) => ({ ...item, source: 'legacy' }));

                const cached = readCache();
                const merged = mergeUniqueMedia(
                    savedItems,
                    legacyItems,
                    cached
                );

                setMusic(
                    merged.filter(
                        (i) => i.type === 'music' || i.type === 'audio'
                    )
                );
                setPhotos(merged.filter((i) => i.type === 'photo'));
                setVideos(merged.filter((i) => i.type === 'video'));

                setLibraryState((prev) => {
                    const next = { ...(prev || {}) };
                    for (const item of merged) {
                        const key = getItemKey(item);
                        const existing = next[key] || {};
                        next[key] = {
                            archived: Boolean(
                                existing.archived ?? item.archived
                            ),
                            protected: Boolean(
                                existing.protected ?? item.protected
                            ),
                        };
                    }
                    return next;
                });

                if (legacyItems.length > 0 && typeof saveMedia === 'function') {
                    await Promise.allSettled(
                        legacyItems
                            .filter(
                                (item) =>
                                    String(item.mediaUrl || '').trim().length > 0
                            )
                            .map((item) =>
                                saveMedia({
                                    title:
                                        item.title ||
                                        item.fileName ||
                                        'Untitled media',
                                    description: item.description || null,
                                    mediaType:
                                        item.type === 'audio'
                                            ? 'music'
                                            : item.type,
                                    mediaUrl: item.mediaUrl,
                                    thumbnailUrl: item.thumbnailUrl || null,
                                    mediaMetadata: {
                                        fileName: item.fileName || null,
                                        relativePath:
                                            item.relativePath || null,
                                        objectKey:
                                            item.objectKey ||
                                            item.relativePath ||
                                            null,
                                        archived: Boolean(item.archived),
                                        protected: Boolean(item.protected),
                                        source: 'legacy-import',
                                    },
                                    isVisibleInFeed: !item.archived,
                                    tags: [],
                                    fileSizeBytes: item.sizeBytes || null,
                                    durationSeconds:
                                        item.durationSeconds || null,
                                })
                            )
                    );
                }

                const failures = [musicR, photoR, videoR].filter(
                    (r) => r.status === 'rejected'
                );
                if (failures.length) {
                    setError(
                        failures[0].reason?.message ||
                        'Some media categories could not be loaded.'
                    );
                }
            } catch (loadError) {
                if (!isMountedRef.current) return;
                const message =
                    loadError?.message || 'Unable to load the media library.';
                setError(message);
                addToast(message, 'error');
            } finally {
                if (isMountedRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [addToast, getLibrary, saveMedia]
    );

    useEffect(() => {
        void loadLibrary();
    }, [loadLibrary, user?.id]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        void loadLibrary({ silent: true });
    }, [loadLibrary]);

    const allItems = useMemo(
        () => [...music, ...photos, ...videos],
        [music, photos, videos]
    );

    const archivedItems = useMemo(
        () =>
            allItems.filter(
                (item) => Boolean(getItemState(item, libraryState).archived)
            ),
        [allItems, libraryState]
    );

    const activeItems = useMemo(
        () =>
            allItems.filter(
                (item) => !getItemState(item, libraryState).archived
            ),
        [allItems, libraryState]
    );

    const filteredItems = useMemo(() => {
        const term = query.trim().toLowerCase();
        const tabFilter = activeTab === 'all' ? null : activeTab;
        const sourceItems =
            activeTab === 'archive' ? archivedItems : activeItems;
        return sourceItems.filter((item) => {
            if (tabFilter && tabFilter !== 'archive' && item.type !== tabFilter)
                return false;
            if (!term) return true;
            return [
                item.title,
                item.artist,
                item.album,
                item.genre,
                item.description,
                item.fileName,
                item.relativePath,
                getItemState(item, libraryState).archived ? 'archived' : '',
                getItemState(item, libraryState).protected ? 'protected' : '',
            ].some((value) =>
                String(value || '')
                    .toLowerCase()
                    .includes(term)
            );
        });
    }, [activeTab, activeItems, archivedItems, libraryState, query]);

    useEffect(() => {
        if (
            selectedItem &&
            !allItems.some(
                (item) =>
                    item.id === selectedItem.id &&
                    item.type === selectedItem.type
            )
        ) {
            setSelectedItem(null);
        }
    }, [allItems, selectedItem]);

    const stats = useMemo(() => {
        const totalSize = activeItems.reduce(
            (sum, item) => sum + Number(item.sizeBytes || 0),
            0
        );
        return {
            total: activeItems.length,
            archive: archivedItems.length,
            music: activeItems.filter((i) => i.type === 'music').length,
            photo: activeItems.filter((i) => i.type === 'photo').length,
            video: activeItems.filter((i) => i.type === 'video').length,
            totalSize,
        };
    }, [activeItems, archivedItems]);

    const uploadLimitReached = useMemo(() => {
        const counts = {
            music: activeItems.filter((i) => i.type === 'music').length,
            photo: activeItems.filter((i) => i.type === 'photo').length,
            video: activeItems.filter((i) => i.type === 'video').length,
        };
        return (
            Boolean(LIMITS[uploadType]) &&
            counts[uploadType] >= LIMITS[uploadType]
        );
    }, [activeItems, uploadType]);

    const updateItemLists = useCallback((type, nextItem) => {
        if (!nextItem) return;
        if (type === 'music') {
            setMusic((prev) => [
                nextItem,
                ...prev.filter((i) => i.id !== nextItem.id),
            ]);
        }
        if (type === 'photo') {
            setPhotos((prev) => [
                nextItem,
                ...prev.filter((i) => i.id !== nextItem.id),
            ]);
        }
        if (type === 'video') {
            setVideos((prev) => [
                nextItem,
                ...prev.filter((i) => i.id !== nextItem.id),
            ]);
        }
    }, []);

    const updateLibraryState = useCallback((item, patch) => {
        const key = getItemKey(item);
        setLibraryState((prev) => {
            const next = { ...(prev || {}) };
            const current = next[key] || {};
            const merged = { ...current, ...patch };
            if (!merged.archived && !merged.protected) {
                delete next[key];
                return next;
            }
            next[key] = merged;
            return next;
        });
    }, []);

    const removeLibraryState = useCallback((item) => {
        const key = getItemKey(item);
        setLibraryState((prev) => {
            const next = { ...(prev || {}) };
            delete next[key];
            return next;
        });
    }, []);

    const persistState = useCallback(
        async (item, nextState) => {
            const state = {
                archived: Boolean(nextState?.archived),
                protected: Boolean(nextState?.protected),
            };

            updateLibraryState(item, state);

            try {
                if (
                    item.source === 'saved-media' &&
                    typeof updateMedia === 'function'
                ) {
                    await updateMedia(item.id, {
                        title: item.title,
                        description: item.description,
                        thumbnailUrl: item.thumbnailUrl,
                        isVisibleInFeed: !state.archived,
                        tags: Array.isArray(item.tags) ? item.tags : undefined,
                        mediaMetadata: {
                            ...(item.mediaMetadata || {}),
                            relativePath:
                                item.relativePath ||
                                item.mediaMetadata?.relativePath ||
                                null,
                            objectKey:
                                item.objectKey ||
                                item.mediaMetadata?.objectKey ||
                                null,
                            archived: state.archived,
                            protected: state.protected,
                        },
                    });
                } else if (item.type === 'music') {
                    await apiService.updateMusicLibraryState(item.id, state);
                } else if (item.type === 'photo') {
                    await apiService.updatePhotoLibraryState(item.id, state);
                } else if (item.type === 'video') {
                    await apiService.updateVideoLibraryState(item.id, state);
                }
            } catch (err) {
                addToast(
                    err?.message || 'Unable to sync media state.',
                    'error'
                );
            }
        },
        [addToast, updateMedia, updateLibraryState]
    );

    const handleToggleArchive = useCallback(
        (item) => {
            const currentState = getItemState(item, libraryState);
            void persistState(item, {
                archived: !currentState.archived,
                protected: Boolean(currentState.protected),
            });
        },
        [libraryState, persistState]
    );

    const handleToggleProtect = useCallback(
        (item) => {
            const currentState = getItemState(item, libraryState);
            void persistState(item, {
                archived: Boolean(currentState.archived),
                protected: !currentState.protected,
            });
        },
        [libraryState, persistState]
    );

    const handleUpload = async (event) => {
        event.preventDefault();

        if (!uploadFile) {
            addToast('Choose a file first.', 'info');
            return;
        }

        if (uploadLimitReached) {
            addToast(
                `${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)
                } library is full. Archive or delete an item first.`,
                'error'
            );
            return;
        }

        if (typeof saveMedia !== 'function') {
            addToast(
                'Media saving is unavailable right now. Please reload the page.',
                'error'
            );
            return;
        }

        const title = String(
            uploadTitle || uploadFile.name || 'Untitled media'
        ).trim();
        const destinationFolder = `wiseravenshare/media/${uploadType}`;

        const pendingId = `pending-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        setPendingUploads((prev) => [
            ...prev,
            {
                id: pendingId,
                type: uploadType,
                title,
                fileName: uploadFile.name,
                size: uploadFile.size,
                artist: uploadArtist,
                album: uploadAlbum,
                genre: uploadGenre,
                description: uploadDescription,
                startedAt: new Date().toISOString(),
            },
        ]);

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
                    onProgress: setProgress,
                });
            } else {
                response = await apiService.uploadMedia(
                    uploadFile,
                    uploadType,
                    {
                        title,
                        description: uploadDescription,
                        destinationFolder,
                        caption: uploadDescription,
                        onProgress: setProgress,
                    }
                );
            }

            const data = response?.data || response || {};

            const uploadedMediaUrl = String(
                data.track?.mediaUrl ||
                data.mediaUrl ||
                data.url ||
                data.file?.mediaUrl ||
                data.filePath ||
                ''
            ).trim();

            const uploadedRelativePath = String(
                data.track?.relativePath ||
                data.relativePath ||
                data.file?.relativePath ||
                data.objectKey ||
                data.filePath ||
                ''
            ).trim();

            const persisted = await saveMedia({
                title,
                description: uploadDescription,
                mediaType: uploadType,
                mediaUrl: uploadedMediaUrl || '',
                thumbnailUrl:
                    uploadType === 'photo' ? uploadedMediaUrl : undefined,
                mediaMetadata: {
                    fileName:
                        data.track?.fileName ||
                        data.fileName ||
                        uploadFile.name,
                    relativePath: uploadedRelativePath,
                    objectKey: uploadedRelativePath || data.objectKey || null,
                    artist: uploadArtist,
                    album: uploadAlbum,
                    genre: uploadGenre,
                    archived: false,
                    protected: false,
                    sizeBytes: uploadFile.size,
                },
                isVisibleInFeed: true,
                tags: [],
                fileSizeBytes: uploadFile.size,
                durationSeconds: null,
            });

            const nextItem = normalizeSavedMediaItem({
                ...persisted,
                mediaType: persisted?.mediaType ?? uploadType,
                mediaUrl:
                    uploadedMediaUrl ||
                    buildMediaUrlFromPath(uploadedRelativePath, uploadType),
            });
            updateItemLists(uploadType, nextItem);

            setUploadFile(null);
            setUploadTitle('');
            setUploadDescription('');
            setUploadArtist('');
            setUploadAlbum('');
            setUploadGenre('');
            setProgress(0);
            if (uploadInputRef.current) uploadInputRef.current.value = '';

            setPendingUploads((prev) =>
                prev.filter((row) => row.id !== pendingId)
            );

            addToast(`${title} uploaded to Spaces.`, 'success');
        } catch (uploadError) {
            addToast(uploadError?.message || 'Upload failed.', 'error');
        } finally {
            if (isMountedRef.current) setUploading(false);
        }
    };

    const handleDelete = async (item) => {
        const confirmed = window.confirm(
            `Delete "${item.title}" from the media library?`
        );
        if (!confirmed) return;

        if (item.type === 'music') {
            setMusic((prev) => prev.filter((entry) => entry.id !== item.id));
        } else if (item.type === 'photo') {
            setPhotos((prev) => prev.filter((entry) => entry.id !== item.id));
        } else if (item.type === 'video') {
            setVideos((prev) => prev.filter((entry) => entry.id !== item.id));
        }
        removeLibraryState(item);

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
            addToast(
                deleteError?.message || 'Failed to delete media.',
                'error'
            );
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

    const handleSocialPublish = useCallback(
        async (item, targets) => {
            const mediaUrl = String(item?.mediaUrl || '').trim();
            if (!mediaUrl) {
                addToast(
                    'This file does not have a public media URL yet.',
                    'error'
                );
                return;
            }

            const itemKey = getItemKey(item);
            setPublishingByItem((prev) => ({ ...prev, [itemKey]: true }));

            try {
                const payload = buildMediaSharePayload({
                    message: String(
                        item.description ||
                        item.title ||
                        item.fileName ||
                        'Shared from WiseRavenShare Media Library'
                    ).trim(),
                    mediaUrl,
                    linkUrl: mediaUrl,
                    publishToFacebook: Boolean(targets?.facebook),
                    publishToInstagram: Boolean(targets?.instagram),
                    publishToTikTok: Boolean(targets?.tiktok),
                    publishToYouTube: Boolean(targets?.youtube),
                });

                const requestedPlatforms = [
                    payload.publishToFacebook ? 'facebook' : null,
                    payload.publishToInstagram ? 'instagram' : null,
                    payload.publishToTikTok ? 'tiktok' : null,
                    payload.publishToYouTube ? 'youtube' : null,
                ].filter(Boolean);

                if (!requestedPlatforms.length) {
                    addToast(
                        'Selected platform requires a video/photo media URL.',
                        'info'
                    );
                    return;
                }

                const response = await socialService.publishContent(payload);
                const results = Array.isArray(response?.results)
                    ? response.results
                    : [];
                const succeeded = results
                    .filter((r) => r?.success)
                    .map((r) => r.platform);
                const failed = results.filter((r) => !r?.success);

                if (succeeded.length) {
                    addToast(
                        `Published to ${succeeded.join(', ')}.`,
                        'success'
                    );
                }
                if (failed.length) {
                    addToast(
                        failed
                            .map(
                                (r) =>
                                    `${r.platform}: ${r.error || 'publish failed'
                                    }`
                            )
                            .join(' | '),
                        'error'
                    );
                }
            } catch (publishError) {
                addToast(
                    publishError?.message || 'Failed to publish media.',
                    'error'
                );
            } finally {
                setPublishingByItem((prev) => {
                    const next = { ...prev };
                    delete next[itemKey];
                    return next;
                });
            }
        },
        [addToast]
    );

    const renderedItems = filteredItems.map((item) => {
        const state = getItemState(item, libraryState);
        const archived = Boolean(state.archived);
        const protectedItem = Boolean(state.protected);
        const itemKey = getItemKey(item);
        const isPublishing = Boolean(publishingByItem[itemKey]);
        const isVideo = item.type === 'video';

        return (
            <article
                key={`${item.type}-${item.id}`}
                style={{
                    ...styles.card,
                    cursor: 'pointer',
                    outline:
                        selectedItem?.id === item.id &&
                            selectedItem?.type === item.type
                            ? '2px solid rgba(59,130,246,0.8)'
                            : 'none',
                }}
                onDoubleClick={() => setSelectedItem(item)}
                title="Double-click to render this file"
            >
                <div style={styles.thumb}>
                    {item.type === 'photo' && item.mediaUrl ? (
                        <img
                            src={item.mediaUrl}
                            alt={item.title}
                            style={styles.mediaPreview}
                            loading="lazy"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    ) : (
                        <div style={styles.iconPlaceholder}>
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

                <div style={styles.body}>
                    <div style={styles.titleRow}>
                        <strong style={styles.title}>
                            {item.fileName || item.title}
                        </strong>
                        <div
                            style={{
                                display: 'flex',
                                gap: '6px',
                                flexWrap: 'wrap',
                                justifyContent: 'flex-end',
                            }}
                        >
                            {protectedItem && (
                                <span style={styles.protectedPill}>
                                    Protected
                                </span>
                            )}
                            {archived && (
                                <span style={styles.archivePill}>
                                    Archived
                                </span>
                            )}
                            <span style={styles.pill}>
                                {item.type === 'music'
                                    ? 'music-library'
                                    : item.type}
                            </span>
                        </div>
                    </div>

                    {item.title && item.title !== item.fileName ? (
                        <div style={styles.muted}>{item.title}</div>
                    ) : null}
                    {item.artist ? (
                        <div style={styles.muted}>{item.artist}</div>
                    ) : null}
                    {item.album ? (
                        <div style={styles.muted}>{item.album}</div>
                    ) : null}
                    {item.description ? (
                        <div style={styles.description}>
                            {item.description}
                        </div>
                    ) : null}

                    <div style={styles.metaGrid}>
                        <span>
                            <FiFolder style={styles.metaIcon} />{' '}
                            {item.relativePath ||
                                item.objectKey ||
                                'Spaces managed'}
                        </span>
                        <span>
                            <FiHardDrive style={styles.metaIcon} />{' '}
                            {formatBytes(item.sizeBytes)}
                        </span>
                        <span>
                            <FiClock style={styles.metaIcon} />{' '}
                            {formatDate(item.uploadedAt)}
                        </span>
                        <span>{item.fileName || 'Unknown file'}</span>
                    </div>

                    <div style={styles.actions}>
                        <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() =>
                                handleSocialPublish(item, {
                                    facebook: true,
                                    instagram: true,
                                })
                            }
                            disabled={!item.mediaUrl || isPublishing}
                        >
                            {isPublishing ? 'Publishing…' : 'Publish Meta'}
                        </button>

                        <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() =>
                                handleSocialPublish(item, { tiktok: true })
                            }
                            disabled={
                                !item.mediaUrl || !isVideo || isPublishing
                            }
                        >
                            Publish TikTok
                        </button>

                        <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() =>
                                handleSocialPublish(item, { youtube: true })
                            }
                            disabled={
                                !item.mediaUrl || !isVideo || isPublishing
                            }
                        >
                            Publish YouTube
                        </button>

                        <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() => handleToggleArchive(item)}
                            disabled={isPublishing}
                        >
                            {archived ? 'Restore' : 'Archive'}
                        </button>

                        <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() => handleToggleProtect(item)}
                            disabled={isPublishing}
                        >
                            {protectedItem ? 'Unprotect' : 'Protect'}
                        </button>

                        <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() =>
                                item.mediaUrl &&
                                window.open(
                                    item.mediaUrl,
                                    '_blank',
                                    'noopener,noreferrer'
                                )
                            }
                            disabled={!item.mediaUrl}
                        >
                            <FiExternalLink /> Open
                        </button>

                        <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() => handleCopy(item.mediaUrl)}
                            disabled={!item.mediaUrl}
                        >
                            <FiCopy /> Copy URL
                        </button>

                        <button
                            type="button"
                            style={styles.dangerButton}
                            onClick={() => handleDelete(item)}
                            disabled={isPublishing}
                        >
                            <FiTrash2 /> Delete
                        </button>
                    </div>
                </div>
            </article>
        );
    });

    return (
        <div style={styles.page}>
            <section style={styles.hero}>
                <div>
                    <div style={styles.eyebrow}>
                        Media Library · DigitalOcean Spaces + durable metadata
                    </div>
                    <h1 style={styles.heading}>Media Library</h1>
                    <p style={styles.subheading}>
                        Upload once, store the bytes in Spaces, and keep every
                        tag, path, and archive flag in the database — so
                        nothing is lost across logins, reloads, or tab
                        crashes.
                    </p>
                </div>

                <div style={styles.summaryGrid}>
                    <div style={styles.summaryCard}>
                        <strong>{stats.total}</strong>
                        <span>Active files</span>
                    </div>
                    <div style={styles.summaryCard}>
                        <strong>{stats.music}</strong>
                        <span>Music</span>
                    </div>
                    <div style={styles.summaryCard}>
                        <strong>{stats.photo}</strong>
                        <span>Photos</span>
                    </div>
                    <div style={styles.summaryCard}>
                        <strong>{stats.video}</strong>
                        <span>Videos</span>
                    </div>
                    <div style={styles.summaryCard}>
                        <strong>{stats.archive}</strong>
                        <span>Local Archive</span>
                    </div>
                    <div style={styles.summaryCard}>
                        <strong>{formatBytes(stats.totalSize)}</strong>
                        <span>Total size</span>
                    </div>
                </div>
            </section>

            {pendingUploads.length > 0 && (
                <div style={styles.resumeBanner}>
                    <FiAlertCircle />
                    <span>
                        {pendingUploads.length} upload(s) were interrupted.
                        They are queued and will retry the next time you
                        upload.
                    </span>
                    <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => setPendingUploads([])}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <section style={styles.layout}>
                <aside style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <FiUpload />
                        <strong>Upload to Library</strong>
                    </div>
                    <form onSubmit={handleUpload} style={styles.form}>
                        <label style={styles.field}>
                            Type
                            <select
                                value={uploadType}
                                onChange={(e) =>
                                    setUploadType(e.target.value)
                                }
                                style={styles.input}
                            >
                                <option value="music">Music</option>
                                <option value="photo">Photo</option>
                                <option value="video">Video</option>
                            </select>
                        </label>

                        <label style={styles.field}>
                            File
                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept="image/*,video/*,audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.mp4,.mov,.webm,.mkv,.avi"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    setUploadFile(file);
                                    if (file && !uploadTitle) {
                                        setUploadTitle(
                                            file.name.replace(/\.[^/.]+$/, '')
                                        );
                                    }
                                    if (file)
                                        setUploadType(inferTypeFromFile(file));
                                }}
                                style={styles.input}
                            />
                        </label>

                        <label style={styles.field}>
                            Title
                            <input
                                value={uploadTitle}
                                onChange={(e) =>
                                    setUploadTitle(e.target.value)
                                }
                                placeholder="File title"
                                style={styles.input}
                            />
                        </label>

                        {uploadType === 'music' ? (
                            <>
                                <label style={styles.field}>
                                    Artist
                                    <input
                                        value={uploadArtist}
                                        onChange={(e) =>
                                            setUploadArtist(e.target.value)
                                        }
                                        style={styles.input}
                                    />
                                </label>
                                <label style={styles.field}>
                                    Album
                                    <input
                                        value={uploadAlbum}
                                        onChange={(e) =>
                                            setUploadAlbum(e.target.value)
                                        }
                                        style={styles.input}
                                    />
                                </label>
                                <label style={styles.field}>
                                    Genre
                                    <input
                                        value={uploadGenre}
                                        onChange={(e) =>
                                            setUploadGenre(e.target.value)
                                        }
                                        style={styles.input}
                                    />
                                </label>
                            </>
                        ) : (
                            <label style={styles.field}>
                                Description
                                <textarea
                                    value={uploadDescription}
                                    onChange={(e) =>
                                        setUploadDescription(e.target.value)
                                    }
                                    rows={3}
                                    style={styles.input}
                                />
                            </label>
                        )}

                        <button
                            type="submit"
                            disabled={uploading || !uploadFile}
                            style={styles.uploadButton}
                        >
                            {uploading ? (
                                <>
                                    <FiRefreshCw className="spin" /> Uploading{' '}
                                    {progress}%
                                </>
                            ) : (
                                <>
                                    <FiUpload /> Upload
                                </>
                            )}
                        </button>
                    </form>

                    <div style={styles.note}>
                        Archive items when you hit capacity. Archived media
                        stays in your library, but is removed from active
                        counts until restored.
                    </div>
                </aside>

                <main style={styles.main}>
                    <div style={styles.toolbar}>
                        <div style={styles.tabs}>
                            {TAB_OPTIONS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    style={
                                        activeTab === tab.id
                                            ? styles.activeTab
                                            : styles.tab
                                    }
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div style={styles.searchWrap}>
                            <FiSearch style={{ opacity: 0.7 }} />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by title, file name, path, artist..."
                                style={styles.searchInput}
                            />
                            <button
                                type="button"
                                onClick={handleRefresh}
                                style={styles.refreshButton}
                                disabled={refreshing}
                            >
                                <FiRefreshCw
                                    className={refreshing ? 'spin' : ''}
                                />
                            </button>
                        </div>
                    </div>

                    {error ? (
                        <div style={styles.error}>
                            <FiAlertCircle /> {error}
                        </div>
                    ) : null}

                    {loading ? (
                        <div style={styles.empty}>Loading library...</div>
                    ) : filteredItems.length === 0 ? (
                        <div style={styles.empty}>
                            <FiCheckCircle size={24} />
                            <strong>No media found</strong>
                            <span>
                                Upload photos, videos, or music, or switch to
                                Local Archive.
                            </span>
                        </div>
                    ) : (
                        <div style={styles.grid}>{renderedItems}</div>
                    )}

                    <section style={styles.preview}>
                        <div style={styles.previewHeader}>
                            <strong>Render preview</strong>
                            <span>
                                Double-click a file card to render it here.
                            </span>
                        </div>
                        <div style={styles.previewFrame}>
                            {selectedItem ? (
                                renderPreview(selectedItem)
                            ) : (
                                <div style={styles.previewEmpty}>
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

export default MyLibraryPage;