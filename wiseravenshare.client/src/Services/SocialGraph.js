const GRAPH_KEY = 'wiseSocialGraph';
const PROFILE_KEY = 'wiseUserProfiles';
const FOLLOW_EVENTS_KEY = 'wiseFollowEvents';

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
const loadFollowEvents = () => readJson(FOLLOW_EVENTS_KEY, []);
const saveFollowEvents = (events) => writeJson(FOLLOW_EVENTS_KEY, events);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toTimestamp = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
};

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

const recordFollowEvent = (actorId, targetId, action) => {
    if (!actorId || !targetId || !action) {
        return;
    }

    const events = loadFollowEvents();
    const next = [
        ...events,
        {
            actorId,
            targetId,
            action,
            at: new Date().toISOString()
        }
    ].slice(-3000);

    saveFollowEvents(next);
};

const getMutualCount = (leftIds = [], rightIds = []) => {
    if (!Array.isArray(leftIds) || !Array.isArray(rightIds) || leftIds.length === 0 || rightIds.length === 0) {
        return 0;
    }

    const right = new Set(rightIds);
    return leftIds.filter((id) => right.has(id)).length;
};

const getRecentPostsForUser = (posts = [], userId, days = 14) => {
    if (!Array.isArray(posts) || !userId) {
        return [];
    }

    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return posts.filter((post) => {
        if (!post || post.userId !== userId) {
            return false;
        }

        const ts = toTimestamp(post.createdAt);
        if (ts === null) {
            return true;
        }

        return ts >= cutoff;
    });
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
        recordFollowEvent(currentUserId, targetUserId, 'follow');
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
        recordFollowEvent(currentUserId, targetUserId, 'unfollow');
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
    },

    getFollowBehaviorMetrics(viewerId, candidateId, posts = []) {
        if (!viewerId || !candidateId || viewerId === candidateId) {
            return {
                followScore: 0,
                components: {
                    mutualScore: 0,
                    reciprocityScore: 0,
                    socialProofScore: 0,
                    activityScore: 0,
                    engagementScore: 0,
                    retentionScore: 0,
                    affinityScore: 0
                },
                counts: {
                    mutualCount: 0,
                    followers: 0,
                    following: 0,
                    recentPostCount: 0,
                    followEvents: 0,
                    unfollowEvents: 0
                },
                isReciprocal: false
            };
        }

        const graph = loadGraph();
        ensureUserNode(graph, viewerId);
        ensureUserNode(graph, candidateId);

        const viewerFollowing = graph.users[viewerId].following || [];
        const candidateFollowers = graph.users[candidateId].followers || [];
        const candidateFollowing = graph.users[candidateId].following || [];

        const mutualCount = getMutualCount(candidateFollowers, viewerFollowing);
        const mutualScore = clamp(mutualCount / 10, 0, 1);

        const isReciprocal = candidateFollowing.includes(viewerId);
        const reciprocityScore = isReciprocal ? 1 : 0;

        const followers = candidateFollowers.length;
        const following = candidateFollowing.length;
        const followerLog = Math.log10(followers + 1);
        const ratio = followers / (following + 1);
        const socialProofScore = clamp((followerLog / 4) * 0.7 + clamp(ratio / 6, 0, 1) * 0.3, 0, 1);

        const recentPosts = getRecentPostsForUser(posts, candidateId, 14);
        const recentPostCount = recentPosts.length;
        const activityScore = clamp(recentPostCount / 8, 0, 1);

        const totalEngagement = recentPosts.reduce((sum, post) => {
            const likes = Number(post?.likes) || 0;
            const reposts = Number(post?.reposts) || 0;
            const comments = Array.isArray(post?.comments) ? post.comments.length : (Number(post?.comments) || 0);
            return sum + likes + (reposts * 2) + comments;
        }, 0);
        const averageEngagement = recentPostCount > 0 ? totalEngagement / recentPostCount : 0;
        const engagementScore = clamp(averageEngagement / 60, 0, 1);

        const followEvents = loadFollowEvents().filter((event) => event?.actorId === viewerId && event?.targetId === candidateId);
        const followCount = followEvents.filter((event) => event.action === 'follow').length;
        const unfollowCount = followEvents.filter((event) => event.action === 'unfollow').length;
        const retentionScore = followCount === 0
            ? 1
            : clamp(1 - (unfollowCount / followCount), 0, 1);

        const affinityMutualFollowing = getMutualCount(viewerFollowing, candidateFollowing);
        const affinityScore = clamp(affinityMutualFollowing / 10, 0, 1);

        const weighted =
            (mutualScore * 0.24)
            + (reciprocityScore * 0.18)
            + (socialProofScore * 0.16)
            + (activityScore * 0.14)
            + (engagementScore * 0.14)
            + (retentionScore * 0.10)
            + (affinityScore * 0.04);

        return {
            followScore: Math.round(clamp(weighted * 100, 0, 100)),
            components: {
                mutualScore,
                reciprocityScore,
                socialProofScore,
                activityScore,
                engagementScore,
                retentionScore,
                affinityScore
            },
            counts: {
                mutualCount,
                followers,
                following,
                recentPostCount,
                followEvents: followCount,
                unfollowEvents: unfollowCount
            },
            isReciprocal
        };
    }
};
