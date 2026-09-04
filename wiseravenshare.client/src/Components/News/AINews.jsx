import React, { useEffect, useMemo, useState } from 'react';
import Compartment from '../Common/Compartment';
import { resolveArticleImage } from '../../utils/newsImageUtils';

const aiFallbackNews = [
    {
        id: 'ai-1',
        title: 'AI copilots expand from coding into finance and operations',
        source: 'RavenWire AI Desk',
        coverage: ['Nationwide', 'Free Tier'],
        category: 'Business',
        summary: 'Enterprises are moving copilots beyond engineering, with measurable gains in planning, reporting, and forecasting speed.',
        publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        confidence: 92
    },
    {
        id: 'ai-2',
        title: 'Multimodal models reduce support ticket resolution time by 31%',
        source: 'Signal Labs',
        coverage: ['Nationwide', 'Free Tier'],
        category: 'Productivity',
        summary: 'Teams using image-and-text assistants are closing tickets faster and improving first-response quality scores.',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        confidence: 88
    },
    {
        id: 'ai-3',
        title: 'New benchmark highlights reasoning reliability over raw speed',
        source: 'Open Metrics Group',
        coverage: ['International', 'Free Tier'],
        category: 'Research',
        summary: 'A new benchmark suite ranks model consistency under adversarial prompts, shifting evaluation toward trustworthiness.',
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        confidence: 90
    },
    {
        id: 'ai-4',
        title: 'Regulators publish first draft framework for AI disclosure labels',
        source: 'Policy Today',
        coverage: ['International', 'Free Tier'],
        category: 'Policy',
        summary: 'Draft guidance asks teams to label synthetic media and model-generated summaries across public-facing channels.',
        publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        confidence: 85
    },
    {
        id: 'ai-5',
        title: 'Open source tooling for agent memory orchestration gains adoption',
        source: 'Dev Fabric',
        coverage: ['Nationwide', 'Free Tier'],
        category: 'Engineering',
        summary: 'Platform teams are standardizing memory layers and tool routing patterns for enterprise copilots.',
        publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
        confidence: 87
    },
    {
        id: 'ai-6',
        title: 'AI red-teaming reports show prompt-injection risks in production stacks',
        source: 'Cyber Frontier',
        coverage: ['Breaking', 'International', 'Free Tier'],
        category: 'Security',
        summary: 'Security teams are increasing model gateway controls and output filtering for internal assistants.',
        publishedAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
        confidence: 91
    },
    {
        id: 'ai-7',
        title: 'Hospitals pilot triage copilots with clinician-in-the-loop approvals',
        source: 'Health AI Brief',
        coverage: ['Nationwide', 'Free Tier'],
        category: 'Healthcare',
        summary: 'Early pilots indicate improved routing speed while preserving physician oversight on final decisions.',
        publishedAt: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
        confidence: 84
    },
    {
        id: 'ai-8',
        title: 'Retail demand forecasting models cut stockouts during peak week',
        source: 'Commerce Signals',
        coverage: ['Nationwide', 'Free Tier'],
        category: 'Business',
        summary: 'Merchandising teams report stronger in-stock rates after integrating LLM-guided anomaly detection.',
        publishedAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
        confidence: 89
    },
    {
        id: 'ai-9',
        title: 'Classroom assistants gain traction for adaptive practice plans',
        source: 'EdFuture',
        coverage: ['Nationwide', 'Free Tier'],
        category: 'Education',
        summary: 'Educators are using AI to tailor revision plans while preserving curriculum standards and grading policy.',
        publishedAt: new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString(),
        confidence: 83
    },
    {
        id: 'ai-10',
        title: 'Edge AI chips accelerate on-device captioning and translation',
        source: 'Compute Weekly',
        coverage: ['International', 'Free Tier'],
        category: 'Engineering',
        summary: 'New edge hardware enables low-latency language tasks for mobile and kiosk deployments.',
        publishedAt: new Date(Date.now() - 19 * 60 * 60 * 1000).toISOString(),
        confidence: 88
    },
    {
        id: 'ai-11',
        title: 'Synthetic data pipelines improve rare-case model coverage',
        source: 'Lab Notebook',
        coverage: ['International', 'Free Tier'],
        category: 'Research',
        summary: 'Researchers show controlled synthetic sampling can boost performance on low-frequency events.',
        publishedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
        confidence: 86
    },
    {
        id: 'ai-12',
        title: 'Product teams use AI release notes to shorten feedback loops',
        source: 'Build Journal',
        coverage: ['Nationwide', 'Free Tier'],
        category: 'Productivity',
        summary: 'Automated changelog drafts and issue summaries are reducing time between deployment and customer updates.',
        publishedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        confidence: 85
    }
];

