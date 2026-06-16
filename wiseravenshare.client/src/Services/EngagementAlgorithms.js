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
