const STORAGE_KEY = 'wiseRecentPosts';
const MAX_STORED_POSTS = 120;

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
        avatar: rawUser?.avatar || rawUser?.avatarUrl || fallbackUser?.avatar || 'U'
    };
};

export const normalizeFeedPost = (post, fallbackUser = null) => {
    if (!post || typeof post !== 'object') {
        return null;
    }

    const resolvedUser = normalizeUser(post, fallbackUser);
    const resolvedUserId = post?.userId || resolvedUser?.id || fallbackUser?.id || null;

    return {
        ...post,
        id: post?.id || `local-post-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: resolvedUserId,
        mediaType: post?.mediaType || (String(post?.type || '').toLowerCase() === 'video' ? 'video' : null),
        mediaUrl: post?.mediaUrl || (Array.isArray(post?.mediaUrls) ? post.mediaUrls[0] : null),
        likes: Number(post?.likes ?? post?.likesCount ?? 0),
        reposts: Number(post?.reposts ?? post?.repostsCount ?? 0),
        comments: Array.isArray(post?.comments) ? post.comments : [],
        truthScore: post?.truthScore ?? null,
        user: resolvedUser
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
