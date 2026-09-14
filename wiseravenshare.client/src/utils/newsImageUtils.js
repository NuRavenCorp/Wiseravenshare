const normalizeImageUrl = (value) => {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('//')) {
        return `https:${trimmed}`;
    }

    return trimmed;
};

const isHttpUrl = (value) => {
    const normalized = normalizeImageUrl(value);
    if (!normalized) return false;

    try {
        const parsed = new URL(normalized);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:';
    } catch {
        return false;
    }
};

const CATEGORY_LABELS = {
    business: 'Business News',
    productivity: 'Productivity News',
    research: 'Research News',
    policy: 'Policy News',
    engineering: 'Engineering News',
    security: 'Security News',
    healthcare: 'Healthcare News',
    education: 'Education News'
};

const buildFallbackImage = (article = {}) => {
    const category = String(article?.category || '').trim().toLowerCase();
    const source = String(article?.source || 'WiseRavenShare').trim();
    const label = CATEGORY_LABELS[category] || 'AI News';
    const text = `${label} | ${source}`;

    return `https://placehold.co/1200x675/0f172a/e2e8f0/png?text=${encodeURIComponent(text)}`;
};

export const resolveArticleImage = (article = {}) => {
    const candidates = [
        article?.imageUrl,
        article?.thumbnailUrl,
        article?.urlToImage,
        article?.image,
        article?.heroImage,
        article?.bannerImage
    ];

    const resolved = candidates.find((value) => isHttpUrl(value));
    return resolved ? normalizeImageUrl(resolved) : buildFallbackImage(article);
};
