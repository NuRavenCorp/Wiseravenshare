const PRIORITY_BASE = {
    urgent: 100,
    high: 70,
    medium: 45,
    low: 20
};

const FALLBACK_TRENDS = [
    { topic: '#WiseRaven', posts: '12.4K', score: 12400 },
    { topic: '#TruthDetection', posts: '8.2K', score: 8200 },
    { topic: '#AIRevolution', posts: '6.9K', score: 6900 },
    { topic: '#SocialMedia', posts: '5.1K', score: 5100 }
];

const safeDate = (value) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatPostCount = (value) => {
    if (!Number.isFinite(value) || value <= 0) {
        return '0';
    }

    if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
    }

    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
    }

    return `${Math.round(value)}`;
};

export const extractHashtags = (text = '') => {
    const matches = text.match(/#[\w]+/g) || [];
    return matches.map((tag) => tag.toLowerCase());
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const computeEngagementScore = (post, weights = {}) => {
    const scoringWeights = {
        likes: 1.7,
        reposts: 2.4,
        comments: 1.3,
        truthScore: 0.2,
        ...weights
    };

    const likes = Number(post.likes) || 0;
    const reposts = Number(post.reposts) || 0;
    const comments = Array.isArray(post.comments) ? post.comments.length : (Number(post.comments) || 0);
    const truthScore = Number(post.truthScore) || 0;

    return (likes * scoringWeights.likes)
        + (reposts * scoringWeights.reposts)
        + (comments * scoringWeights.comments)
        + (truthScore * scoringWeights.truthScore);
};

const recencyFactor = (createdAt) => {
    const date = safeDate(createdAt);
    if (!date) {
        return 0.5;
    }

    const ageHours = Math.max(1, (Date.now() - date.getTime()) / (1000 * 60 * 60));
    return Math.min(1, 24 / ageHours);
};

const estimatedImpressions = (post) => {
    const followerCount = Number(post?.user?.followersCount) || Number(post?.followersCount) || 240;
    const likes = Number(post?.likes) || 0;
    const reposts = Number(post?.reposts) || 0;
    const comments = Array.isArray(post?.comments) ? post.comments.length : (Number(post?.comments) || 0);

    // Impression estimate grows with audience + interaction spread effect.
    return Math.max(100, followerCount + (likes * 24) + (reposts * 42) + (comments * 18));
};

const normalizeTextLength = (post) => {
    const length = String(post?.content || '').trim().length;
    if (length === 0) return 0.5;
    if (length < 30) return 0.7;
    if (length <= 240) return 1;
    if (length <= 480) return 0.9;
    return 0.75;
};

export const predictPostEngagement = (post, options = {}) => {
    const horizonHours = Math.max(1, Number(options.horizonHours) || 24);
    const baseScore = computeEngagementScore(post);
    const impressions = estimatedImpressions(post);
    const currentLikes = Number(post?.likes) || 0;
    const currentReposts = Number(post?.reposts) || 0;
    const currentComments = Array.isArray(post?.comments) ? post.comments.length : (Number(post?.comments) || 0);
    const truthScore = clamp(Number(post?.truthScore) || 65, 20, 100);
    const freshness = recencyFactor(post?.createdAt);
    const contentFit = normalizeTextLength(post);
    const hashtagCount = extractHashtags(post?.content || '').length;
    const hashtagBoost = clamp(1 + (hashtagCount * 0.05), 1, 1.2);

    const engagementRate = clamp((baseScore / impressions) * 0.14, 0.01, 0.28);
    const qualityMultiplier = (truthScore / 100) * freshness * contentFit * hashtagBoost;
    const predictionCore = impressions * engagementRate * qualityMultiplier;
    const horizonScale = Math.sqrt(horizonHours / 24);
    const predictedTotalScore = Math.round((baseScore + (predictionCore * 12)) * horizonScale);

    const predictedLikes = Math.max(currentLikes, Math.round(currentLikes + (predictionCore * 0.55)));
    const predictedReposts = Math.max(currentReposts, Math.round(currentReposts + (predictionCore * 0.22)));
    const predictedComments = Math.max(currentComments, Math.round(currentComments + (predictionCore * 0.23)));
    const confidence = Math.round(clamp((freshness * 52) + (truthScore * 0.35) + (contentFit * 18), 25, 96));

    return {
        predictedEngagementScore: predictedTotalScore,
        predictedLikes,
        predictedReposts,
        predictedComments,
        confidence
    };
};

export const rankPostsByEngagement = (posts = []) => {
    return [...posts]
        .map((post) => ({
            ...post,
            engagementScore: Math.round(computeEngagementScore(post))
        }))
        .sort((a, b) => b.engagementScore - a.engagementScore);
};

export const rankPostsByPredictedEngagement = (posts = [], options = {}) => {
    return [...posts]
        .map((post) => {
            const prediction = predictPostEngagement(post, options);
            return {
                ...post,
                ...prediction
            };
        })
        .sort((a, b) => b.predictedEngagementScore - a.predictedEngagementScore);
};

export const computeTrendingTopics = (posts = [], limit = 6) => {
    if (!Array.isArray(posts) || posts.length === 0) {
        return FALLBACK_TRENDS.slice(0, limit);
    }

    const buckets = new Map();

    posts.forEach((post) => {
        const tags = extractHashtags(post.content || '');
        if (tags.length === 0) {
            return;
        }

        const momentum = computeEngagementScore(post) * recencyFactor(post.createdAt);
        tags.forEach((tag) => {
            const current = buckets.get(tag) || { score: 0, mentions: 0 };
            current.score += momentum;
            current.mentions += 1;
            buckets.set(tag, current);
        });
    });

    const ranked = [...buckets.entries()]
        .map(([tag, value]) => ({
            topic: tag.startsWith('#') ? tag : `#${tag}`,
            score: value.score,
            mentions: value.mentions,
            posts: formatPostCount(value.score + (value.mentions * 12))
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return ranked.length > 0 ? ranked : FALLBACK_TRENDS.slice(0, limit);
};

export const computeTaskPriorityScore = (task) => {
    const priority = String(task?.priority || 'medium').toLowerCase();
    const priorityScore = PRIORITY_BASE[priority] ?? PRIORITY_BASE.medium;

    const due = safeDate(task?.dueDate);
    let dueScore = 0;

    if (due) {
        const hoursRemaining = (due.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursRemaining <= 0) {
            dueScore = 55;
        } else if (hoursRemaining <= 6) {
            dueScore = 45;
        } else if (hoursRemaining <= 24) {
            dueScore = 35;
        } else if (hoursRemaining <= 72) {
            dueScore = 20;
        } else if (hoursRemaining <= 168) {
            dueScore = 10;
        }
    }

    const estimateHours = Number(task?.estimate) || 1;
    const complexityBoost = Math.min(14, estimateHours * 2);

    const age = safeDate(task?.createdAt);
    const ageHours = age ? Math.max(0, (Date.now() - age.getTime()) / (1000 * 60 * 60)) : 0;
    const staleBoost = Math.min(12, Math.floor(ageHours / 24));

    return Math.round(priorityScore + dueScore + complexityBoost + staleBoost);
};

export const getRecommendedPriority = (score) => {
    if (score >= 125) return 'urgent';
    if (score >= 95) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
};

export const rankTasksForExecution = (tasks = []) => {
    return [...tasks]
        .map((task) => {
            const priorityScore = computeTaskPriorityScore(task);
            return {
                ...task,
                priorityScore,
                recommendedPriority: getRecommendedPriority(priorityScore)
            };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore);
};

const tokenizeInterest = (content = '') => {
    const hashtagTokens = extractHashtags(content).map((tag) => tag.replace('#', ''));
    const wordTokens = String(content || '')
        .toLowerCase()
        .replace(/[^a-z0-9#\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !token.startsWith('#'));

    return [...new Set([...hashtagTokens, ...wordTokens])];
};

const normalizeRatio = (value, maxValue) => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (!Number.isFinite(maxValue) || maxValue <= 0) return 0;
    return clamp(value / maxValue, 0, 1);
};

const buildUserSignalMap = (posts = []) => {
    const map = new Map();
    const now = Date.now();

    posts.forEach((post) => {
        const userId = post?.userId || post?.user?.id;
        if (!userId) return;

        const existing = map.get(userId) || {
            postCount: 0,
            recentPostCount: 0,
            engagementTotal: 0,
            latestPostAt: 0,
            interests: new Set()
        };

        existing.postCount += 1;
        existing.engagementTotal += computeEngagementScore(post);

        const createdAt = safeDate(post?.createdAt);
        if (createdAt) {
            const ts = createdAt.getTime();
            existing.latestPostAt = Math.max(existing.latestPostAt, ts);
            const ageDays = (now - ts) / (1000 * 60 * 60 * 24);
            if (ageDays <= 7) {
                existing.recentPostCount += 1;
            }
        }

        tokenizeInterest(post?.content).forEach((token) => existing.interests.add(token));
        map.set(userId, existing);
    });

    return map;
};

const jaccardSimilarity = (aSet, bSet) => {
    if (!aSet || !bSet || aSet.size === 0 || bSet.size === 0) return 0;
    let intersection = 0;
    aSet.forEach((value) => {
        if (bSet.has(value)) {
            intersection += 1;
        }
    });

    const union = aSet.size + bSet.size - intersection;
    return union > 0 ? intersection / union : 0;
};

export const computeWhoToFollowRecommendations = ({
    currentUserId,
    candidateProfiles = [],
    posts = [],
    followingIds = [],
    getCounts,
    getFollowerIds,
    getFollowingIds,
    limit = 4
} = {}) => {
    if (!currentUserId || !Array.isArray(candidateProfiles) || candidateProfiles.length === 0) {
        return [];
    }

    const followingSet = new Set(followingIds);
    const userSignals = buildUserSignalMap(posts);
    const currentSignals = userSignals.get(currentUserId) || {
        interests: new Set(),
        latestPostAt: 0
    };

    const maxFollowers = Math.max(
        1,
        ...candidateProfiles.map((profile) => (getCounts?.(profile.id)?.followers || 0))
    );

    const ranked = candidateProfiles
        .filter((profile) => profile?.id && profile.id !== currentUserId && !followingSet.has(profile.id))
        .map((profile) => {
            const counts = getCounts?.(profile.id) || { followers: 0, following: 0 };
            const followerIds = getFollowerIds?.(profile.id) || [];
            const profileFollowingIds = getFollowingIds?.(profile.id) || [];

            const mutualFollowers = followerIds.filter((id) => followingSet.has(id)).length;
            const secondDegreeLinks = profileFollowingIds.filter((id) => followingSet.has(id)).length;
            const candidateSignals = userSignals.get(profile.id) || {
                postCount: 0,
                recentPostCount: 0,
                engagementTotal: 0,
                latestPostAt: 0,
                interests: new Set()
            };

            const avgEngagement = candidateSignals.postCount > 0
                ? candidateSignals.engagementTotal / candidateSignals.postCount
                : 0;
            const interestSimilarity = jaccardSimilarity(currentSignals.interests, candidateSignals.interests);

            const mutualScore = clamp(mutualFollowers / 6, 0, 1);
            const graphProximityScore = clamp(secondDegreeLinks / 6, 0, 1);
            const activityScore = clamp(candidateSignals.recentPostCount / 6, 0, 1);
            const engagementScore = clamp(avgEngagement / 160, 0, 1);
            const popularityScore = normalizeRatio(counts.followers, maxFollowers);

            const recencyScore = candidateSignals.latestPostAt > 0
                ? clamp(1 - ((Date.now() - candidateSignals.latestPostAt) / (1000 * 60 * 60 * 24 * 30)), 0, 1)
                : 0;

            const score = (
                (mutualScore * 0.30) +
                (interestSimilarity * 0.24) +
                (activityScore * 0.14) +
                (engagementScore * 0.12) +
                (graphProximityScore * 0.10) +
                (popularityScore * 0.06) +
                (recencyScore * 0.04)
            ) * 100;

            const reasons = [];
            if (mutualFollowers > 0) reasons.push(`${mutualFollowers} mutual connections`);
            if (interestSimilarity >= 0.2) reasons.push('similar interests');
            if (candidateSignals.recentPostCount >= 2) reasons.push('active this week');
            if (avgEngagement >= 35) reasons.push('strong engagement');

            return {
                ...profile,
                followersCount: counts.followers,
                mutualCount: mutualFollowers,
                secondDegreeCount: secondDegreeLinks,
                recentPostCount: candidateSignals.recentPostCount,
                interestSimilarity,
                avgEngagement,
                rankScore: Number(score.toFixed(2)),
                reason: reasons[0] || 'recommended for discovery',
                explanation: reasons
            };
        })
        .sort((a, b) => {
            if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
            if (b.followersCount !== a.followersCount) return b.followersCount - a.followersCount;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

    // Lightweight diversity pass: avoid top results with identical primary interest profile.
    const selected = [];
    const seenReason = new Set();

    ranked.forEach((candidate) => {
        if (selected.length >= limit) return;

        const reasonKey = candidate.reason;
        if (seenReason.has(reasonKey) && selected.length < Math.max(2, limit - 1)) {
            return;
        }

        selected.push(candidate);
        seenReason.add(reasonKey);
    });

    if (selected.length < limit) {
        ranked.forEach((candidate) => {
            if (selected.length >= limit) return;
            if (!selected.some((picked) => picked.id === candidate.id)) {
                selected.push(candidate);
            }
        });
    }

    return selected.slice(0, limit);
};
