const GRAPH_KEY = 'wiseSocialGraph';
const PROFILE_KEY = 'wiseUserProfiles';
const FOLLOW_EVENTS_KEY = 'wiseFollowEvents';
const USER_ALIASES_KEY = 'wiseUserAliases';

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
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.warn(`SocialGraph writeJson failed for ${key}:`, err);
    }
};

const loadGraph = () => readJson(GRAPH_KEY, defaultGraph);
const saveGraph = (graph) => writeJson(GRAPH_KEY, graph);
const loadProfiles = () => readJson(PROFILE_KEY, {});
const saveProfiles = (profiles) => writeJson(PROFILE_KEY, profiles);
const loadFollowEvents = () => readJson(FOLLOW_EVENTS_KEY, []);
const saveFollowEvents = (events) => writeJson(FOLLOW_EVENTS_KEY, events);
const loadUserAliases = () => readJson(USER_ALIASES_KEY, {});
const saveUserAliases = (aliases) => writeJson(USER_ALIASES_KEY, aliases);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toTimestamp = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const profileFromUser = (user) => {
    let avatarVal = user.avatar || user.avatarUrl || ((user.name || user.displayName)?.[0] || 'U').toUpperCase();
    if (typeof avatarVal === 'string' && avatarVal.length > 80000 && avatarVal.startsWith('data:image/')) {
        avatarVal = avatarVal.slice(0, 60000);
    }
    return {
        id: user.id,
        name: user.name || user.displayName || 'User',
        handle: user.handle || user.username || 'user',
        avatar: avatarVal
    };
};

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

const resolveUserId = (userId) => {
    if (!userId) {
        return userId;
    }

    const aliases = loadUserAliases();
    return aliases[`id:${userId}`] || userId;
};

const getCanonicalUserId = (user) => {
    const aliases = loadUserAliases();
    const id = String(user?.id || '').trim();
    const email = String(user?.email || '').trim().toLowerCase();

    if (!id) {
        return '';
    }

    const fromIdAlias = aliases[`id:${id}`];
    const fromEmailAlias = email ? aliases[`email:${email}`] : '';
    const canonicalId = fromIdAlias || fromEmailAlias || id;

    aliases[`id:${id}`] = canonicalId;
    if (email) {
        aliases[`email:${email}`] = canonicalId;
    }
    saveUserAliases(aliases);

    return canonicalId;
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

        const canonicalId = getCanonicalUserId(user);
        if (!canonicalId) {
            return;
        }

        const profiles = loadProfiles();
        const profile = profileFromUser(user);
        profile.id = canonicalId;
        profiles[canonicalId] = profile;
        saveProfiles(profiles);

        const graph = loadGraph();
        ensureUserNode(graph, canonicalId);
        saveGraph(graph);
        emitSocialUpdate();
    },

    syncProfileAcrossStorage(user) {
        if (!user?.id) return;

        const canonicalId = getCanonicalUserId(user);
        if (!canonicalId) {
            return;
        }

        const profile = profileFromUser(user);
        profile.id = canonicalId;
        const profiles = loadProfiles();
        profiles[canonicalId] = profile;
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

        const resolvedCurrentUserId = resolveUserId(currentUserId);
        const resolvedTargetUserId = resolveUserId(targetUserId);
        if (!resolvedCurrentUserId || !resolvedTargetUserId || resolvedCurrentUserId === resolvedTargetUserId) {
            return false;
        }

        const graph = loadGraph();
        ensureUserNode(graph, resolvedCurrentUserId);
        ensureUserNode(graph, resolvedTargetUserId);

        const current = graph.users[resolvedCurrentUserId];
        const target = graph.users[resolvedTargetUserId];

        if (!current.following.includes(resolvedTargetUserId)) {
            current.following.push(resolvedTargetUserId);
        }
        if (!target.followers.includes(resolvedCurrentUserId)) {
            target.followers.push(resolvedCurrentUserId);
        }

        saveGraph(graph);
        recordFollowEvent(resolvedCurrentUserId, resolvedTargetUserId, 'follow');
        emitSocialUpdate();
        return true;
    },

    unfollowUser(currentUserId, targetUserId) {
        if (!currentUserId || !targetUserId || currentUserId === targetUserId) return false;

        const resolvedCurrentUserId = resolveUserId(currentUserId);
        const resolvedTargetUserId = resolveUserId(targetUserId);
        if (!resolvedCurrentUserId || !resolvedTargetUserId || resolvedCurrentUserId === resolvedTargetUserId) {
            return false;
        }

        const graph = loadGraph();
        ensureUserNode(graph, resolvedCurrentUserId);
        ensureUserNode(graph, resolvedTargetUserId);

        const current = graph.users[resolvedCurrentUserId];
        const target = graph.users[resolvedTargetUserId];

        current.following = current.following.filter((id) => id !== resolvedTargetUserId);
        target.followers = target.followers.filter((id) => id !== resolvedCurrentUserId);

        saveGraph(graph);
        recordFollowEvent(resolvedCurrentUserId, resolvedTargetUserId, 'unfollow');
        emitSocialUpdate();
        return true;
    },

    isFollowing(currentUserId, targetUserId) {
        if (!currentUserId || !targetUserId) return false;
        const resolvedCurrentUserId = resolveUserId(currentUserId);
        const resolvedTargetUserId = resolveUserId(targetUserId);
        if (!resolvedCurrentUserId || !resolvedTargetUserId) {
            return false;
        }
        const graph = loadGraph();
        ensureUserNode(graph, resolvedCurrentUserId);
        return graph.users[resolvedCurrentUserId].following.includes(resolvedTargetUserId);
    },

    getFollowingIds(userId) {
        if (!userId) return [];
        const resolvedUserId = resolveUserId(userId);
        const graph = loadGraph();
        ensureUserNode(graph, resolvedUserId);
        return graph.users[resolvedUserId].following;
    },

    getFollowerIds(userId) {
        if (!userId) return [];
        const resolvedUserId = resolveUserId(userId);
        const graph = loadGraph();
        ensureUserNode(graph, resolvedUserId);
        return graph.users[resolvedUserId].followers;
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

        const resolvedViewerId = resolveUserId(viewerId);
        const resolvedCandidateId = resolveUserId(candidateId);
        if (!resolvedViewerId || !resolvedCandidateId || resolvedViewerId === resolvedCandidateId) {
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
        ensureUserNode(graph, resolvedViewerId);
        ensureUserNode(graph, resolvedCandidateId);

        const viewerFollowing = graph.users[resolvedViewerId].following || [];
        const candidateFollowers = graph.users[resolvedCandidateId].followers || [];
        const candidateFollowing = graph.users[resolvedCandidateId].following || [];

        const mutualCount = getMutualCount(candidateFollowers, viewerFollowing);
        const mutualScore = clamp(mutualCount / 10, 0, 1);

        const isReciprocal = candidateFollowing.includes(viewerId);
        const reciprocityScore = isReciprocal ? 1 : 0;

        const followers = candidateFollowers.length;
        const following = candidateFollowing.length;
        const followerLog = Math.log10(followers + 1);
        const ratio = followers / (following + 1);
        const socialProofScore = clamp((followerLog / 4) * 0.7 + clamp(ratio / 6, 0, 1) * 0.3, 0, 1);

        const recentPosts = getRecentPostsForUser(posts, resolvedCandidateId, 14);
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

        const followEvents = loadFollowEvents().filter((event) => event?.actorId === resolvedViewerId && event?.targetId === resolvedCandidateId);
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