const baseCategories = ['All', 'Business', 'Productivity', 'Research', 'Policy', 'Engineering', 'Security', 'Healthcare', 'Education', 'General'];
const baseCoverage = ['All', 'Breaking', 'Nationwide', 'International', 'BBC', 'Free Tier'];
const CUSTOM_FEEDS_STORAGE_KEY = 'wiseCustomRssAtomFeeds';

const breakingKeywords = /(breaking|urgent|alert|war|attack|crisis|storm|flood|quake|evacuation|protest|election)/i;

const freeTierFeeds = [
    {
        id: 'bbc-world',
        source: 'BBC News',
        rssUrl: 'http://feeds.bbci.co.uk/news/world/rss.xml',
        coverage: ['International', 'BBC', 'Free Tier']
    },
    {
        id: 'npr-national',
        source: 'NPR',
        rssUrl: 'https://feeds.npr.org/1003/rss.xml',
        coverage: ['Nationwide', 'Free Tier']
    },
    {
        id: 'guardian-world',
        source: 'The Guardian',
        rssUrl: 'https://www.theguardian.com/world/rss',
        coverage: ['International', 'Free Tier']
    },
    {
        id: 'pbs-headlines',
        source: 'PBS NewsHour',
        rssUrl: 'https://www.pbs.org/newshour/feeds/rss/headlines',
        coverage: ['Nationwide', 'Free Tier']
    }
];

const normalizeCoverageLabel = (value) => {
    const trimmed = String(value || '').trim();
    return trimmed || 'Custom';
};

const normalizeCustomFeed = (feed, index = 0) => {
    const rawSource = String(feed?.source || '').trim();
    const rawUrl = String(feed?.rssUrl || feed?.url || '').trim();
    const rawCoverage = Array.isArray(feed?.coverage)
        ? feed.coverage.map(normalizeCoverageLabel).filter(Boolean)
        : [];

    return {
        id: String(feed?.id || `custom-feed-${index}`).trim() || `custom-feed-${index}`,
        source: rawSource || `Custom Feed ${index + 1}`,
        rssUrl: rawUrl,
        coverage: rawCoverage.length > 0 ? rawCoverage : ['Custom', 'Free Tier']
    };
};

const readCustomFeeds = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(CUSTOM_FEEDS_STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((feed, index) => normalizeCustomFeed(feed, index))
            .filter((feed) => Boolean(feed.rssUrl));
    } catch {
        return [];
    }
};

const humanTime = (iso) => {
    const date = new Date(iso);
    const diff = Math.max(1, Math.floor((Date.now() - date.getTime()) / (1000 * 60)));
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
};

const categoryRules = [
    { category: 'Security', words: ['security', 'breach', 'attack', 'vulnerability', 'risk', 'compliance', 'privacy'] },
    { category: 'Policy', words: ['regulator', 'regulation', 'policy', 'law', 'governance', 'standards'] },
    { category: 'Research', words: ['benchmark', 'paper', 'research', 'study', 'model eval', 'experiment'] },
    { category: 'Engineering', words: ['api', 'sdk', 'framework', 'developer', 'infrastructure', 'open source', 'deployment', 'chip'] },
    { category: 'Healthcare', words: ['health', 'hospital', 'clinical', 'patient', 'medic'] },
    { category: 'Education', words: ['education', 'classroom', 'student', 'teacher', 'curriculum', 'learning'] },
    { category: 'Business', words: ['enterprise', 'finance', 'revenue', 'retail', 'market', 'operations'] },
    { category: 'Productivity', words: ['productivity', 'workflow', 'ticket', 'support', 'automation', 'copilot'] }
];

