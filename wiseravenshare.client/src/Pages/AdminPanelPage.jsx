import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiService } from '../Services/api';
import { useNotification } from '../Contexts/NotificationContext';
import { useAuth } from '../Contexts/AuthContext';
import { pageMapService } from '../Services/pageMapService';
import { crawlerService } from '../Services/crawlerService';
import { siteAuditCrawlerService } from '../Services/siteAuditCrawlerService';
import FeatureReleaseAdminPage from './FeatureReleaseAdminPage';
import TeamAccessAdminPage from './TeamAccessAdminPage';
import RevenueConsolePage from './RevenueConsolePage';
import SiteCrawlerDashboardPage from './SiteCrawlerDashboardPage';
import CrawlerMetricsInsightsPage from './CrawlerMetricsInsightsPage';

/* ─── static config ──────────────────────────────────────────────────── */

const TABS = [
    { id: 'sitemap',  label: '🗺️ Site Map',      desc: 'Activate or gate any part of the site in one click' },
    { id: 'features', label: '🎛️ Feature Gates',  desc: 'Fine-grained feature flag control with pricing tiers' },
    { id: 'team',     label: '👥 Team Access',    desc: 'Manage team members, roles, and invite links' },
    { id: 'revenue',  label: '📊 Revenue',        desc: 'Revenue console and subscription analytics' },
    { id: 'crawler',  label: '🔍 Crawler Audit',  desc: 'Site health scans, SEO issues, and page metrics' },
    { id: 'agent',    label: '🤖 Services Agent', desc: 'IP publishing agent status, bot logs, and diagnostics' },
];

const CATEGORY_META = {
    core:          { label: 'Core Platform',    icon: '🏗️',  color: '#38bdf8' },
    studio:        { label: 'Studio & Video',   icon: '🎬',  color: '#a78bfa' },
    audio:         { label: 'Audio & Music',    icon: '🎵',  color: '#fb923c' },
    library:       { label: 'Media Library',    icon: '📚',  color: '#34d399' },
    news:          { label: 'News & Articles',  icon: '📰',  color: '#fbbf24' },
    team:          { label: 'Team & Workflow',  icon: '👥',  color: '#60a5fa' },
    intelligence:  { label: 'AI & Intelligence',icon: '🧠',  color: '#f472b6' },
    productivity:  { label: 'Productivity',     icon: '📋',  color: '#4ade80' },
    account:       { label: 'Account',          icon: '👤',  color: '#94a3b8' },
    legal:         { label: 'Legal',            icon: '⚖️',  color: '#64748b' },
    admin:         { label: 'Admin Tools',      icon: '🛡️',  color: '#f87171' },
    currency:      { label: 'Currency',         icon: '🪙',  color: '#fde68a' },
};

/* Map page IDs to their corresponding feature catalog keys (when applicable).
   Pages without a catalog key are gated at the app-router level (admin-only). */
const PAGE_FEATURE_KEY_MAP = {
    'podcast-rights-studio': 'podcast.direct_publishing',
    'music-rights-studio':   'copyright.sr_filing',
    'radio-creator':         'podcast.scheduling',
    'growth':                'platform.growth_analytics',
    'revenue':               'platform.revenue_console',
    'team-launchpad':        'platform.team_workflows',
    'collaboration':         'platform.team_workflows',
    'ravensight':            'podcast.direct_publishing',
    'assistant':             'platform.ai_assistant',
    'wisecoin':              'platform.wisecoin',
};

/* Pages that are always admin-only regardless of subscription tier */
const ADMIN_ONLY_PAGES = new Set([
    'revenue', 'team-access-admin', 'feature-release',
    'site-crawler-audit', 'crawler-metrics', 'assistant',
    'growth', 'radio-creator',
]);

/* ─── helper components ───────────────────────────────────────────────── */

const TabBar = ({ active, onChange }) => (
    <div style={{
        display: 'flex', gap: '4px', flexWrap: 'wrap',
        borderBottom: '1px solid rgba(129,140,248,0.18)',
        paddingBottom: '12px', marginBottom: '24px'
    }}>
        {TABS.map((tab) => {
            const isActive = active === tab.id;
            return (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange(tab.id)}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '10px',
                        border: isActive ? '1px solid rgba(129,140,248,0.5)' : '1px solid transparent',
                        background: isActive ? 'rgba(129,140,248,0.16)' : 'transparent',
                        color: isActive ? '#a5b4fc' : '#94a3b8',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {tab.label}
                </button>
            );
        })}
    </div>
);

