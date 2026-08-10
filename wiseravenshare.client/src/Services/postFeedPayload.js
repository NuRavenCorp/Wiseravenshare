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

export const readStoredFeedPosts = () => {
    try {
        const stored = localStorage.getItem('wiseRecentPosts');
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};