const inferCategoryFromText = (text) => {
    const normalized = (text || '').toLowerCase();
    const hit = categoryRules.find((rule) => rule.words.some((word) => normalized.includes(word)));
    return hit?.category || 'General';
};

const sanitizeExternalUrl = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const parsed = new URL(trimmed);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
    } catch {
        return null;
    }
};

const extractExternalUrl = (item = {}) => {
    return (
        sanitizeExternalUrl(item.externalUrl) ||
        sanitizeExternalUrl(item.sourceUrl) ||
        sanitizeExternalUrl(item.url) ||
        sanitizeExternalUrl(item.link) ||
        null
    );
};

const buildExpandedContent = (article = {}) => {
    const title = article.title || 'AI update';
    const source = article.source || 'AI Desk';
    const summary = article.summary || 'This development is influencing how teams adopt AI in daily operations.';
    const category = article.category || inferCategoryFromText(`${article.title || ''} ${article.summary || ''}`);

    const categoryLens = {
        Business: 'Leaders are tying adoption to measurable outcomes such as cycle time, conversion lift, and operating margin improvements.',
        Productivity: 'Teams are reporting reduced handoff friction and shorter review loops when assistants are embedded directly in workflows.',
        Research: 'Researchers continue to focus on robustness, calibration, and reproducibility rather than single-benchmark headline scores.',
        Policy: 'Policy teams are emphasizing transparency, human oversight, and clearer disclosure requirements for generated content.',
        Engineering: 'Engineering groups are prioritizing reliability patterns including guardrails, observability, fallback modes, and cost controls.',
        Security: 'Security teams are strengthening gateway policies, prompt hardening, and outbound content checks to reduce abuse risk.',
        Healthcare: 'Clinical and operations stakeholders are validating safety, auditability, and accountability before broad rollout.',
        Education: 'Educators are balancing personalization benefits with curriculum consistency, fairness, and data privacy expectations.',
        General: 'Cross-functional teams are combining governance, product design, and technical safeguards to scale usage responsibly.'
    };

    const lensText = categoryLens[category] || categoryLens.General;

    return [
        `${summary}`,
        `${source} reports that ${title.toLowerCase()} as organizations move from pilot projects to production AI usage. ${lensText}`,
        'In practical terms, teams are investing in clear success metrics, stronger review workflows, and better documentation so outcomes are repeatable across departments. As adoption grows, the biggest differentiator remains disciplined execution: trustworthy data, measurable feedback loops, and governance that can keep pace with product velocity.'
    ].join('\n\n');
};

const normalizeArticle = (article, index) => {
    const normalized = {
        ...article,
        id: article.id || `ai-item-${index}`,
        category: article.category || inferCategoryFromText(`${article.title || ''} ${article.summary || ''} ${article.content || ''}`),
        externalUrl: extractExternalUrl(article)
    };

    const normalizedCoverage = Array.isArray(normalized.coverage)
        ? normalized.coverage.filter(Boolean)
        : [];
    if (normalizedCoverage.length === 0) {
        normalizedCoverage.push('Free Tier');
    }
    if (normalized.source === 'BBC News' && !normalizedCoverage.includes('BBC')) {
        normalizedCoverage.push('BBC');
    }

    if (breakingKeywords.test(`${normalized.title || ''} ${normalized.summary || ''}`) && !normalizedCoverage.includes('Breaking')) {
        normalizedCoverage.push('Breaking');
    }
    normalized.coverage = normalizedCoverage;

    const hasDetailedContent = typeof normalized.content === 'string' && normalized.content.trim().length > 220;
    if (!hasDetailedContent) {
        normalized.content = buildExpandedContent(normalized);
    }

    normalized.imageUrl = resolveArticleImage(normalized);

    return normalized;
};

