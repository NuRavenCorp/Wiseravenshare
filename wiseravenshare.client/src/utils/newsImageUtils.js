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

const FALLBACK_CATEGORY_IMAGES = {
    business: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=80',
    productivity: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
    research: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80',
    policy: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=80',
    engineering: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80',
    security: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80',
    healthcare: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80',
    education: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80',
    general: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=80'
};

const collectImageCandidates = (article = {}) => {
    const candidates = [];
    const addCandidate = (value) => {
        const normalized = normalizeImageUrl(value);
        if (normalized && !candidates.includes(normalized)) {
            candidates.push(normalized);
        }
    };

    [
        article?.imageUrl,
        article?.thumbnailUrl,
        article?.urlToImage,
        article?.image,
        article?.heroImage,
        article?.bannerImage,
        article?.coverImage,
        article?.featuredImage,
        article?.ogImage,
        article?.thumbnail,
        article?.mediaUrl,
        article?.image_url,
        article?.thumbnail_url,
        article?.cover_image,
        article?.featured_image
    ].forEach(addCandidate);

    const nestedMedia = article?.media;
    if (nestedMedia) {
        if (Array.isArray(nestedMedia)) {
            nestedMedia.forEach((entry) => {
                addCandidate(entry?.url);
                addCandidate(entry?.thumbnail);
                addCandidate(entry?.content);
                addCandidate(entry?.src);
            });
        } else {
            addCandidate(nestedMedia?.url);
            addCandidate(nestedMedia?.thumbnail);
            addCandidate(nestedMedia?.content);
            addCandidate(nestedMedia?.src);
        }
    }

    if (article?.enclosure) {
        addCandidate(article.enclosure?.url);
        addCandidate(article.enclosure?.link);
    }

    if (article?.content) {
        const htmlImageMatches = [...String(article.content).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]);
        htmlImageMatches.forEach(addCandidate);
    }

    if (article?.summary) {
        const summaryImageMatches = [...String(article.summary).matchAll(/https?:\/\/[^\s"')>]+/gi)].map((match) => match[0]);
        summaryImageMatches.forEach(addCandidate);
    }

    return candidates;
};

const buildFallbackImage = (article = {}) => {
    const category = String(article?.category || '').trim().toLowerCase();
    const categoryKey = Object.keys(FALLBACK_CATEGORY_IMAGES).find((key) => category.includes(key));
    return FALLBACK_CATEGORY_IMAGES[categoryKey || 'general'];
};

export const resolveArticleImage = (article = {}) => {
    const candidates = collectImageCandidates(article);
    const resolved = candidates.find((value) => isHttpUrl(value));
    return resolved ? normalizeImageUrl(resolved) : buildFallbackImage(article);
};
