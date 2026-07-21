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
        profiles[user.id] = {
            id: user.id,
            name: user.name || 'User',
            handle: user.handle || user.username || 'user',
            avatar: user.avatar || (user.name?.[0] || 'U').toUpperCase()
        };
        saveProfiles(profiles);

        const graph = loadGraph();
        ensureUserNode(graph, user.id);
        saveGraph(graph);
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