const toArticleFromPost = (post, index) => ({
    id: `post-${post.id || index}`,
    title: (post.content || 'AI update').split(/\.|\!|\?/)[0].slice(0, 110),
    source: post.user?.name || 'Community Signal',
    coverage: ['Nationwide', 'Free Tier'],
    category: inferCategoryFromText(post.content),
    summary: post.content || 'Community update from WiseRaven.',
    content: post.content || 'Community update from WiseRaven.',
    publishedAt: post.createdAt || new Date().toISOString(),
    confidence: Math.max(70, Math.min(98, Number(post.truthScore) || 82)),
    externalUrl: extractExternalUrl(post)
});

const mapRssItemToArticle = (feed, item, index) => {
    const textPreview = String(item?.description || item?.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const summary = textPreview.slice(0, 220) || 'Latest headline from free-tier public news feed.';

    return {
        id: `${feed.id}-${item?.guid || item?.link || index}`,
        title: item?.title || 'News update',
        source: feed.source,
        coverage: [...feed.coverage],
        category: inferCategoryFromText(`${item?.title || ''} ${summary}`),
        summary,
        content: `${summary}\n\nSource feed: ${feed.source}. Open the original source link for full reporting details and updates.`,
        publishedAt: item?.pubDate || item?.isoDate || new Date().toISOString(),
        confidence: 84,
        externalUrl: sanitizeExternalUrl(item?.link)
    };
};

const fetchFeedArticles = async (feeds) => {
    const requests = feeds.map(async (feed) => {
        try {
            const rssToJsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.rssUrl)}`;
            const response = await fetch(rssToJsonUrl);
            if (!response.ok) return [];
            const payload = await response.json();
            const items = Array.isArray(payload?.items) ? payload.items.slice(0, 6) : [];
            return items.map((item, index) => mapRssItemToArticle(feed, item, index));
        } catch {
            return [];
        }
    });

    const results = await Promise.all(requests);
    return results.flat();
};

const AINews = ({ onOpenArticle, initialCoverage = 'All' }) => {
    const [query, setQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedCoverage, setSelectedCoverage] = useState(baseCoverage.includes(initialCoverage) ? initialCoverage : 'All');
    const [newsItems, setNewsItems] = useState(aiFallbackNews);
    const [customFeeds, setCustomFeeds] = useState(() => readCustomFeeds());
    const [customFeedSource, setCustomFeedSource] = useState('');
    const [customFeedUrl, setCustomFeedUrl] = useState('');
    const [customFeedCoverage, setCustomFeedCoverage] = useState('Custom');
    const [customFeedError, setCustomFeedError] = useState('');

    useEffect(() => {
        setSelectedCoverage(baseCoverage.includes(initialCoverage) ? initialCoverage : 'All');
    }, [initialCoverage]);

    useEffect(() => {
        localStorage.setItem(CUSTOM_FEEDS_STORAGE_KEY, JSON.stringify(customFeeds));
    }, [customFeeds]);

    useEffect(() => {
        let cancelled = false;

        const loadNews = async () => {
            try {
                const feedPosts = JSON.parse(localStorage.getItem('wiseRecentPosts') || '[]');
                const discoverPosts = JSON.parse(localStorage.getItem('wiseDiscoverPosts') || '[]');
                const postArticles = [...feedPosts, ...discoverPosts].slice(0, 18).map(toArticleFromPost);
                const allFeeds = [...freeTierFeeds, ...customFeeds];
                const freeTierArticles = await fetchFeedArticles(allFeeds);

                const merged = [...freeTierArticles, ...postArticles, ...aiFallbackNews]
                    .map(normalizeArticle)
                    .filter((item, idx, arr) => arr.findIndex((a) => a.id === item.id) === idx)
                    .slice(0, 36);

                if (!cancelled) {
                    setNewsItems(merged);
                }
            } catch {
                if (!cancelled) {
                    setNewsItems(aiFallbackNews.map(normalizeArticle));
                }
            }
        };

        loadNews();

        return () => {
            cancelled = true;
        };
    }, [customFeeds]);

    const handleAddCustomFeed = (event) => {
        event.preventDefault();
        const url = String(customFeedUrl || '').trim();
        const source = String(customFeedSource || '').trim();
        const coverage = normalizeCoverageLabel(customFeedCoverage);
        setCustomFeedError('');

        if (!url) {
            setCustomFeedError('Feed URL is required.');
            return;
        }

        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            setCustomFeedError('Feed URL must be a valid absolute URL.');
            return;
        }

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            setCustomFeedError('Feed URL must start with http:// or https://.');
            return;
        }

        setCustomFeeds((prev) => {
            const alreadyExists = prev.some((feed) => String(feed.rssUrl || '').trim().toLowerCase() === parsed.toString().toLowerCase());
            if (alreadyExists) {
                setCustomFeedError('That feed is already subscribed.');
                return prev;
            }

            return [
                {
                    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                    source: source || parsed.hostname.replace(/^www\./i, ''),
                    rssUrl: parsed.toString(),
                    coverage: [coverage, 'Custom', 'Free Tier'].filter((value, index, arr) => arr.indexOf(value) === index)
                },
                ...prev
            ];
        });

        setCustomFeedSource('');
        setCustomFeedUrl('');
        setCustomFeedCoverage('Custom');
    };

    const handleRemoveCustomFeed = (feedId) => {
        setCustomFeeds((prev) => prev.filter((feed) => feed.id !== feedId));
    };

    const availableCategories = useMemo(() => {
        const dynamic = [...new Set(newsItems.map((item) => item.category).filter(Boolean))].sort();
        const ordered = [
            ...baseCategories.filter((category) => category === 'All' || dynamic.includes(category)),
            ...dynamic.filter((category) => !baseCategories.includes(category))
        ];
        return ['All', ...ordered.filter((category) => category !== 'All')];
    }, [newsItems]);

    const filtered = useMemo(() => {
        return newsItems.filter((item) => {
            const categoryOk = selectedCategory === 'All' || item.category === selectedCategory;
            const coverageList = Array.isArray(item.coverage) ? item.coverage : [];
            const coverageOk = selectedCoverage === 'All' || coverageList.includes(selectedCoverage);
            const q = query.trim().toLowerCase();
            const queryOk = !q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q);
            return categoryOk && coverageOk && queryOk;
        });
    }, [newsItems, query, selectedCategory, selectedCoverage]);

    const groupedNews = useMemo(() => {
        if (selectedCategory !== 'All') {
            return [{ category: selectedCategory, articles: filtered }];
        }

        const buckets = filtered.reduce((acc, article) => {
            const category = article.category || 'General';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(article);
            return acc;
        }, {});

        const orderMap = new Map(availableCategories.map((category, index) => [category, index]));
        return Object.keys(buckets)
            .sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999))
            .map((category) => ({ category, articles: buckets[category] }));
    }, [availableCategories, filtered, selectedCategory]);

    return (
        <Compartment badge="AI News" title="AI News Intelligence">
        <div style={{
            background: 'var(--card-bg)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            padding: '18px'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '14px'
            }}>
                <h2 style={{ margin: 0 }}>AI News Intelligence</h2>
                <span style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    color: 'var(--highlight-color)'
                }}>Live + AI Curated</span>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search AI news"
                    style={{
                        flex: 1,
                        minWidth: '220px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-color)'
                    }}
                />
                <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-color)'
                    }}
                >
                    {availableCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
                <select
                    value={selectedCoverage}
                    onChange={(e) => setSelectedCoverage(e.target.value)}
                    style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-color)'
                    }}
                >
                    {baseCoverage.map((coverage) => (
                        <option key={coverage} value={coverage}>{coverage}</option>
                    ))}
                </select>
            </div>

            <form
                onSubmit={handleAddCustomFeed}
                style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '12px',
                    marginBottom: '16px',
                    display: 'grid',
                    gap: '10px'
                }}
            >
                <div style={{ fontSize: '13px', fontWeight: 700 }}>Custom RSS & Atom Feed Subscription Manager</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(260px, 2fr) minmax(140px, 1fr) auto', gap: '8px' }}>
                    <input
                        value={customFeedSource}
                        onChange={(e) => setCustomFeedSource(e.target.value)}
                        placeholder="Feed name (optional)"
                        style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text-color)'
                        }}
                    />
                    <input
                        value={customFeedUrl}
                        onChange={(e) => setCustomFeedUrl(e.target.value)}
                        placeholder="https://example.com/rss or atom.xml"
                        style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text-color)'
                        }}
                    />
                    <select
                        value={customFeedCoverage}
                        onChange={(e) => setCustomFeedCoverage(e.target.value)}
                        style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text-color)'
                        }}
                    >
                        <option value="Custom">Custom</option>
                        <option value="Breaking">Breaking</option>
                        <option value="Nationwide">Nationwide</option>
                        <option value="International">International</option>
                    </select>
                    <button
                        type="submit"
                        style={{
                            border: '1px solid var(--highlight-color)',
                            background: 'rgba(79, 116, 214, 0.22)',
                            color: 'var(--text-color)',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontWeight: 700
                        }}
                    >
                        Add feed
                    </button>
                </div>
                {customFeedError && (
                    <div style={{ fontSize: '12px', color: '#fca5a5' }}>{customFeedError}</div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {customFeeds.length === 0 ? (
                        <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>No custom feeds subscribed yet.</span>
                    ) : customFeeds.map((feed) => (
                        <span
                            key={feed.id}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderRadius: '999px',
                                border: '1px solid var(--border-color)',
                                padding: '5px 10px',
                                fontSize: '12px'
                            }}
                        >
                            <span>{feed.source}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveCustomFeed(feed.id)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#fca5a5',
                                    cursor: 'pointer',
                                    padding: 0,
                                    fontSize: '12px'
                                }}
                            >
                                Remove
                            </button>
                        </span>
                    ))}
                </div>
            </form>

            <div style={{ display: 'grid', gap: '12px' }}>
                {groupedNews.map((group) => (
                    <section key={group.category} style={{ display: 'grid', gap: '10px' }}>
                        {selectedCategory === 'All' && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: '1px solid var(--border-color)',
                                paddingBottom: '6px'
                            }}>
                                <strong style={{ fontSize: '14px' }}>{group.category}</strong>
                                <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>{group.articles.length} articles</span>
                            </div>
                        )}

                        {group.articles.map((article) => (
                            <article
                                key={article.id}
                                onClick={() => onOpenArticle?.(article)}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    padding: '14px',
                                    background: 'rgba(255,255,255,0.02)',
                                    cursor: 'pointer'
                                }}
                            >
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: '12px', alignItems: 'start' }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                                            <strong>{article.title}</strong>
                                            <span style={{ fontSize: '12px', color: 'var(--highlight-color)', whiteSpace: 'nowrap' }}>{article.category}</span>
                                        </div>
                                        <p style={{ margin: '0 0 10px', fontSize: '14px', lineHeight: 1.45 }}>{article.summary}</p>
                                    </div>
                                    <img
                                        src={article.imageUrl}
                                        alt={article.title || 'News story image'}
                                        onError={(event) => {
                                            event.currentTarget.src = resolveArticleImage({
                                                title: article.title,
                                                source: article.source,
                                                category: article.category
                                            });
                                        }}
                                        style={{
                                            width: '120px',
                                            height: '84px',
                                            objectFit: 'cover',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-color)',
                                            background: 'rgba(255,255,255,0.05)'
                                        }}
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--light-color)' }}>
                                    <span>{article.source} • {humanTime(article.publishedAt)}</span>
                                    <span>AI confidence {article.confidence}%</span>
                                </div>
                                {Array.isArray(article.coverage) && article.coverage.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                                        {article.coverage.map((coverage) => (
                                            <span
                                                key={`${article.id}-${coverage}`}
                                                style={{
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '999px',
                                                    padding: '2px 8px',
                                                    fontSize: '11px',
                                                    color: 'var(--light-color)'
                                                }}
                                            >
                                                {coverage}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--highlight-color)', fontWeight: 600 }}>
                                    {article.externalUrl ? 'Open article + source' : 'Open article'}
                                </div>
                            </article>
                        ))}
                    </section>
                ))}

                {filtered.length === 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--light-color)' }}>
                        No AI news matched your filters.
                    </div>
                )}
            </div>
        </div>
        </Compartment>
    );
};

export default AINews;
