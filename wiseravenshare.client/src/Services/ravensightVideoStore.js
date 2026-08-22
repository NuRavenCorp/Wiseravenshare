const VIDEO_CACHE_KEY = 'wiseRavensightVideos';
const VIDEO_LIBRARY_KEY = 'wiseRavensightLibrary';
const VIDEO_RECENT_POSTS_KEY = 'wiseRecentPosts';

export const RAVENSIGHT_LIBRARY_PROTOCOL = {
    events: {
        videoSaved: 'ravensight:video-saved',
        postsUpdated: 'wiseraven:posts-updated'
    },
    source: {
        localFallback: 'local-fallback',
        feedCache: 'feed-cache',
        libraryStore: 'library-store'
    },
    access: {
        blobSession: 'blob-session-url',
        remoteUrl: 'remote-url',
        streamUrl: 'stream-url',
        unavailable: 'unavailable'
    }
};

const safeReadJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const safeWriteJson = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Best-effort cache write.
    }
};

const buildInitialsAvatar = (name) => {
    const initials = String(name || 'WR')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'WR';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="#374151"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="#e5e7eb">${initials}</text></svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Blob object URLs are bound to the document that created them. Any blob URL
// restored from localStorage belongs to a previous page load and can never
// play again, so those entries are dead placeholders. Purge them once at
// module load; entries created during the current session stay playable.
function purgeStaleSessionVideos() {
    const isDeadBlobEntry = (item) => {
        const url = String(item?.videoUrl || item?.mediaUrl || '');
        return url.startsWith('blob:');
    };

    const primary = safeReadJson(VIDEO_CACHE_KEY, []);
    if (Array.isArray(primary) && primary.some(isDeadBlobEntry)) {
        safeWriteJson(VIDEO_CACHE_KEY, primary.filter((item) => !isDeadBlobEntry(item)));
    }

    const library = safeReadJson(VIDEO_LIBRARY_KEY, []);
    if (Array.isArray(library) && library.some(isDeadBlobEntry)) {
        safeWriteJson(VIDEO_LIBRARY_KEY, library.filter((item) => !isDeadBlobEntry(item)));
    }
}

purgeStaleSessionVideos();

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

export const normalizeVideoRecord = (video, index = 0) => {
    const id = String(video?.id || video?.videoId || `local-video-${Date.now()}-${index}`);
    const videoUrl = normalizeMediaSource(video?.videoUrl || video?.mediaUrl || video?.filePath || '', '');
    const mediaUrl = normalizeMediaSource(video?.mediaUrl || video?.videoUrl || video?.filePath || '', '');
    const resolvedVideoUrl = videoUrl || mediaUrl;
    const sourceType = Object.values(RAVENSIGHT_LIBRARY_PROTOCOL.source).includes(video?.sourceType)
        ? video.sourceType
        : id.startsWith('local-video-')
            ? RAVENSIGHT_LIBRARY_PROTOCOL.source.localFallback
            : id.startsWith('post-video-')
                ? RAVENSIGHT_LIBRARY_PROTOCOL.source.feedCache
                : RAVENSIGHT_LIBRARY_PROTOCOL.source.libraryStore;

    const accessProtocol = resolvedVideoUrl.startsWith('blob:')
        ? RAVENSIGHT_LIBRARY_PROTOCOL.access.blobSession
        : resolvedVideoUrl.includes('/api/videostreaming/')
            ? RAVENSIGHT_LIBRARY_PROTOCOL.access.streamUrl
            : /^https?:\/\//i.test(resolvedVideoUrl)
                ? RAVENSIGHT_LIBRARY_PROTOCOL.access.remoteUrl
                : RAVENSIGHT_LIBRARY_PROTOCOL.access.unavailable;

    return {
        id,
        videoUrl,
        mediaUrl,
        thumbnailUrl: normalizeMediaSource(video?.thumbnailUrl || '', ''),
        duration: typeof video?.duration === 'string' && video.duration.trim() ? video.duration.trim() : '',
        channelAvatar: normalizeMediaSource(video?.channelAvatar || video?.avatar || buildInitialsAvatar(video?.channelName || video?.user?.name), ''),
        channelName: video?.channelName || video?.user?.name || 'WiseRaven Creator',
        title: video?.title || 'Uploaded Video',
        description: video?.description || '',
        tags: Array.isArray(video?.tags) ? video.tags : [],
        views: Number(video?.views ?? video?.viewsCount ?? 0),
        likes: Number(video?.likes ?? video?.likesCount ?? 0),
        comments: Number(video?.comments ?? video?.commentsCount ?? 0),
        createdAt: video?.createdAt || new Date().toISOString(),
        updatedAt: video?.updatedAt || video?.createdAt || new Date().toISOString(),
        isLiked: Boolean(video?.isLiked),
        userId: video?.userId || video?.user?.id || null,
        status: video?.status || 'published',
        privacyStatus: video?.privacyStatus || 'unlisted',
        storageMode: video?.storageMode || 'temporary',
        retentionStatus: video?.retentionStatus || 'active',
        youtubeUrl: video?.youtubeUrl || null,
        tiktokUrl: video?.tiktokUrl || null,
        facebookUrl: video?.facebookUrl || null,
        sourceType,
        accessProtocol
    };
};

const dedupeByIdentity = (videos) => {
    const seen = new Set();
    const output = [];

    for (const raw of videos || []) {
        const video = normalizeVideoRecord(raw);
        const identity = `${video.id}::${video.videoUrl || video.mediaUrl || ''}`;
        if (!video.videoUrl && !video.mediaUrl) {
            continue;
        }

        if (seen.has(identity)) {
            continue;
        }

        seen.add(identity);
        output.push(video);
    }

    return output;
};

const readPrimaryVideos = () => safeReadJson(VIDEO_CACHE_KEY, []);
const readLibraryVideos = () => safeReadJson(VIDEO_LIBRARY_KEY, []);

const readRecentPostVideos = () => {
    const posts = safeReadJson(VIDEO_RECENT_POSTS_KEY, []);
    if (!Array.isArray(posts)) {
        return [];
    }

    return posts
        .filter((post) => post?.mediaType === 'video' && (post?.mediaUrl || post?.videoUrl))
        .map((post, index) => normalizeVideoRecord({
            id: `post-video-${post.id || index}`,
            title: post.content?.slice(0, 70) || 'Feed Video',
            description: post.content || '',
            videoUrl: post.mediaUrl || post.videoUrl,
            thumbnailUrl: post.thumbnailUrl || '',
            createdAt: post.createdAt,
            userId: post.userId || post.user?.id,
            channelName: post.user?.name || 'WiseRaven Creator',
            channelAvatar: post.user?.avatar || '',
            views: post.views || 0,
            likes: post.likes || 0,
            comments: Array.isArray(post.comments) ? post.comments.length : Number(post.comments) || 0
        }));
};

export const getMergedLocalVideos = (currentUserId = null) => {
    const merged = dedupeByIdentity([
        ...readPrimaryVideos(),
        ...readLibraryVideos(),
        ...readRecentPostVideos()
    ]);

    if (!currentUserId) {
        return merged;
    }

    return merged.filter((video) => !video.userId || video.userId === currentUserId);
};

export const mergeVideoRecords = (serverVideos = [], localVideos = []) => {
    return dedupeByIdentity([...(serverVideos || []), ...(localVideos || [])]);
};

export const upsertLocalVideo = (videoInput, options = {}) => {
    const video = normalizeVideoRecord(videoInput);
    const shouldEmitEvent = options.emitEvent !== false;
    const currentPrimary = readPrimaryVideos();
    const currentLibrary = readLibraryVideos();

    const mergeOne = (items) => {
        const normalized = Array.isArray(items) ? items : [];
        const rest = normalized.filter((item) => String(item?.id || '') !== video.id && String(item?.videoUrl || item?.mediaUrl || '') !== (video.videoUrl || video.mediaUrl));
        return [video, ...rest].slice(0, 200);
    };

    safeWriteJson(VIDEO_CACHE_KEY, mergeOne(currentPrimary));
    safeWriteJson(VIDEO_LIBRARY_KEY, mergeOne(currentLibrary));

    if (shouldEmitEvent) {
        window.dispatchEvent(new CustomEvent(RAVENSIGHT_LIBRARY_PROTOCOL.events.videoSaved, { detail: video }));
        window.dispatchEvent(new Event(RAVENSIGHT_LIBRARY_PROTOCOL.events.postsUpdated));
    }

    return video;
};

export const upsertLocalVideos = (videos = [], options = {}) => {
    const normalized = Array.isArray(videos)
        ? videos.map((video, index) => normalizeVideoRecord(video, index)).filter((video) => video.videoUrl || video.mediaUrl)
        : [];

    if (normalized.length === 0) {
        return [];
    }

    normalized.forEach((video) => {
        upsertLocalVideo(video, { emitEvent: false });
    });

    if (options.emitEvent !== false) {
        window.dispatchEvent(new CustomEvent(RAVENSIGHT_LIBRARY_PROTOCOL.events.videoSaved, { detail: normalized[0] }));
        window.dispatchEvent(new Event(RAVENSIGHT_LIBRARY_PROTOCOL.events.postsUpdated));
    }

    return normalized;
};

export const removeLocalVideo = (videoIdentity) => {
    const target = String(videoIdentity || '').trim();
    if (!target) {
        return;
    }

    const removeFrom = (items) => {
        const normalized = Array.isArray(items) ? items : [];
        return normalized.filter((item) => {
            const id = String(item?.id || '').trim();
            const url = String(item?.videoUrl || item?.mediaUrl || '').trim();
            return id !== target && url !== target;
        });
    };

    safeWriteJson(VIDEO_CACHE_KEY, removeFrom(readPrimaryVideos()));
    safeWriteJson(VIDEO_LIBRARY_KEY, removeFrom(readLibraryVideos()));
    window.dispatchEvent(new Event(RAVENSIGHT_LIBRARY_PROTOCOL.events.postsUpdated));
};

export const buildLocalFallbackVideo = ({ file, user, title = '', description = '', privacyStatus = 'unlisted', storageMode = 'temporary' }) => {
    const fallbackUrl = file ? URL.createObjectURL(file) : '';

    return normalizeVideoRecord({
        id: `local-video-${Date.now()}`,
        userId: user?.id || null,
        title: title || file?.name || 'Uploaded Video',
        description,
        videoUrl: fallbackUrl,
        mediaUrl: fallbackUrl,
        thumbnailUrl: '',
        status: 'published',
        privacyStatus,
        storageMode,
        retentionStatus: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        views: 0,
        likes: 0,
        comments: 0,
        channelName: user?.name || 'WiseRaven Creator',
        channelAvatar: user?.avatar || ''
    });
};