const GateBadge = ({ gated, adminOnly }) => {
    if (adminOnly) {
        return (
            <span style={{
                fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '2px 8px', borderRadius: '999px',
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                color: '#f87171', whiteSpace: 'nowrap',
            }}>🛡️ Admin Only</span>
        );
    }
    return (
        <span style={{
            fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', padding: '2px 8px', borderRadius: '999px',
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: gated ? 'rgba(248,113,113,0.12)' : 'rgba(34,197,94,0.12)',
            border: gated ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(34,197,94,0.3)',
            color: gated ? '#f87171' : '#4ade80',
        }}>
            <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: gated ? '#f87171' : '#4ade80', display: 'inline-block',
            }} />
            {gated ? 'Gated' : 'Live'}
        </span>
    );
};

/* ─── Site Map Control tab ────────────────────────────────────────────── */

const SiteMapTab = ({ onNavigate }) => {
    const { addToast } = useNotification();
    const [catalog, setCatalog] = useState(null);
    const [crawlSummary, setCrawlSummary] = useState(null);
    const [compartments, setCompartments] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [loadingCompartments, setLoadingCompartments] = useState(true);
    const [actionLoading, setActionLoading] = useState({});
    const [categoryBulkLoading, setCategoryBulkLoading] = useState({});
    const [availabilitySaving, setAvailabilitySaving] = useState({});
    const [filterCategory, setFilterCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [crawlJobId, setCrawlJobId] = useState(null);
    const [crawling, setCrawling] = useState(false);

    const allPages = useMemo(() => pageMapService.getPageMap(), []);
    const connectionGraph = useMemo(() => pageMapService.getFeatureConnectionGraph(), []);

    /* Build a connections-count lookup from the graph */
    const connectionCount = useMemo(() => {
        const counts = {};
        for (const edge of connectionGraph.edges) {
            counts[edge.sourceId] = (counts[edge.sourceId] || 0) + edge.weight;
            counts[edge.targetId] = (counts[edge.targetId] || 0) + edge.weight;
        }
        return counts;
    }, [connectionGraph]);

    /* Build feature key → gate status map from catalog */
    const featureStatusMap = useMemo(() => {
        const map = {};
        if (!catalog?.features) return map;
        for (const f of catalog.features) {
            map[f.key] = f.status; // 'released' | 'gated'
        }
        return map;
    }, [catalog]);

    const loadCatalog = useCallback(async () => {
        setLoadingCatalog(true);
        try {
            const res = await apiService.getFeatureReleaseCatalog();
            setCatalog(res.data);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Unable to load feature catalog.', 'error');
        } finally {
            setLoadingCatalog(false);
        }
    }, [addToast]);

    const loadCrawlSummary = useCallback(async () => {
        try {
            const summary = await crawlerService.getSummary();
            setCrawlSummary(summary);
        } catch {
            // Non-blocking
        }
    }, []);

    const loadCompartmentAvailability = useCallback(async () => {
        setLoadingCompartments(true);
        try {
            const response = await apiService.getFeatureCompartments();
            const items = Array.isArray(response?.data?.compartments) ? response.data.compartments : [];
            setCompartments(items);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Unable to load component availability.', 'error');
        } finally {
            setLoadingCompartments(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadCatalog();
        loadCrawlSummary();
        loadCompartmentAvailability();
    }, [loadCatalog, loadCrawlSummary, loadCompartmentAvailability]);

    const runSiteCrawl = async () => {
        setCrawling(true);
        try {
            const job = await siteAuditCrawlerService.startCrawl({
                rootUrl: window.location.origin,
                maxPages: 200,
                maxDepth: 4,
            });
            setCrawlJobId(job.jobId || job.id);
            addToast('Site crawl started. Refresh in a few minutes for updated connectivity data.', 'info');
        } catch (err) {
            addToast(err?.message || 'Could not start site crawl.', 'error');
        } finally {
            setCrawling(false);
        }
    };

    const releaseFeature = async (key, pageId) => {
        setActionLoading((p) => ({ ...p, [pageId]: 'releasing' }));
        try {
            await apiService.releaseFeature(key);
            addToast(`"${pageId}" activated.`, 'success');
            await loadCatalog();
        } catch (err) {
            addToast(err?.response?.data?.message || `Failed to activate "${pageId}".`, 'error');
        } finally {
            setActionLoading((p) => { const n = { ...p }; delete n[pageId]; return n; });
        }
    };

    const gateFeature = async (key, pageId) => {
        setActionLoading((p) => ({ ...p, [pageId]: 'gating' }));
        try {
            await apiService.gateFeature(key);
            addToast(`"${pageId}" gated.`, 'info');
            await loadCatalog();
        } catch (err) {
            addToast(err?.response?.data?.message || `Failed to gate "${pageId}".`, 'error');
        } finally {
            setActionLoading((p) => { const n = { ...p }; delete n[pageId]; return n; });
        }
    };

    const releaseCategoryAll = async (category) => {
        const pages = allPages.filter((p) => p.category === category);
        const keys = pages
            .map((p) => PAGE_FEATURE_KEY_MAP[p.id])
            .filter(Boolean)
            .filter((k) => featureStatusMap[k] !== 'released');
        if (!keys.length) { addToast('All features in this category are already live.', 'info'); return; }

        setCategoryBulkLoading((p) => ({ ...p, [category]: 'releasing' }));
        let released = 0;
        for (const key of keys) {
            try { await apiService.releaseFeature(key); released++; } catch { /* continue */ }
        }
        addToast(`Released ${released} feature(s) in ${category}.`, 'success');
        await loadCatalog();
        setCategoryBulkLoading((p) => { const n = { ...p }; delete n[category]; return n; });
    };

    const gateCategoryAll = async (category) => {
        const pages = allPages.filter((p) => p.category === category);
        const keys = pages
            .map((p) => PAGE_FEATURE_KEY_MAP[p.id])
            .filter(Boolean)
            .filter((k) => featureStatusMap[k] === 'released');
        if (!keys.length) { addToast('All features in this category are already gated.', 'info'); return; }

        setCategoryBulkLoading((p) => ({ ...p, [category]: 'gating' }));
        let gated = 0;
        for (const key of keys) {
            try { await apiService.gateFeature(key); gated++; } catch { /* continue */ }
        }
        addToast(`Gated ${gated} feature(s) in ${category}.`, 'info');
        await loadCatalog();
        setCategoryBulkLoading((p) => { const n = { ...p }; delete n[category]; return n; });
    };

    const setCompartmentAvailability = async (compartmentKey, mode) => {
        const normalizedMode = String(mode || '').trim().toLowerCase();
        if (!['full', 'partial', 'off'].includes(normalizedMode)) {
            addToast('Invalid availability mode selected.', 'error');
            return;
        }

        setAvailabilitySaving((prev) => ({ ...prev, [compartmentKey]: normalizedMode }));
        try {
            await apiService.setFeatureCompartmentAvailability(
                compartmentKey,
                normalizedMode,
                `Availability set to ${normalizedMode} from admin site map panel.`
            );
            addToast(`"${compartmentKey}" set to ${normalizedMode}.`, normalizedMode === 'off' ? 'warning' : 'success');
            await loadCompartmentAvailability();
        } catch (err) {
            addToast(err?.response?.data?.message || `Failed to set availability for "${compartmentKey}".`, 'error');
        } finally {
            setAvailabilitySaving((prev) => {
                const next = { ...prev };
                delete next[compartmentKey];
                return next;
            });
        }
    };

    /* Derived: pages grouped by category, filtered */
    const categories = useMemo(() => [...new Set(allPages.map((p) => p.category))], [allPages]);

    const filteredPages = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return allPages.filter((p) => {
            if (filterCategory !== 'all' && p.category !== filterCategory) return false;
            if (q) {
                return (
                    p.label.toLowerCase().includes(q) ||
                    p.id.toLowerCase().includes(q) ||
                    (p.tags || []).some((t) => t.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [allPages, filterCategory, searchQuery]);

    const pagesByCategory = useMemo(() => {
        const map = {};
        for (const page of filteredPages) {
            if (!map[page.category]) map[page.category] = [];
            map[page.category].push(page);
        }
        return map;
    }, [filteredPages]);

    if (loadingCatalog) {
        return (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗺️</div>
                Loading site map & gate status…
            </div>
        );
    }

    const totalPages = allPages.length;
    const livePages = allPages.filter((p) => {
        const key = PAGE_FEATURE_KEY_MAP[p.id];
        if (!key) return !ADMIN_ONLY_PAGES.has(p.id);
        return featureStatusMap[key] !== 'gated';
    }).length;

    return (
        <div style={{ display: 'grid', gap: '20px' }}>

            {/* Summary bar */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px',
            }}>
                {[
                    { label: 'Total Pages', value: totalPages, icon: '📄', color: '#a5b4fc' },
                    { label: 'Live',         value: livePages,  icon: '🟢', color: '#4ade80' },
                    { label: 'Gated/Admin',  value: totalPages - livePages, icon: '🔒', color: '#f87171' },
                    { label: 'Connections',  value: connectionGraph.edges.length, icon: '🔗', color: '#38bdf8' },
                    { label: 'Crawler Jobs', value: crawlSummary ? 'Connected' : 'Idle', icon: '🔍', color: '#fbbf24' },
                ].map((stat) => (
                    <div key={stat.label} style={{
                        background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                        borderRadius: '14px', padding: '14px 16px',
                        display: 'flex', flexDirection: 'column', gap: '4px',
                    }}>
                        <div style={{ fontSize: '20px' }}>{stat.icon}</div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Search pages, tags…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        flex: '1 1 200px', maxWidth: '320px',
                        padding: '9px 14px', borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-color)', fontSize: '13px',
                    }}
                />
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    style={{
                        padding: '9px 14px', borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(15,23,42,0.97)',
                        color: 'var(--text-color)', fontSize: '13px',
                    }}
                >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                        <option key={c} value={c}>{CATEGORY_META[c]?.label || c}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={loadCatalog}
                    style={{
                        padding: '9px 14px', borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'transparent', color: '#94a3b8',
                        fontSize: '13px', cursor: 'pointer',
                    }}
                >↻ Refresh</button>
                <button
                    type="button"
                    onClick={runSiteCrawl}
                    disabled={crawling}
                    style={{
                        padding: '9px 14px', borderRadius: '10px',
                        border: '1px solid rgba(251,191,36,0.4)',
                        background: 'rgba(251,191,36,0.10)', color: '#fbbf24',
                        fontSize: '13px', fontWeight: 700, cursor: crawling ? 'not-allowed' : 'pointer',
                    }}
                >
                    {crawling ? '⏳ Crawling…' : '🔍 Run Crawl'}
                </button>
                <button
                    type="button"
                    onClick={() => apiService.releaseAllFeatures().then(loadCatalog)}
                    style={{
                        padding: '9px 14px', borderRadius: '10px',
                        border: '1px solid rgba(34,197,94,0.4)',
                        background: 'rgba(34,197,94,0.10)', color: '#4ade80',
                        fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    }}
                >✅ Release All</button>
                <button
                    type="button"
                    onClick={() => {
                        if (!window.confirm('Gate ALL features? This blocks paid users until released.')) return;
                        apiService.gateAllFeatures().then(loadCatalog);
                    }}
                    style={{
                        padding: '9px 14px', borderRadius: '10px',
                        border: '1px solid rgba(248,113,113,0.4)',
                        background: 'rgba(248,113,113,0.10)', color: '#f87171',
                        fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    }}
                >🔒 Gate All</button>
            </div>

            {/* Component availability matrix */}
            <div style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                overflow: 'hidden'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'linear-gradient(90deg, rgba(56,189,248,0.12), rgba(56,189,248,0.02))'
                }}>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#e2e8f0' }}>
                            🎚️ Component / Service Availability
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                            Full = all features available · Partial = teaser mode · Off = subscription lock / misconduct lock
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={loadCompartmentAvailability}
                        disabled={loadingCompartments}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '9px',
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: '#94a3b8',
                            cursor: loadingCompartments ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 700
                        }}
                    >
                        {loadingCompartments ? 'Loading…' : '↻ Refresh Matrix'}
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', fontSize: '11px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 14px' }}>
                                    Component / Service / Part
                                </th>
                                <th style={{ textAlign: 'left', fontSize: '11px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 14px' }}>
                                    Availability (choose one)
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingCompartments && (
                                <tr>
                                    <td colSpan={2} style={{ padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
                                        Loading component availability…
                                    </td>
                                </tr>
                            )}
                            {!loadingCompartments && compartments.length === 0 && (
                                <tr>
                                    <td colSpan={2} style={{ padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
                                        No components found.
                                    </td>
                                </tr>
                            )}
                            {!loadingCompartments && compartments.map((item) => {
                                const currentMode = String(item?.availabilityMode || '').trim().toLowerCase() || (item?.isLocked ? 'off' : 'full');
                                const savingMode = availabilitySaving[item.key];
                                const isBusy = Boolean(savingMode);
                                return (
                                    <tr key={item.key} style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                                        <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>{item.name}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{item.description}</div>
                                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' }}>
                                                {item.key} · {item.endpointCount || 0} endpoint{item.endpointCount === 1 ? '' : 's'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                {[
                                                    { value: 'full', label: 'Full' },
                                                    { value: 'partial', label: 'Partial' },
                                                    { value: 'off', label: 'Off' }
                                                ].map((option) => (
                                                    <label key={option.value} style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '5px 9px',
                                                        borderRadius: '999px',
                                                        border: currentMode === option.value
                                                            ? '1px solid rgba(99,102,241,0.55)'
                                                            : '1px solid rgba(148,163,184,0.25)',
                                                        background: currentMode === option.value
                                                            ? 'rgba(99,102,241,0.18)'
                                                            : 'rgba(15,23,42,0.4)',
                                                        fontSize: '12px',
                                                        color: '#cbd5e1',
                                                        cursor: isBusy ? 'not-allowed' : 'pointer'
                                                    }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={currentMode === option.value}
                                                            disabled={isBusy}
                                                            onChange={() => setCompartmentAvailability(item.key, option.value)}
                                                            style={{ margin: 0 }}
                                                        />
                                                        {option.label}
                                                    </label>
                                                ))}
                                            </div>
                                            {isBusy && (
                                                <div style={{ marginTop: '6px', fontSize: '11px', color: '#93c5fd' }}>
                                                    Updating to {savingMode}…
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Page grid by category */}
            {Object.entries(pagesByCategory).map(([category, pages]) => {
                const meta = CATEGORY_META[category] || { label: category, icon: '📦', color: '#94a3b8' };
                const bulkState = categoryBulkLoading[category];
                const categoryHasGateable = pages.some((p) => PAGE_FEATURE_KEY_MAP[p.id]);

                return (
                    <div key={category} style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '18px', overflow: 'hidden',
                    }}>
                        {/* Category header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '14px 20px',
                            borderBottom: '1px solid var(--border-color)',
                            background: `linear-gradient(90deg, ${meta.color}10 0%, transparent 80%)`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '20px' }}>{meta.icon}</span>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '14px' }}>{meta.label}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                        {pages.length} page{pages.length !== 1 ? 's' : ''} ·{' '}
                                        {pages.filter((p) => {
                                            const k = PAGE_FEATURE_KEY_MAP[p.id];
                                            return k ? featureStatusMap[k] === 'released' : !ADMIN_ONLY_PAGES.has(p.id);
                                        }).length} live
                                    </div>
                                </div>
                            </div>
                            {categoryHasGateable && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => releaseCategoryAll(category)}
                                        disabled={Boolean(bulkState)}
                                        style={{
                                            fontSize: '11px', fontWeight: 700,
                                            padding: '5px 12px', borderRadius: '8px',
                                            border: '1px solid rgba(34,197,94,0.4)',
                                            background: 'rgba(34,197,94,0.10)', color: '#4ade80',
                                            cursor: bulkState ? 'not-allowed' : 'pointer',
                                        }}
                                    >{bulkState === 'releasing' ? '…' : '✅ Release All'}</button>
                                    <button
                                        type="button"
                                        onClick={() => gateCategoryAll(category)}
                                        disabled={Boolean(bulkState)}
                                        style={{
                                            fontSize: '11px', fontWeight: 700,
                                            padding: '5px 12px', borderRadius: '8px',
                                            border: '1px solid rgba(248,113,113,0.4)',
                                            background: 'rgba(248,113,113,0.10)', color: '#f87171',
                                            cursor: bulkState ? 'not-allowed' : 'pointer',
                                        }}
                                    >{bulkState === 'gating' ? '…' : '🔒 Gate All'}</button>
                                </div>
                            )}
                        </div>

                        {/* Page tiles */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '12px', padding: '16px',
                        }}>
                            {pages.map((page) => {
                                const featureKey = PAGE_FEATURE_KEY_MAP[page.id];
                                const isAdminOnly = ADMIN_ONLY_PAGES.has(page.id);
                                const isGated = featureKey
                                    ? featureStatusMap[featureKey] === 'gated'
                                    : isAdminOnly;
                                const busy = actionLoading[page.id];
                                const connCount = connectionCount[page.id] || 0;

                                return (
                                    <div
                                        key={page.id}
                                        style={{
                                            borderRadius: '14px',
                                            border: isGated
                                                ? '1px solid rgba(248,113,113,0.18)'
                                                : '1px solid rgba(34,197,94,0.2)',
                                            background: isGated
                                                ? 'rgba(248,113,113,0.04)'
                                                : 'rgba(34,197,94,0.03)',
                                            padding: '14px',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0' }}>
                                                        {page.label}
                                                    </span>
                                                    <GateBadge gated={isGated} adminOnly={isAdminOnly && !featureKey} />
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginBottom: '6px' }}>
                                                    /{page.id}
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {connCount > 0 && (
                                                        <span style={{ fontSize: '11px', color: '#60a5fa' }}>
                                                            🔗 {connCount} connections
                                                        </span>
                                                    )}
                                                    {(page.tags || []).slice(0, 3).map((tag) => (
                                                        <span key={tag} style={{
                                                            fontSize: '10px', padding: '1px 7px', borderRadius: '999px',
                                                            background: 'rgba(255,255,255,0.05)',
                                                            border: '1px solid rgba(255,255,255,0.08)',
                                                            color: '#64748b',
                                                        }}>{tag}</span>
                                                    ))}
                                                </div>
                                                {featureKey && (
                                                    <div style={{ fontSize: '10px', color: '#475569', marginTop: '6px', fontFamily: 'monospace' }}>
                                                        flag: {featureKey}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                            {featureKey ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => releaseFeature(featureKey, page.id)}
                                                        disabled={Boolean(busy) || !isGated}
                                                        style={{
                                                            flex: 1, fontSize: '12px', fontWeight: 700,
                                                            padding: '7px 10px', borderRadius: '8px',
                                                            border: '1px solid rgba(34,197,94,0.4)',
                                                            background: !isGated ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.10)',
                                                            color: '#4ade80',
                                                            cursor: (!isGated || busy) ? 'not-allowed' : 'pointer',
                                                            opacity: !isGated ? 0.5 : 1,
                                                        }}
                                                    >{busy === 'releasing' ? '…' : '✅ Activate'}</button>
                                                    <button
                                                        type="button"
                                                        onClick={() => gateFeature(featureKey, page.id)}
                                                        disabled={Boolean(busy) || isGated}
                                                        style={{
                                                            flex: 1, fontSize: '12px', fontWeight: 700,
                                                            padding: '7px 10px', borderRadius: '8px',
                                                            border: '1px solid rgba(248,113,113,0.4)',
                                                            background: isGated ? 'rgba(248,113,113,0.25)' : 'rgba(248,113,113,0.10)',
                                                            color: '#f87171',
                                                            cursor: (isGated || busy) ? 'not-allowed' : 'pointer',
                                                            opacity: isGated ? 0.5 : 1,
                                                        }}
                                                    >{busy === 'gating' ? '…' : '🔒 Gate'}</button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => onNavigate && onNavigate(page.id)}
                                                    style={{
                                                        flex: 1, fontSize: '12px', fontWeight: 600,
                                                        padding: '7px 10px', borderRadius: '8px',
                                                        border: '1px solid rgba(129,140,248,0.35)',
                                                        background: 'rgba(129,140,248,0.08)',
                                                        color: '#a5b4fc', cursor: 'pointer',
                                                    }}
                                                >↗ Open Page</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* Help callout */}
            <div style={{
                background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.18)',
                borderRadius: '14px', padding: '16px',
            }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#c4b5fd', marginBottom: '8px' }}>
                    ℹ️ How Site Map Control works
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', display: 'grid', gap: '5px' }}>
                    <div><strong style={{ color: '#e2e8f0' }}>Activate</strong> — removes the gate flag. Users whose Stripe tier covers the feature gain immediate access.</div>
                    <div><strong style={{ color: '#e2e8f0' }}>Gate</strong> — applies an admin lock. All users (including paid) are blocked until re-activated.</div>
                    <div><strong style={{ color: '#e2e8f0' }}>Admin Only</strong> — page is wired to admin role check in the app router. Not controlled by feature flags.</div>
                    <div><strong style={{ color: '#e2e8f0' }}>Run Crawl</strong> — launches the site audit crawler to refresh page connectivity data and health metrics.</div>
                    <div><strong style={{ color: '#e2e8f0' }}>Connections</strong> — number of page relationships in the site graph (from pageMapService + crawler). Higher = more discoverable.</div>
                </div>
            </div>
        </div>
    );
};

/* ─── Services Agent tab ──────────────────────────────────────────────── */

const ServicesAgentTab = () => {
    const { addToast } = useNotification();
    const [diagnostics, setDiagnostics] = useState(null);
    const [botLogs, setBotLogs] = useState(null);
    const [loading, setLoading] = useState(true);
    const [logsLoading, setLogsLoading] = useState(false);

    const loadDiagnostics = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiService.getIpPublishingAgentDiagnostics();
            setDiagnostics(res.data);
        } catch (err) {
            const msg = err?.response?.data?.message || err?.message || '';
            if (err?.response?.status !== 404) {
                addToast(msg || 'Could not load agent diagnostics.', 'warning');
            }
            setDiagnostics(null);
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    const loadBotLogs = async () => {
        setLogsLoading(true);
        try {
            const res = await apiService.getIpBotLogs();
            setBotLogs(res.data);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Could not load bot logs.', 'warning');
        } finally {
            setLogsLoading(false);
        }
    };

    useEffect(() => { loadDiagnostics(); }, [loadDiagnostics]);

    const agentServices = [
        { name: 'Copyright Filing Agent',   icon: '©️',  desc: 'Files SR/PA/TX/Combined forms with the U.S. Copyright Office. 50% markup.', status: 'Active', endpoint: '/api/copyright-filing' },
        { name: 'Trademark Filing Agent',   icon: '™️',  desc: 'Files TX/VI/SR/Combined marks with USPTO. 50% markup ($375–$750).', status: 'Active', endpoint: '/api/podcast-trademark-filing' },
        { name: 'IP Publishing Agent',      icon: '🤖',  desc: 'Orchestrates form generation, browser submission, and status polling.', status: diagnostics ? 'Online' : 'Checking…', endpoint: '/api/ip-publishing-agent' },
        { name: 'Form Automation Bot',      icon: '🌐',  desc: 'Playwright-based portal automation for eCO and TEAS+ submission.', status: diagnostics ? 'Online' : 'Checking…', endpoint: '/api/ip-publishing-agent/bot/logs' },
        { name: 'Background Polling',       icon: '⏱️',  desc: 'Runs every 5 minutes. Tracks filing status, office actions, certificates.', status: 'Running', endpoint: null },
        { name: 'Email Monitor (IMAP)',     icon: '📧',  desc: 'Watches for CO/USPTO notification emails. Extracts registration numbers.', status: 'Pending Setup', endpoint: null },
    ];

    return (
        <div style={{ display: 'grid', gap: '20px' }}>

            {/* Services overview */}
            <div style={{
                background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                borderRadius: '18px', padding: '20px',
            }}>
                <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '15px', marginBottom: '16px' }}>
                    🤖 Deployed Services
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {agentServices.map((svc) => (
                        <div key={svc.name} style={{
                            borderRadius: '14px',
                            border: svc.status === 'Active' || svc.status === 'Online' || svc.status === 'Running'
                                ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(248,113,113,0.2)',
                            background: svc.status === 'Active' || svc.status === 'Online' || svc.status === 'Running'
                                ? 'rgba(34,197,94,0.04)' : 'rgba(248,113,113,0.04)',
                            padding: '14px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ fontSize: '18px' }}>{svc.icon}</span>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#e2e8f0' }}>{svc.name}</span>
                                <span style={{
                                    fontSize: '10px', fontWeight: 700, padding: '2px 7px',
                                    borderRadius: '999px',
                                    background: (svc.status === 'Active' || svc.status === 'Running' || svc.status === 'Online')
                                        ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)',
                                    color: (svc.status === 'Active' || svc.status === 'Running' || svc.status === 'Online')
                                        ? '#4ade80' : '#f87171',
                                }}>{svc.status}</span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>{svc.desc}</div>
                            {svc.endpoint && (
                                <div style={{ fontSize: '10px', color: '#475569', marginTop: '6px', fontFamily: 'monospace' }}>
                                    {svc.endpoint}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Diagnostics panel */}
            <div style={{
                background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                borderRadius: '18px', padding: '20px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '15px' }}>📡 Agent Diagnostics</div>
                    <button
                        type="button"
                        onClick={loadDiagnostics}
                        disabled={loading}
                        style={{
                            padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                            border: '1px solid var(--border-color)', background: 'transparent',
                            color: '#94a3b8', cursor: 'pointer',
                        }}
                    >{loading ? '⏳' : '↻ Refresh'}</button>
                </div>
                {loading ? (
                    <div style={{ color: '#94a3b8', fontSize: '13px' }}>Loading diagnostics…</div>
                ) : diagnostics ? (
                    <pre style={{
                        background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '14px',
                        fontSize: '11px', color: '#94a3b8', overflowX: 'auto', margin: 0,
                        fontFamily: 'monospace', lineHeight: 1.6,
                    }}>
                        {JSON.stringify(diagnostics, null, 2)}
                    </pre>
                ) : (
                    <div style={{
                        color: '#64748b', fontSize: '13px',
                        padding: '24px', textAlign: 'center',
                        border: '1px dashed rgba(100,116,139,0.3)', borderRadius: '10px',
                    }}>
                        Agent diagnostics endpoint not yet responding.<br />
                        <span style={{ fontSize: '11px' }}>
                            Ensure IPPublishingAgentController is registered and the database is migrated.
                        </span>
                    </div>
                )}
            </div>

            {/* Bot logs */}
            <div style={{
                background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                borderRadius: '18px', padding: '20px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '15px' }}>🪲 Bot Execution Logs</div>
                    <button
                        type="button"
                        onClick={loadBotLogs}
                        disabled={logsLoading}
                        style={{
                            padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                            border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.08)',
                            color: '#fbbf24', cursor: 'pointer', fontWeight: 700,
                        }}
                    >{logsLoading ? '⏳ Loading…' : '📋 Load Bot Logs'}</button>
                </div>
                {botLogs ? (
                    <pre style={{
                        background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '14px',
                        fontSize: '11px', color: '#94a3b8', overflowX: 'auto', margin: 0,
                        fontFamily: 'monospace', lineHeight: 1.6, maxHeight: '300px', overflowY: 'auto',
                    }}>
                        {JSON.stringify(botLogs, null, 2)}
                    </pre>
                ) : (
                    <div style={{ color: '#64748b', fontSize: '12px' }}>
                        Click "Load Bot Logs" to fetch execution history from the IP Form Automation Bot.
                    </div>
                )}
            </div>

            {/* Pricing guide */}
            <div style={{
                background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: '14px', padding: '16px',
            }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#c4b5fd', marginBottom: '10px' }}>
                    💰 Wiseravenshare IP Services — Revenue Model
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    {[
                        { service: 'Copyright SR/PA/TX', gov: '$45–65', user: '$67.50–97.50', margin: '$22.50–32.50' },
                        { service: 'Trademark (TX/VI)',  gov: '$250–350', user: '$375–525', margin: '$125–175' },
                        { service: 'Trademark SR',       gov: '$400',    user: '$600',       margin: '$200' },
                        { service: 'Combined Pkg',       gov: '$500+',   user: '$750+',      margin: '$250+' },
                    ].map((row) => (
                        <div key={row.service} style={{
                            background: 'rgba(139,92,246,0.08)', borderRadius: '10px', padding: '12px',
                            border: '1px solid rgba(139,92,246,0.18)',
                        }}>
                            <div style={{ fontWeight: 700, fontSize: '12px', color: '#e2e8f0', marginBottom: '6px' }}>{row.service}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Gov fee: <span style={{ color: '#f87171' }}>{row.gov}</span></div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>User pays: <span style={{ color: '#4ade80' }}>{row.user}</span></div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Our margin: <span style={{ color: '#a78bfa', fontWeight: 700 }}>{row.margin}</span></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

/* ─── Main AdminPanelPage ────────────────────────────────────────────── */

const AdminPanelPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('sitemap');

    const adminEmail = useMemo(() => {
        const fromEnv = String(import.meta.env.VITE_ADMIN_EMAILS || '')
            .split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
        return new Set(['admin@wise-ravens.com', ...fromEnv]);
    }, []);

    const isAdmin = useMemo(() => {
        const email = String(user?.email || '').trim().toLowerCase();
        return email.length > 0 && adminEmail.has(email);
    }, [adminEmail, user?.email]);

    if (!isAdmin) {
        return (
            <div style={{
                padding: '48px', textAlign: 'center',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: '18px',
                background: 'rgba(248,113,113,0.05)',
                color: '#f87171',
            }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛡️</div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>Admin Access Required</div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                    You must be signed in with an admin account to access this panel.
                </div>
            </div>
        );
    }

    const activeTabMeta = TABS.find((t) => t.id === activeTab);

    return (
        <div style={{ display: 'grid', gap: '20px', padding: '4px' }}>

            {/* Page header */}
            <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c4b5fd', fontWeight: 700 }}>
                    Admin Panel
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#e2e8f0', marginTop: '4px' }}>
                    🛡️ Wiseravenshare Control Center
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                    {activeTabMeta?.desc || 'Manage all site functions, gates, teams, and services from one place.'}
                </div>
            </div>

            {/* Tab bar */}
            <TabBar active={activeTab} onChange={setActiveTab} />

            {/* Tab content */}
            {activeTab === 'sitemap' && (
                <SiteMapTab onNavigate={onNavigate} />
            )}

            {activeTab === 'features' && (
                <FeatureReleaseAdminPage />
            )}

            {activeTab === 'team' && (
                <TeamAccessAdminPage />
            )}

            {activeTab === 'revenue' && (
                <RevenueConsolePage />
            )}

            {activeTab === 'crawler' && (
                <div style={{ display: 'grid', gap: '24px' }}>
                    <SiteCrawlerDashboardPage />
                    <div style={{
                        borderTop: '1px solid var(--border-color)',
                        paddingTop: '24px',
                    }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', marginBottom: '16px' }}>
                            📈 Crawler Metrics & Insights
                        </div>
                        <CrawlerMetricsInsightsPage />
                    </div>
                </div>
            )}

            {activeTab === 'agent' && (
                <ServicesAgentTab />
            )}
        </div>
    );
};

export default AdminPanelPage;
