const GRAPH_KEY = 'wiseSocialGraph';
const PROFILE_KEY = 'wiseUserProfiles';

const defaultGraph = { users: {} };

const readJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const writeJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

const loadGraph = () => readJson(GRAPH_KEY, defaultGraph);
const saveGraph = (graph) => writeJson(GRAPH_KEY, graph);
const loadProfiles = () => readJson(PROFILE_KEY, {});
const saveProfiles = (profiles) => writeJson(PROFILE_KEY, profiles);

const profileFromUser = (user) => ({
    id: user.id,
    name: user.name || 'User',
    handle: user.handle || user.username || 'user',
    avatar: user.avatar || (user.name?.[0] || 'U').toUpperCase()
});

const applyProfileToPost = (post, profile) => {
    if (!post || post.userId !== profile.id) {
        return post;
    }

    return {
        ...post,
        user: {
            ...(post.user || {}),
            id: profile.id,
            name: profile.name,
            handle: profile.handle,
            avatar: profile.avatar
        }
    };
};

const updateStoredPostsForProfile = (storageKey, profile) => {
    const posts = readJson(storageKey, []);
    if (!Array.isArray(posts) || posts.length === 0) {
        return false;
    }

    let changed = false;
    const nextPosts = posts.map((post) => {
        const nextPost = applyProfileToPost(post, profile);
        if (nextPost !== post) {
            changed = true;
        }
        return nextPost;
    });

    if (changed) {
        writeJson(storageKey, nextPosts);
    }

    return changed;
};

const emitSocialUpdate = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('wiseraven:social-updated'));
    }
};

const ensureUserNode = (graph, userId) => {
    if (!userId) return;
    if (!graph.users[userId]) {
        graph.users[userId] = { following: [], followers: [] };
    }
};

export const socialGraphService = {
    registerUserProfile(user) {
        if (!user?.id) return;
        const profiles = loadProfiles();
        const profile = profileFromUser(user);
        profiles[user.id] = profile;
        saveProfiles(profiles);

        const graph = loadGraph();
        ensureUserNode(graph, user.id);
        saveGraph(graph);
        emitSocialUpdate();
    },

    syncProfileAcrossStorage(user) {
        if (!user?.id) return;

        const profile = profileFromUser(user);
        const profiles = loadProfiles();
        profiles[user.id] = profile;
        saveProfiles(profiles);

        const didChangePosts = [
            'wiseRecentPosts',
            'wiseDiscoverPosts',
            'wiseBookmarks',
            'wiseLikedPosts'
        ]
            .map((storageKey) => updateStoredPostsForProfile(storageKey, profile))
            .some(Boolean);

        if (didChangePosts && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('wiseraven:posts-updated'));
            window.dispatchEvent(new Event('wiseraven:likes-updated'));
        }

        emitSocialUpdate();
    },

    followUser(currentUserId, targetUserId) {
        if (!currentUserId || !targetUserId || currentUserId === targetUserId) return false;

        const graph = loadGraph();
        ensureUserNode(graph, currentUserId);
        ensureUserNode(graph, targetUserId);

        const current = graph.users[currentUserId];
        const target = graph.users[targetUserId];

        if (!current.following.includes(targetUserId)) {
            current.following.push(targetUserId);
        }
        if (!target.followers.includes(currentUserId)) {
            target.followers.push(currentUserId);
        }

        saveGraph(graph);
        emitSocialUpdate();
        return true;
    },

    unfollowUser(currentUserId, targetUserId) {
        if (!currentUserId || !targetUserId || currentUserId === targetUserId) return false;

        const graph = loadGraph();
        ensureUserNode(graph, currentUserId);
        ensureUserNode(graph, targetUserId);

        const current = graph.users[currentUserId];
        const target = graph.users[targetUserId];

        current.following = current.following.filter((id) => id !== targetUserId);
        target.followers = target.followers.filter((id) => id !== currentUserId);

        saveGraph(graph);
        emitSocialUpdate();
        return true;
    },

    isFollowing(currentUserId, targetUserId) {
        if (!currentUserId || !targetUserId) return false;
        const graph = loadGraph();
        ensureUserNode(graph, currentUserId);
        return graph.users[currentUserId].following.includes(targetUserId);
    },

    getFollowingIds(userId) {
        if (!userId) return [];
        const graph = loadGraph();
        ensureUserNode(graph, userId);
        return graph.users[userId].following;
    },

    getFollowerIds(userId) {
        if (!userId) return [];
        const graph = loadGraph();
        ensureUserNode(graph, userId);
        return graph.users[userId].followers;
    },

    getCounts(userId) {
        const following = this.getFollowingIds(userId).length;
        const followers = this.getFollowerIds(userId).length;
        return { following, followers };
    },

    getProfiles(userIds = []) {
        const profiles = loadProfiles();
        return userIds.map((id) => profiles[id]).filter(Boolean);
    }
};
