import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiService } from '../Services/api';
import { useNotification } from '../Contexts/NotificationContext';
import { useAuth } from '../Contexts/AuthContext';

const TIER_COLORS = {
    'free':          { bg: 'rgba(100,116,139,0.14)', border: 'rgba(100,116,139,0.35)', text: '#94a3b8',  label: 'Free' },
    'creator-pro':   { bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.35)',  text: '#38bdf8',  label: 'Creator Pro' },
    'growth-suite':  { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)',  text: '#34d399',  label: 'Growth Suite' },
    'studio-plus':   { bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.35)',  text: '#a78bfa',  label: 'Studio Plus' },
    'podcast-pro':   { bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.35)',   text: '#fde68a',  label: 'Podcast Pro' },
    'copy-standard': { bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.35)',  text: '#fb923c',  label: 'Copy Standard' },
    'copy-pro':      { bg: 'rgba(236,72,153,0.12)',  border: 'rgba(236,72,153,0.35)',  text: '#f472b6',  label: 'Copy Pro' },
    'admin':         { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   text: '#f87171',  label: 'Admin' },
};

const CATEGORY_ICONS = {
    'Podcast Studio': '🎙️',
    'Copywriting':    '✍️',
    'Core Platform':  '🏗️',
};

function TierBadge({ tier }) {
    const style = TIER_COLORS[tier] || TIER_COLORS['free'];
    return (
        <span style={{
            fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em',
            textTransform: 'uppercase', padding: '2px 8px', borderRadius: '999px',
            background: style.bg, border: `1px solid ${style.border}`, color: style.text,
            whiteSpace: 'nowrap'
        }}>
            {style.label}
        </span>
    );
}

function StatusBadge({ status }) {
    const isReleased = status === 'released';
    return (
        <span style={{
            fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em',
            textTransform: 'uppercase', padding: '2px 8px', borderRadius: '999px',
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: isReleased ? 'rgba(34,197,94,0.12)' : 'rgba(248,113,113,0.12)',
            border: isReleased ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(248,113,113,0.3)',
            color: isReleased ? '#4ade80' : '#f87171'
        }}>
            <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: isReleased ? '#4ade80' : '#f87171', display: 'inline-block'
            }} />
            {isReleased ? 'Released' : 'Gated'}
        </span>
    );
}

