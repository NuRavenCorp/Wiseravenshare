const VIDEO_CACHE_KEY = 'wiseRavensightVideos';
const VIDEO_LIBRARY_KEY = 'wiseRavensightLibrary';
const VIDEO_RECENT_POSTS_KEY = 'wiseRecentPosts';

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

export const normalizeVideoRecord = (video, index = 0) => ({
    id: String(video?.id || video?.videoId || `local-video-${Date.now()}-${index}`),
    videoUrl: normalizeMediaSource(video?.videoUrl || video?.mediaUrl || video?.filePath || '', ''),
    mediaUrl: normalizeMediaSource(video?.mediaUrl || video?.videoUrl || video?.filePath || '', ''),
    thumbnailUrl: normalizeMediaSource(video?.thumbnailUrl || '', ''),
    duration: video?.duration || '00:30',
    channelAvatar: normalizeMediaSource(video?.channelAvatar || video?.avatar || 'https://via.placeholder.com/40?text=WR', 'https://via.placeholder.com/40?text=WR'),
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
    facebookUrl: video?.facebookUrl || null
});

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

export const upsertLocalVideo = (videoInput) => {
    const video = normalizeVideoRecord(videoInput);
    const currentPrimary = readPrimaryVideos();
    const currentLibrary = readLibraryVideos();

    const mergeOne = (items) => {
        const normalized = Array.isArray(items) ? items : [];
        const rest = normalized.filter((item) => String(item?.id || '') !== video.id && String(item?.videoUrl || item?.mediaUrl || '') !== (video.videoUrl || video.mediaUrl));
        return [video, ...rest].slice(0, 200);
    };

    safeWriteJson(VIDEO_CACHE_KEY, mergeOne(currentPrimary));
    safeWriteJson(VIDEO_LIBRARY_KEY, mergeOne(currentLibrary));

    window.dispatchEvent(new CustomEvent('ravensight:video-saved', { detail: video }));
    window.dispatchEvent(new Event('wiseraven:posts-updated'));

    return video;
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
    window.dispatchEvent(new Event('wiseraven:posts-updated'));
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
