const STORAGE_KEY = 'wiseRecentPosts';
const MAX_STORED_POSTS = 120;
const MAX_TEXT_LENGTH = 220;

const cleanWhitespaceText = (value) => String(value ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const looksLikeCorruptBlob = (value) => {
    const text = cleanWhitespaceText(value);
    if (!text || text.length < 24) {
        return false;
    }

    const hasLongEncodedRun = /(?:[A-Za-z0-9+/=]{24,})/.test(text);
    const hasFewWords = text.split(/\s+/).filter(Boolean).length <= 2 && text.length > 60;
    const hasTooManySymbols = (text.match(/[^A-Za-z0-9\s.,!?@#%'\-/]/g) || []).length > text.length * 0.22;

    return hasLongEncodedRun || hasFewWords || hasTooManySymbols;
};

const isSafeImageSource = (value) => {
    const text = cleanWhitespaceText(value);
    if (!text) {
        return false;
    }

    if (text.startsWith('data:image/')) {
        return text.length <= 2_000_000 && /^data:image\/[a-z0-9.+-]+;base64,/i.test(text);
    }

    if (text.startsWith('/')) {
        return true;
    }

    return /^https?:\/\//i.test(text) || /^blob:/i.test(text);
};

const sanitizeImageValue = (value, fallback = 'U') => {
    const text = cleanWhitespaceText(value);
    if (!text || looksLikeCorruptBlob(text) || !isSafeImageSource(text)) {
        return fallback;
    }

    return text;
};

const sanitizeMediaUrl = (value) => {
    const text = cleanWhitespaceText(value);
    if (!text) {
        return null;
    }

    if (text.startsWith('data:video/') || /^https?:\/\//i.test(text) || /^blob:/i.test(text) || text.startsWith('/')) {
        return text;
    }

    return null;
};

const sanitizeTextValue = (value, fallback = '', maxLength = MAX_TEXT_LENGTH) => {
    const text = cleanWhitespaceText(value);
    if (!text) {
        return fallback;
    }

    if (looksLikeCorruptBlob(text)) {
        return fallback;
    }

    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
};

export const normalizePostsPayload = (payload) => {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && typeof payload === 'object') {
        if (Array.isArray(payload.posts)) {
            return payload.posts;
        }

        if (Array.isArray(payload.items)) {
            return payload.items;
        }

        if (Array.isArray(payload.data)) {
            return payload.data;
        }

        if (Array.isArray(payload.results)) {
            return payload.results;
        }

        if (payload.data && typeof payload.data === 'object') {
            return normalizePostsPayload(payload.data);
        }
    }

    return [];
};

const normalizeUser = (post, fallbackUser = null) => {
    const rawUser = post?.user || fallbackUser || {};
    const resolvedUserId = post?.userId || rawUser?.id || fallbackUser?.id || null;

    return {
        ...(rawUser || {}),
        id: resolvedUserId,
        name: rawUser?.displayName || rawUser?.name || rawUser?.username || fallbackUser?.name || 'User',
        handle: rawUser?.handle || (rawUser?.username ? `@${rawUser.username}` : fallbackUser?.handle || '@user'),
        avatar: sanitizeImageValue(rawUser?.avatar || rawUser?.avatarUrl || fallbackUser?.avatar, 'U')
    };
};

export const normalizeFeedPost = (post, fallbackUser = null) => {
    if (!post || typeof post !== 'object') {
        return null;
    }

    const resolvedUser = normalizeUser(post, fallbackUser);
    const resolvedUserId = post?.userId || resolvedUser?.id || fallbackUser?.id || null;

    const content = sanitizeTextValue(post?.content, 'Fresh clip from the feed', 180);
    const caption = sanitizeTextValue(post?.caption, 'Original audio • viral loop', 120);
    const name = sanitizeTextValue(resolvedUser?.name, 'Raven User', 60);
    const handle = sanitizeTextValue(resolvedUser?.handle, '@ravenuser', 32);

    return {
        ...post,
        id: post?.id || `local-post-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: resolvedUserId,
        mediaType: post?.mediaType || (String(post?.type || '').toLowerCase() === 'video' ? 'video' : null),
        mediaUrl: sanitizeMediaUrl(post?.mediaUrl || (Array.isArray(post?.mediaUrls) ? post.mediaUrls[0] : null)),
        likes: Number(post?.likes ?? post?.likesCount ?? 0),
        reposts: Number(post?.reposts ?? post?.repostsCount ?? 0),
        comments: Array.isArray(post?.comments) ? post.comments : [],
        content,
        caption,
        truthScore: post?.truthScore ?? null,
        user: {
            ...resolvedUser,
            name,
            handle,
            avatar: sanitizeImageValue(resolvedUser?.avatar, 'U')
        }
    };
};

export const readStoredFeedPosts = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed)
            ? parsed.map((post) => normalizeFeedPost(post, null)).filter(Boolean)
            : [];
    } catch {
        return [];
    }
};

export const writeStoredFeedPosts = (posts) => {
    try {
        const normalized = (Array.isArray(posts) ? posts : [])
            .map((post) => normalizeFeedPost(post, null))
            .filter(Boolean)
            .slice(0, MAX_STORED_POSTS);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
    } catch {
        return [];
    }
};

export const mergeFeedPosts = (...collections) => {
    const seen = new Set();
    const merged = [];

    collections.flat().forEach((post) => {
        const normalized = normalizeFeedPost(post, null);
        if (!normalized || !normalized.id || seen.has(normalized.id)) {
            return;
        }

        seen.add(normalized.id);
        merged.push(normalized);
    });

    return merged.sort((left, right) => {
        const leftTime = new Date(left.createdAt || 0).getTime();
        const rightTime = new Date(right.createdAt || 0).getTime();
        return rightTime - leftTime;
    });
};

export const appendStoredFeedPost = (post, fallbackUser = null) => {
    const normalized = normalizeFeedPost(post, fallbackUser);
    if (!normalized) {
        return [];
    }

    const nextPosts = mergeFeedPosts([normalized], readStoredFeedPosts());
    return writeStoredFeedPosts(nextPosts);
};