const FeatureReleaseAdminPage = () => {
    const { user } = useAuth();
    const { addToast } = useNotification();

    const [catalog, setCatalog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});
    const [bulkLoading, setBulkLoading] = useState(false);
    const [overrideLoading, setOverrideLoading] = useState({});
    const [selectedUserByFeature, setSelectedUserByFeature] = useState({});
    const [adminUsers, setAdminUsers] = useState([]);
    const [billingCycle, setBillingCycle] = useState('monthly');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [catalogRes, usersRes] = await Promise.all([
                apiService.getFeatureReleaseCatalog(),
                apiService.getAdminUsers({ page: 1, pageSize: 200 })
            ]);
            setCatalog(catalogRes.data);
            setAdminUsers(Array.isArray(usersRes?.data?.items) ? usersRes.data.items : []);
        } catch (err) {
            addToast(err?.response?.data?.message || err?.message || 'Unable to load feature catalog.', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { load(); }, [load]);

    const releaseFeature = async (key) => {
        setActionLoading((prev) => ({ ...prev, [key]: 'releasing' }));
        try {
            await apiService.releaseFeature(key);
            addToast(`Feature "${key}" released.`, 'success');
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || `Failed to release "${key}".`, 'error');
        } finally {
            setActionLoading((prev) => { const n = { ...prev }; delete n[key]; return n; });
        }
    };

    const gateFeature = async (key) => {
        setActionLoading((prev) => ({ ...prev, [key]: 'gating' }));
        try {
            await apiService.gateFeature(key);
            addToast(`Feature "${key}" gated.`, 'info');
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || `Failed to gate "${key}".`, 'error');
        } finally {
            setActionLoading((prev) => { const n = { ...prev }; delete n[key]; return n; });
        }
    };

    const releaseAll = async () => {
        setBulkLoading(true);
        try {
            const res = await apiService.releaseAllFeatures();
            addToast(res.data?.message || `Released all features.`, 'success');
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to release all features.', 'error');
        } finally {
            setBulkLoading(false);
        }
    };

    const gateAll = async () => {
        if (!window.confirm('Gate ALL features? This will block access for all non-admin users until released individually.')) return;
        setBulkLoading(true);
        try {
            const res = await apiService.gateAllFeatures();
            addToast(res.data?.message || `Gated all features.`, 'info');
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to gate all features.', 'error');
        } finally {
            setBulkLoading(false);
        }
    };

    const featuresByCategory = useMemo(() => {
        if (!catalog?.features) return {};
        return catalog.features.reduce((acc, f) => {
            const cat = f.category || 'Other';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(f);
            return acc;
        }, {});
    }, [catalog]);

    const pricingByCategory = useMemo(() => {
        if (!catalog?.pricingPlans) return {};
        return catalog.pricingPlans.reduce((acc, p) => {
            const cat = p.category || 'Other';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(p);
            return acc;
        }, {});
    }, [catalog]);

    if (loading) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--light-color)' }}>
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
                Loading feature catalog...
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '24px', padding: '4px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c4b5fd', fontWeight: 700 }}>
                        Admin Panel
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#e2e8f0', marginTop: '4px' }}>
                        🎛️ Feature Release Console
                    </div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                        Release globally, then grant or block specific users per feature.
                        {catalog && (
                            <span style={{ marginLeft: '12px', color: '#a5b4fc' }}>
                                {catalog.releasedCount} released · {catalog.gatedCount} gated
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading || bulkLoading}
                        style={{
                            border: '1px solid var(--border-color)', background: 'transparent',
                            color: 'var(--text-color)', borderRadius: '10px',
                            padding: '9px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '13px'
                        }}
                    >
                        ↻ Refresh
                    </button>
                    <button
                        type="button"
                        onClick={releaseAll}
                        disabled={bulkLoading}
                        style={{
                            border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.12)',
                            color: '#4ade80', borderRadius: '10px',
                            padding: '9px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '13px'
                        }}
                    >
                        {bulkLoading ? '...' : '✅ Release All'}
                    </button>
                    <button
                        type="button"
                        onClick={gateAll}
                        disabled={bulkLoading}
                        style={{
                            border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.12)',
                            color: '#f87171', borderRadius: '10px',
                            padding: '9px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '13px'
                        }}
                    >
                        {bulkLoading ? '...' : '🔒 Gate All'}
                    </button>
                </div>
            </div>

            {/* Pricing Tiers */}
            {catalog?.pricingPlans && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(15,23,42,0.97), rgba(30,15,55,0.92))',
                    border: '1px solid rgba(129,140,248,0.25)', borderRadius: '20px', padding: '22px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                            💰 Pricing Tiers
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['monthly', 'annual'].map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setBillingCycle(c)}
                                    style={{
                                        border: billingCycle === c ? '1px solid rgba(129,140,248,0.5)' : '1px solid var(--border-color)',
                                        background: billingCycle === c ? 'rgba(129,140,248,0.18)' : 'transparent',
                                        color: billingCycle === c ? '#a5b4fc' : 'var(--light-color)',
                                        borderRadius: '8px', padding: '5px 12px', cursor: 'pointer',
                                        fontSize: '12px', fontWeight: billingCycle === c ? 700 : 400
                                    }}
                                >
                                    {c === 'monthly' ? 'Monthly' : 'Annual (save ~17%)'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {Object.entries(pricingByCategory).map(([cat, plans]) => (
                        <div key={cat} style={{ marginBottom: '18px' }}>
                            <div style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginBottom: '10px' }}>
                                {CATEGORY_ICONS[cat] || '📦'} {cat}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px' }}>
                                {plans.map((plan) => {
                                    const price = billingCycle === 'monthly' ? plan.monthlyPriceCents : plan.annualPriceCents;
                                    const priceStr = price === 0 ? 'Free' : `$${(price / 100).toFixed(0)}`;
                                    const period = price === 0 ? '' : billingCycle === 'monthly' ? '/mo' : '/yr';
                                    const style = TIER_COLORS[plan.id] || TIER_COLORS['free'];
                                    return (
                                        <div key={plan.id} style={{
                                            background: style.bg, border: `1px solid ${style.border}`,
                                            borderRadius: '12px', padding: '14px'
                                        }}>
                                            <div style={{ fontSize: '16px', fontWeight: 800, color: style.text }}>
                                                {priceStr}<span style={{ fontSize: '12px', fontWeight: 400, opacity: 0.8 }}>{period}</span>
                                            </div>
                                            <div style={{ fontWeight: 700, color: '#e2e8f0', marginTop: '4px', fontSize: '13px' }}>{plan.name}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', lineHeight: 1.4 }}>{plan.tagline}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Feature Groups */}
            {Object.entries(featuresByCategory).map(([category, features]) => (
                <div key={category} style={{
                    background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                    borderRadius: '20px', padding: '22px'
                }}>
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                            {CATEGORY_ICONS[category] || '📦'} {category}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            {features.length} feature{features.length !== 1 ? 's' : ''} in this group ·{' '}
                            {features.filter((f) => f.status === 'released').length} released ·{' '}
                            {features.filter((f) => f.status === 'gated').length} gated
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '10px' }}>
                        {features.map((feature) => {
                            const busy = actionLoading[feature.key];
                            const selectedUserId = selectedUserByFeature[feature.key] || '';
                            const userOverrideBusy = overrideLoading[feature.key];

                            const grantToUser = async () => {
                                if (!selectedUserId) {
                                    addToast('Select a user first.', 'error');
                                    return;
                                }

                                const reason = window.prompt(`Optional reason for granting ${feature.name} to this user:`, '') || '';
                                setOverrideLoading((prev) => ({ ...prev, [feature.key]: 'granting' }));
                                try {
                                    await apiService.grantFeatureToUser(feature.key, selectedUserId, reason);
                                    addToast(`Granted ${feature.name} to selected user.`, 'success');
                                    await load();
                                } catch (err) {
                                    addToast(err?.response?.data?.message || `Failed to grant ${feature.name} to user.`, 'error');
                                } finally {
                                    setOverrideLoading((prev) => {
                                        const next = { ...prev };
                                        delete next[feature.key];
                                        return next;
                                    });
                                }
                            };

                            const blockForUser = async () => {
                                if (!selectedUserId) {
                                    addToast('Select a user first.', 'error');
                                    return;
                                }

                                const reason = window.prompt(`Optional reason for blocking ${feature.name} for this user:`, '') || '';
                                setOverrideLoading((prev) => ({ ...prev, [feature.key]: 'blocking' }));
                                try {
                                    await apiService.blockFeatureForUser(feature.key, selectedUserId, reason);
                                    addToast(`Blocked ${feature.name} for selected user.`, 'info');
                                    await load();
                                } catch (err) {
                                    addToast(err?.response?.data?.message || `Failed to block ${feature.name} for user.`, 'error');
                                } finally {
                                    setOverrideLoading((prev) => {
                                        const next = { ...prev };
                                        delete next[feature.key];
                                        return next;
                                    });
                                }
                            };

                            const clearUserOverride = async () => {
                                if (!selectedUserId) {
                                    addToast('Select a user first.', 'error');
                                    return;
                                }

                                setOverrideLoading((prev) => ({ ...prev, [feature.key]: 'clearing' }));
                                try {
                                    await apiService.clearFeatureUserOverride(feature.key, selectedUserId);
                                    addToast(`Cleared user override for ${feature.name}.`, 'success');
                                    await load();
                                } catch (err) {
                                    addToast(err?.response?.data?.message || `Failed to clear override for ${feature.name}.`, 'error');
                                } finally {
                                    setOverrideLoading((prev) => {
                                        const next = { ...prev };
                                        delete next[feature.key];
                                        return next;
                                    });
                                }
                            };

                            return (
                                <div
                                    key={feature.key}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr auto',
                                        gap: '12px',
                                        alignItems: 'center',
                                        background: feature.status === 'released'
                                            ? 'rgba(34,197,94,0.04)'
                                            : 'rgba(248,113,113,0.04)',
                                        border: feature.status === 'released'
                                            ? '1px solid rgba(34,197,94,0.2)'
                                            : '1px solid rgba(248,113,113,0.18)',
                                        borderRadius: '14px',
                                        padding: '14px 16px',
                                        flexWrap: 'wrap'
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '14px' }}>
                                                {feature.name}
                                            </span>
                                            <TierBadge tier={feature.requiredTier} />
                                            <StatusBadge status={feature.status} />
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>{feature.description}</div>
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' }}>
                                            key: {feature.key}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                        <button
                                            type="button"
                                            onClick={() => releaseFeature(feature.key)}
                                            disabled={Boolean(busy) || feature.status === 'released'}
                                            style={{
                                                border: '1px solid rgba(34,197,94,0.4)',
                                                background: feature.status === 'released' ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.10)',
                                                color: '#4ade80', borderRadius: '8px',
                                                padding: '7px 14px', cursor: feature.status === 'released' || busy ? 'not-allowed' : 'pointer',
                                                fontWeight: 700, fontSize: '12px',
                                                opacity: feature.status === 'released' ? 0.55 : 1,
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {busy === 'releasing' ? '...' : '✅ Release'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => gateFeature(feature.key)}
                                            disabled={Boolean(busy) || feature.status === 'gated'}
                                            style={{
                                                border: '1px solid rgba(248,113,113,0.4)',
                                                background: feature.status === 'gated' ? 'rgba(248,113,113,0.25)' : 'rgba(248,113,113,0.10)',
                                                color: '#f87171', borderRadius: '8px',
                                                padding: '7px 14px', cursor: feature.status === 'gated' || busy ? 'not-allowed' : 'pointer',
                                                fontWeight: 700, fontSize: '12px',
                                                opacity: feature.status === 'gated' ? 0.55 : 1,
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {busy === 'gating' ? '...' : '🔒 Gate'}
                                        </button>
                                    </div>

                                    <div style={{ gridColumn: '1 / -1', marginTop: '6px', paddingTop: '10px', borderTop: '1px dashed rgba(148,163,184,0.22)' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                            User-specific release override
                                        </div>
                                        <div style={{ display: 'grid', gap: '8px' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                                <select
                                                    value={selectedUserId}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        setSelectedUserByFeature((prev) => ({ ...prev, [feature.key]: value }));
                                                    }}
                                                    style={{
                                                        minWidth: '240px',
                                                        background: 'rgba(15,23,42,0.9)',
                                                        border: '1px solid rgba(148,163,184,0.35)',
                                                        color: '#e2e8f0',
                                                        borderRadius: '8px',
                                                        fontSize: '12px',
                                                        padding: '7px 10px'
                                                    }}
                                                >
                                                    <option value="">Select user</option>
                                                    {adminUsers.map((candidate) => (
                                                        <option key={candidate.id} value={candidate.id}>
                                                            {candidate.name} ({candidate.email})
                                                        </option>
                                                    ))}
                                                </select>

                                                <button
                                                    type="button"
                                                    onClick={grantToUser}
                                                    disabled={!selectedUserId || Boolean(userOverrideBusy)}
                                                    style={{
                                                        border: '1px solid rgba(34,197,94,0.4)',
                                                        background: 'rgba(34,197,94,0.10)',
                                                        color: '#4ade80',
                                                        borderRadius: '8px',
                                                        padding: '6px 12px',
                                                        fontWeight: 700,
                                                        fontSize: '11px',
                                                        cursor: !selectedUserId || userOverrideBusy ? 'not-allowed' : 'pointer',
                                                        opacity: !selectedUserId || userOverrideBusy ? 0.6 : 1
                                                    }}
                                                >
                                                    {userOverrideBusy === 'granting' ? '...' : 'Grant User'}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={blockForUser}
                                                    disabled={!selectedUserId || Boolean(userOverrideBusy)}
                                                    style={{
                                                        border: '1px solid rgba(248,113,113,0.4)',
                                                        background: 'rgba(248,113,113,0.10)',
                                                        color: '#f87171',
                                                        borderRadius: '8px',
                                                        padding: '6px 12px',
                                                        fontWeight: 700,
                                                        fontSize: '11px',
                                                        cursor: !selectedUserId || userOverrideBusy ? 'not-allowed' : 'pointer',
                                                        opacity: !selectedUserId || userOverrideBusy ? 0.6 : 1
                                                    }}
                                                >
                                                    {userOverrideBusy === 'blocking' ? '...' : 'Block User'}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={clearUserOverride}
                                                    disabled={!selectedUserId || Boolean(userOverrideBusy)}
                                                    style={{
                                                        border: '1px solid rgba(148,163,184,0.4)',
                                                        background: 'rgba(148,163,184,0.08)',
                                                        color: '#cbd5e1',
                                                        borderRadius: '8px',
                                                        padding: '6px 12px',
                                                        fontWeight: 700,
                                                        fontSize: '11px',
                                                        cursor: !selectedUserId || userOverrideBusy ? 'not-allowed' : 'pointer',
                                                        opacity: !selectedUserId || userOverrideBusy ? 0.6 : 1
                                                    }}
                                                >
                                                    {userOverrideBusy === 'clearing' ? '...' : 'Clear Override'}
                                                </button>
                                            </div>

                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                Active user overrides: {feature.userGrantCount || 0} grants · {feature.userBlockCount || 0} blocks
                                            </div>

                                            {Array.isArray(feature.userOverrides) && feature.userOverrides.length > 0 ? (
                                                <div style={{ display: 'grid', gap: '6px' }}>
                                                    {feature.userOverrides.slice(0, 6).map((entry) => (
                                                        <div
                                                            key={`${feature.key}-${entry.userId}-${entry.state}`}
                                                            style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                gap: '10px',
                                                                fontSize: '11px',
                                                                color: '#cbd5e1',
                                                                background: 'rgba(15,23,42,0.45)',
                                                                border: '1px solid rgba(148,163,184,0.18)',
                                                                borderRadius: '8px',
                                                                padding: '6px 10px'
                                                            }}
                                                        >
                                                            <span>
                                                                {entry.userEmail || entry.userId}
                                                            </span>
                                                            <span style={{
                                                                fontWeight: 700,
                                                                color: entry.state === 'enabled' ? '#4ade80' : '#f87171',
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.06em'
                                                            }}>
                                                                {entry.state === 'enabled' ? 'GRANT' : 'BLOCK'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                    No user-specific overrides yet.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Help block */}
            <div style={{
                background: 'rgba(129,140,248,0.07)', border: '1px solid rgba(129,140,248,0.18)',
                borderRadius: '14px', padding: '16px'
            }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#c4b5fd', marginBottom: '8px' }}>ℹ️ How Release / Gate works</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', display: 'grid', gap: '6px' }}>
                    <div><strong style={{ color: '#e2e8f0' }}>Release</strong> — unlocks default access for users who satisfy tier rules.</div>
                    <div><strong style={{ color: '#e2e8f0' }}>Gate</strong> — applies a global lock for maintenance or staged rollouts.</div>
                    <div><strong style={{ color: '#e2e8f0' }}>Grant User / Block User</strong> — explicit per-user override that wins over default tier and release state.</div>
                    <div><strong style={{ color: '#e2e8f0' }}>Clear Override</strong> — removes per-user override so default policy applies again.</div>
                </div>
            </div>
        </div>
    );
};

export default FeatureReleaseAdminPage;
