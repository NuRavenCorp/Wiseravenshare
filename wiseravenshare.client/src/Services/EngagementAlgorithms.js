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

const engagementScore = (post) => {
    const likes = Number(post.likes) || 0;
    const reposts = Number(post.reposts) || 0;
    const comments = Array.isArray(post.comments) ? post.comments.length : (Number(post.comments) || 0);
    const truthScore = Number(post.truthScore) || 0;

    return (likes * 1.7) + (reposts * 2.4) + (comments * 1.3) + (truthScore * 0.2);
};

const recencyFactor = (createdAt) => {
    const date = safeDate(createdAt);
    if (!date) {
        return 0.5;
    }

    const ageHours = Math.max(1, (Date.now() - date.getTime()) / (1000 * 60 * 60));
    return Math.min(1, 24 / ageHours);
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

        const momentum = engagementScore(post) * recencyFactor(post.createdAt);
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
