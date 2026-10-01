import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiCreditCard, FiExternalLink, FiLink, FiLock, FiRefreshCw, FiShare2, FiShield, FiTrendingUp } from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import { apiService } from '../Services/api';

const parseAdminEmails = () => {
    return new Set(
        String(import.meta.env.VITE_ADMIN_EMAILS || '')
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean)
    );
};

const CONNECTION_PLATFORMS = [
    { id: 'facebook', label: 'Facebook', tone: '#93c5fd', siteUrl: 'https://www.facebook.com' },
    { id: 'tiktok', label: 'TikTok', tone: '#67e8f9', siteUrl: 'https://www.tiktok.com' },
    { id: 'instagram', label: 'Instagram', tone: '#f9a8d4', siteUrl: 'https://www.instagram.com' },
    { id: 'youtube', label: 'YouTube', tone: '#f87171', siteUrl: 'https://www.youtube.com' }
];

const EMPTY_LINK_DRAFTS = {
    facebook: { username: '', profileUrl: '' },
    tiktok: { username: '', profileUrl: '' },
    instagram: { username: '', profileUrl: '' },
    youtube: { username: '', profileUrl: '' }
};

const normalizeConnectionDraft = (connection) => ({
    username: String(connection?.username || '').trim(),
    profileUrl: String(connection?.profileUrl || connection?.feedUrl || '').trim()
});

const normalizeFeedDrafts = (feeds) => ({
    facebook: normalizeConnectionDraft(feeds?.facebook || feeds?.Facebook),
    tiktok: normalizeConnectionDraft(feeds?.tikTok || feeds?.tiktok || feeds?.TikTok),
    instagram: normalizeConnectionDraft(feeds?.instagram || feeds?.Instagram),
    youtube: normalizeConnectionDraft(feeds?.youTube || feeds?.youtube || feeds?.YouTube)
});

const normalizeHttpUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const withScheme = raw.includes('://') ? raw : `https://${raw}`;
    try {
        const parsed = new URL(withScheme);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
};

const readStoredMetrics = (userId) => {
    if (!userId) {
        return null;
    }

    try {
        const raw = localStorage.getItem(`wiseProfileCumulativeMetrics:${userId}`);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const readNumber = (...values) => {
    for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return 0;
};

const readOptionalNumber = (...values) => {
    for (const value of values) {
        if (value === null || value === undefined || value === '') {
            continue;
        }

        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
};

const asArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value && Array.isArray(value.data)) {
        return value.data;
    }

    return [];
};

const sumPosts = (posts, selectors) => posts.reduce((total, post) => {
    const contribution = selectors.reduce((next, selector) => {
        const resolved = selector(post);
        return Number.isFinite(resolved) ? resolved : next;
    }, 0);
    return total + contribution;
}, 0);

const SettingsPage = ({ onNavigate, showConnections }) => {
    const { user } = useAuth();
    const { addToast } = useNotification();
    const [loading, setLoading] = useState(true);
    const [savingPlatform, setSavingPlatform] = useState('');
    const [statusByPlatform, setStatusByPlatform] = useState({});
    const [linkDrafts, setLinkDrafts] = useState(EMPTY_LINK_DRAFTS);
    const [linkSavingPlatform, setLinkSavingPlatform] = useState('');
    const [linkErrorByPlatform, setLinkErrorByPlatform] = useState({});
    const [adminMetrics, setAdminMetrics] = useState(null);
    const [error, setError] = useState('');
    const [subscription, setSubscription] = useState(null);

    const connectionsRef = React.useRef(null);

    const adminEmails = useMemo(() => parseAdminEmails(), []);
    const isAdminUser = useMemo(() => {
        const email = String(user?.email || '').trim().toLowerCase();
        return email.length > 0 && adminEmails.has(email);
    }, [adminEmails, user?.email]);

    const loadSettings = useCallback(async () => {
        if (!user?.id) {
            return;
        }

        setLoading(true);
        setError('');

        try {
            const statusResults = await Promise.allSettled(
                CONNECTION_PLATFORMS.map(async (platform) => {
                    const response = await apiService.getSocialConnectStatus(platform.id, user.id);
                    return { platform: platform.id, data: response?.data || {} };
                })
            );

            const nextStatuses = {};
            statusResults.forEach((result, index) => {
                const platform = CONNECTION_PLATFORMS[index];
                if (result.status === 'fulfilled') {
                    nextStatuses[platform.id] = result.value.data;
                    return;
                }

                nextStatuses[platform.id] = {
                    connected: false,
                    detail: result.reason?.message || 'Status unavailable'
                };
            });
            setStatusByPlatform(nextStatuses);

            try {
                const socialFeedsResponse = await apiService.getSocialFeeds(user.id);
                const socialFeeds = socialFeedsResponse?.data || socialFeedsResponse || {};
                setLinkDrafts(normalizeFeedDrafts(socialFeeds));
            } catch {
                setLinkDrafts(EMPTY_LINK_DRAFTS);
            }

            try {
                const subResponse = await apiService.getSubscriptionStatus();
                setSubscription(subResponse?.data || null);
            } catch {
                setSubscription(null);
            }

            if (!isAdminUser) {
                setAdminMetrics(null);
                return;
            }

            const [userRes, postsRes, feedRes, bookmarksRes] = await Promise.allSettled([
                apiService.getUser(user.id),
                apiService.getPosts({ userId: user.id, pageSize: 100 }),
                apiService.getPosts({ pageSize: 100 }),
                apiService.getBookmarks()
            ]);

            const userStats = userRes.status === 'fulfilled' ? userRes.value?.data || {} : {};
            const ownPosts = postsRes.status === 'fulfilled' ? asArray(postsRes.value?.data) : [];
            const feedPosts = feedRes.status === 'fulfilled' ? asArray(feedRes.value?.data) : ownPosts;
            const bookmarks = bookmarksRes.status === 'fulfilled' ? asArray(bookmarksRes.value?.data) : [];

            const followerCount = readNumber(userStats.followersCount, userStats.followers, user?.followersCount, user?.followers);
            const followingCount = readNumber(userStats.followingCount, userStats.following, user?.followingCount, user?.following);
            const previousMetrics = readStoredMetrics(user.id) || {};
            const previousFollowers = readNumber(previousMetrics.followers, followerCount);

            const likesCount = sumPosts(ownPosts, [
                (post) => readNumber(post?.likesCount, post?.likes, post?.LikesCount, post?.Likes)
            ]);
            const commentsCount = sumPosts(ownPosts, [
                (post) => readNumber(post?.commentsCount, post?.CommentsCount, Array.isArray(post?.comments) ? post.comments.length : 0)
            ]);
            const sharesCount = sumPosts(ownPosts, [
                (post) => readNumber(post?.sharesCount, post?.SharesCount, post?.shareCount, post?.ShareCount)
            ]);
            const repostsCount = sumPosts(ownPosts, [
                (post) => readNumber(post?.repostsCount, post?.RepostsCount, post?.reposts, post?.Reposts)
            ]);
            const viewsCount = sumPosts(ownPosts, [
                (post) => readNumber(post?.viewsCount, post?.ViewsCount, post?.views, post?.Views)
            ]);
            const savedCount = readNumber(bookmarks.length, userStats.bookmarksCount, userStats.savesCount);

            const feedViews = sumPosts(feedPosts, [
                (post) => readNumber(post?.viewsCount, post?.ViewsCount, post?.views, post?.Views)
            ]);
            const ownPostsCount = ownPosts.length || 1;
            const engagementCount = likesCount + commentsCount + sharesCount + repostsCount + savedCount;
            const engagementRate = viewsCount > 0 ? (engagementCount / viewsCount) * 100 : 0;
            const shareOfVoice = feedViews > 0 ? (viewsCount / feedViews) * 100 : 0;
            const followerGrowthRate = previousFollowers > 0 ? ((followerCount - previousFollowers) / previousFollowers) * 100 : 0;
            const reach = followerCount;
            const impressions = viewsCount;
            const ctr = readOptionalNumber(userStats.clickThroughRate, userStats.ctr);
            const conversionRate = readOptionalNumber(userStats.conversionRate, userStats.conversionRatePercent);
            const cpl = readOptionalNumber(userStats.costPerLead, userStats.cpl);
            const cpc = readOptionalNumber(userStats.costPerClick, userStats.cpc);
            const averageReplyTime = readOptionalNumber(userStats.averageReplyTimeMinutes, userStats.avgReplyTimeMinutes);
            const responseVolume = readNumber(userStats.responseVolume, userStats.repliesCount, commentsCount);
            const watchTimeMinutes = sumPosts(ownPosts, [
                (post) => {
                    const durationSeconds = readNumber(
                        post?.durationSeconds,
                        post?.videoDurationSeconds,
                        post?.videoLengthSeconds,
                        post?.duration,
                        post?.videoDuration
                    );
                    return durationSeconds > 0 ? (durationSeconds * readNumber(post?.viewsCount, post?.ViewsCount, post?.views, post?.Views)) / 60 : 0;
                }
            ]);
            const completionRate = readOptionalNumber(userStats.completionRate, userStats.videoCompletionRate);

            setAdminMetrics({
                followerCount,
                followingCount,
                previousFollowers,
                reach,
                impressions,
                shareOfVoice,
                followerGrowthRate,
                engagementRate,
                saves: savedCount,
                shares: sharesCount,
                comments: commentsCount,
                reposts: repostsCount,
                watchTimeMinutes,
                completionRate,
                ctr,
                conversionRate,
                cpl,
                cpc,
                averageReplyTime,
                responseVolume
            });

            try {
                localStorage.setItem(`wiseProfileCumulativeMetrics:${user.id}`, JSON.stringify({
                    ...previousMetrics,
                    followers: Math.max(previousFollowers, followerCount),
                    following: Math.max(readNumber(previousMetrics.following, followingCount), followingCount)
                }));
            } catch {
                // Best effort only.
            }
        } catch (loadError) {
            setError(loadError?.message || 'Unable to load settings.');
        } finally {
            setLoading(false);
        }
    }, [isAdminUser, user?.id, user?.followersCount, user?.followingCount]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        if (showConnections && connectionsRef.current) {
            setTimeout(() => {
                connectionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [showConnections]);

    const handleConnect = (platformId) => {
        const platform = CONNECTION_PLATFORMS.find((p) => p.id === platformId);
        if (platform?.siteUrl) {
            window.open(platform.siteUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const handleLinkDraftChange = (platform, key, value) => {
        setLinkDrafts((prev) => ({
            ...prev,
            [platform]: {
                ...(prev[platform] || { username: '', profileUrl: '' }),
                [key]: value
            }
        }));
        setLinkErrorByPlatform((prev) => ({ ...prev, [platform]: '' }));
    };

    const handleSaveLink = async (platform) => {
        if (!user?.id) {
            return;
        }

        const draft = linkDrafts[platform] || { username: '', profileUrl: '' };
        const username = String(draft.username || '').trim();
        const normalizedProfileUrl = normalizeHttpUrl(draft.profileUrl);

        if (draft.profileUrl && !normalizedProfileUrl) {
            setLinkErrorByPlatform((prev) => ({ ...prev, [platform]: 'Enter a valid http(s) profile URL.' }));
            return;
        }

        if (!username && !normalizedProfileUrl) {
            setLinkErrorByPlatform((prev) => ({ ...prev, [platform]: 'Add a username or profile URL to save.' }));
            return;
        }

        const connectionPayload = {
            enabled: true,
            username,
            profileUrl: normalizedProfileUrl || '',
            feedUrl: normalizedProfileUrl || ''
        };

        const payload =
            platform === 'facebook' ? { facebook: connectionPayload } :
            platform === 'tiktok' ? { tikTok: connectionPayload } :
            platform === 'instagram' ? { instagram: connectionPayload } :
            { youTube: connectionPayload };

        setLinkSavingPlatform(platform);
        try {
            await apiService.updateSocialFeeds(user.id, payload);
            addToast(`${CONNECTION_PLATFORMS.find((item) => item.id === platform)?.label || 'Social'} link saved.`, 'success');
            setLinkErrorByPlatform((prev) => ({ ...prev, [platform]: '' }));
            await loadSettings();
        } catch (saveError) {
            setLinkErrorByPlatform((prev) => ({
                ...prev,
                [platform]: saveError?.message || 'Unable to save social link right now.'
            }));
        } finally {
            setLinkSavingPlatform('');
        }
    };

    const handleCopyLink = async (platform, url) => {
        const copyText = String(url || '').trim();
        if (!copyText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(copyText);
            addToast(`${CONNECTION_PLATFORMS.find((item) => item.id === platform)?.label || 'Social'} URL copied.`, 'success');
        } catch {
            addToast('Unable to copy the URL right now.', 'error');
        }
    };

    if (!user) {
        return (
            <div style={{
                padding: '32px 20px',
                textAlign: 'center',
                border: '1px solid var(--border-color)',
                borderRadius: '18px',
                background: 'var(--card-bg)',
                color: 'var(--light-color)'
            }}>
                Please sign in to view and manage your settings.
            </div>
        );
    }

    return (
        <div className="container" style={{ paddingTop: '20px', paddingBottom: '40px' }}>
            <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '18px',
                padding: '24px',
                background: 'linear-gradient(165deg, rgba(59,130,246,0.10) 0%, rgba(15,23,42,0.03) 100%)',
                marginBottom: '18px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '32px' }}>Settings</h1>
                        <p style={{ margin: '8px 0 0 0', color: 'var(--light-color)', maxWidth: '760px' }}>
                            Manage platform connections, syndication targets, and admin-only visibility controls from one place.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => onNavigate?.('profile')}
                        style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '999px',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)',
                            padding: '10px 16px',
                            cursor: 'pointer'
                        }}
                    >
                        Back to Profile
                    </button>
                </div>
            </div>

            {error && (
                <div style={{
                    border: '1px solid rgba(248,113,113,0.35)',
                    background: 'rgba(248,113,113,0.10)',
                    color: '#fca5a5',
                    padding: '14px 16px',
                    borderRadius: '14px',
                    marginBottom: '18px'
                }}>
                    {error}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '16px' }}>
                {/* ── Subscription & Billing ─────────────────────────────────── */}
                <section style={{
                    border: '1px solid rgba(99,102,241,0.4)',
                    borderRadius: '18px',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)',
                    padding: '18px',
                    gridColumn: '1 / -1'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <FiCreditCard style={{ color: '#818cf8' }} />
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Subscription & Billing</h2>
                    </div>
                    <p style={{ marginTop: 0, color: 'var(--light-color)', fontSize: '14px', marginBottom: '16px' }}>
                        Unlock podcast studio features, team workflows, growth analytics, and priority support.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                        {subscription?.hasActiveSubscription ? (
                            /* Active subscription banner — hide plan cards */
                            <div style={{ gridColumn: '1 / -1', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '12px', padding: '18px', background: 'rgba(34,197,94,0.08)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '28px' }}>✅</span>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '15px', color: '#86efac' }}>
                                        You&apos;re subscribed
                                        {subscription.planKey ? ` — ${
                                            subscription.planKey === 'growth_suite' ? 'WRS Growth Suite' :
                                            subscription.planKey === 'studio_plus' ? 'WRS Studio Plus' :
                                            subscription.planKey === 'podcast_pro' ? 'Podcast Pro Bundle' :
                                            subscription.planKey.replace(/_/g, ' ')
                                        }` : ''}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                        Status: <span style={{ color: '#86efac' }}>{subscription.status || 'active'}</span>
                                        {subscription.currentPeriodEnd && (
                                            <> &nbsp;·&nbsp; Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</>
                                        )}
                                        {subscription.cancelAtPeriodEnd && (
                                            <> &nbsp;·&nbsp; <span style={{ color: '#fbbf24' }}>Cancels at period end</span></>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('podcast-checkout')}
                                    style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-color)', borderRadius: '8px', padding: '9px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    Manage Billing
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Growth Suite */}
                                <div style={{ border: '1px solid rgba(99,102,241,0.3)', borderRadius: '12px', padding: '14px', background: 'rgba(99,102,241,0.06)' }}>
                                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#a5b4fc', marginBottom: '4px' }}>WRS Growth Suite</div>
                                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#e2e8f0', marginBottom: '4px' }}>$39<span style={{ fontSize: '12px', fontWeight: 400, color: '#94a3b8' }}>/mo</span></div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>or $390/yr · 14-day free trial</div>
                                    <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '12px', lineHeight: 1.5 }}>
                                        Analytics, audience insights, trending content dashboard
                                    </div>
                                    <a
                                        href="https://buy.stripe.com/test_aFa8wQc2K6CZ1NC1yO5ZC07"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ display: 'block', textAlign: 'center', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', borderRadius: '8px', padding: '9px 0', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
                                    >
                                        Start Free Trial →
                                    </a>
                                </div>

                                {/* Studio Plus */}
                                <div style={{ border: '1px solid rgba(139,92,246,0.3)', borderRadius: '12px', padding: '14px', background: 'rgba(139,92,246,0.06)' }}>
                                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#c4b5fd', marginBottom: '4px' }}>WRS Studio Plus</div>
                                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#e2e8f0', marginBottom: '4px' }}>$79<span style={{ fontSize: '12px', fontWeight: 400, color: '#94a3b8' }}>/mo</span></div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>or $790/yr · 7-day free trial</div>
                                    <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '12px', lineHeight: 1.5 }}>
                                        Team workflows, unlimited reviewers, permission-based editing
                                    </div>
                                    <a
                                        href="https://buy.stripe.com/test_6oU4gAfeW5yVdwkelA5ZC09"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ display: 'block', textAlign: 'center', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white', borderRadius: '8px', padding: '9px 0', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
                                    >
                                        Start Free Trial →
                                    </a>
                                </div>

                                {/* Podcast Pro Bundle */}
                                <div style={{ border: '1px solid rgba(236,72,153,0.3)', borderRadius: '12px', padding: '14px', background: 'rgba(236,72,153,0.06)', position: 'relative' }}>
                                    <div style={{ position: 'absolute', top: '-10px', left: '12px', background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#1f2937', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' }}>BEST VALUE</div>
                                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#f9a8d4', marginBottom: '4px' }}>Podcast Pro Bundle</div>
                                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#e2e8f0', marginBottom: '4px' }}>$149<span style={{ fontSize: '12px', fontWeight: 400, color: '#94a3b8' }}>/mo</span></div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>or $1,490/yr · 30-day free trial</div>
                                    <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '12px', lineHeight: 1.5 }}>
                                        Everything in Growth + Studio Plus + priority support
                                    </div>
                                    <a
                                        href="https://buy.stripe.com/test_bJebJ2eaS8L7fEs0uK5ZC0b"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ display: 'block', textAlign: 'center', background: 'linear-gradient(135deg, #ec4899, #db2777)', color: 'white', borderRadius: '8px', padding: '9px 0', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
                                    >
                                        Start Free Trial →
                                    </a>
                                </div>

                                {/* See all plans CTA */}
                                <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center' }}>Compare all plans, toggle annual/monthly, and see full feature lists.</div>
                                    <button
                                        type="button"
                                        onClick={() => onNavigate?.('podcast-checkout')}
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-color)', borderRadius: '8px', padding: '9px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        View All Plans <FiExternalLink size={12} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </section>

                <section ref={connectionsRef} style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '18px',
                    background: 'var(--card-bg)',
                    padding: '18px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <FiLink />
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Connections & Social URLs</h2>
                    </div>
                    <p style={{ marginTop: 0, color: 'var(--light-color)', fontSize: '14px' }}>
                        Connect your accounts here, then copy the profile URLs you want to share from your profile page.
                    </p>

                    <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                        {CONNECTION_PLATFORMS.map((platform) => {
                            const status = statusByPlatform[platform.id] || {};
                            const isConnected = Boolean(status.connected || status.isConnected || status.active || status.enabled);
                            const statusDetails = status.details || {};
                            const connectedUrl = String(statusDetails.profileUrl || statusDetails.feedUrl || '').trim();
                            const connectedUsername = String(statusDetails.username || '').trim();
                            return (
                                <div
                                    key={platform.id}
                                    style={{
                                        border: `1px solid ${isConnected ? platform.tone : 'var(--border-color)'}`,
                                        borderRadius: '14px',
                                        padding: '12px',
                                        background: 'rgba(255,255,255,0.02)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{platform.label}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                                                {status.detail || (isConnected ? 'Connected' : 'Not connected')}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleConnect(platform.id)}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '999px',
                                                background: isConnected ? 'rgba(255,255,255,0.06)' : 'var(--highlight-color)',
                                                color: isConnected ? 'var(--text-color)' : '#fff',
                                                padding: '8px 12px',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            {isConnected ? 'Manage' : 'Connect'}
                                            <FiExternalLink />
                                        </button>
                                    </div>
                                    {isConnected && connectedUrl && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                            <a
                                                href={connectedUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    fontSize: '11px',
                                                    color: platform.tone,
                                                    textDecoration: 'underline',
                                                    wordBreak: 'break-all'
                                                }}
                                            >
                                                Connected profile: {connectedUsername ? `@${connectedUsername} · ` : ''}{connectedUrl}
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => handleCopyLink(platform.id, connectedUrl)}
                                                style={{
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '999px',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    color: 'var(--text-color)',
                                                    padding: '4px 10px',
                                                    fontSize: '11px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Copy URL
                                            </button>
                                        </div>
                                    )}
                                    <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                                        <input
                                            type="text"
                                            value={linkDrafts[platform.id]?.username || ''}
                                            onChange={(event) => handleLinkDraftChange(platform.id, 'username', event.target.value)}
                                            placeholder={`${platform.label} username (optional)`}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'var(--text-color)',
                                                padding: '8px 10px',
                                                fontSize: '12px'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            value={linkDrafts[platform.id]?.profileUrl || ''}
                                            onChange={(event) => handleLinkDraftChange(platform.id, 'profileUrl', event.target.value)}
                                            placeholder={`${platform.label} profile URL (optional)`}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'var(--text-color)',
                                                padding: '8px 10px',
                                                fontSize: '12px'
                                            }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--light-color)' }}>
                                                Save by app user + URL. Advanced fields remain admin-only.
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSaveLink(platform.id)}
                                                disabled={linkSavingPlatform === platform.id}
                                                style={{
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '999px',
                                                    background: 'rgba(255,255,255,0.08)',
                                                    color: 'var(--text-color)',
                                                    padding: '6px 10px',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                    fontWeight: 700
                                                }}
                                            >
                                                {linkSavingPlatform === platform.id ? 'Saving...' : 'Save Link'}
                                            </button>
                                        </div>
                                        {linkErrorByPlatform[platform.id] && (
                                            <div style={{ fontSize: '11px', color: '#fca5a5' }}>
                                                {linkErrorByPlatform[platform.id]}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Promote Your Profile on Social ─────────────────────────────── */}
                <section style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '18px',
                    background: 'var(--card-bg)',
                    padding: '18px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <FiShare2 />
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Promote Your WRS Profile</h2>
                    </div>
                    <p style={{ marginTop: 0, color: 'var(--light-color)', fontSize: '14px' }}>
                        Add your WiseRavenShare profile link to your social bios so your audience can find you here.
                    </p>

                    {(() => {
                        const profileSlug = user?.username || user?.handle || user?.id || '';
                        const profileUrl  = profileSlug
                            ? `https://wiseravenshare.com/profile/${profileSlug}`
                            : 'https://wiseravenshare.com';

                        const socialInstructions = [
                            {
                                id: 'facebook',
                                label: 'Facebook',
                                color: '#93c5fd',
                                where: 'Page settings → Contact and basic info → Website field',
                                link: 'https://www.facebook.com/wiseravenshare',
                            },
                            {
                                id: 'instagram',
                                label: 'Instagram',
                                color: '#f9a8d4',
                                where: 'Edit Profile (mobile app) → Links section',
                                link: 'https://www.instagram.com/wiseravenshare',
                            },
                            {
                                id: 'youtube',
                                label: 'YouTube',
                                color: '#f87171',
                                where: 'YouTube Studio → Customization → Basic Info → Links',
                                link: 'https://www.youtube.com/@wiseravenshare',
                            },
                            {
                                id: 'tiktok',
                                label: 'TikTok',
                                color: '#67e8f9',
                                where: 'Business Account required → Edit Profile → Website',
                                link: 'https://www.tiktok.com/@wiseravenshare',
                            },
                        ];

                        return (
                            <div style={{ display: 'grid', gap: '12px', marginTop: '14px' }}>
                                {/* Copyable profile URL */}
                                <div style={{
                                   border: '1px solid rgba(167,139,250,0.4)',
                                   borderRadius: '12px',
                                   padding: '14px',
                                   background: 'rgba(167,139,250,0.06)',
                                   display: 'flex',
                                   alignItems: 'center',
                                   justifyContent: 'space-between',
                                   gap: '12px',
                                   flexWrap: 'wrap'
                                }}>
                                   <div>
                                       <div style={{ fontWeight: 700, marginBottom: '4px' }}>Your profile link</div>
                                       <code style={{ fontSize: '13px', color: '#a78bfa' }}>{profileUrl}</code>
                                   </div>
                                   <button
                                       type="button"
                                       onClick={() => navigator.clipboard?.writeText(profileUrl)}
                                       style={{
                                           background: 'rgba(167,139,250,0.2)',
                                           border: '1px solid rgba(167,139,250,0.4)',
                                           borderRadius: '8px',
                                           color: '#a78bfa',
                                           padding: '8px 14px',
                                           cursor: 'pointer',
                                           fontWeight: 700,
                                           fontSize: '13px',
                                           whiteSpace: 'nowrap'
                                       }}
                                   >
                                       Copy Link
                                   </button>
                                </div>

                                {/* Per-platform instructions */}
                                {socialInstructions.map(({ id, label, color, where, link }) => (
                                   <div key={id} style={{
                                       border: `1px solid ${color}44`,
                                       borderRadius: '12px',
                                       padding: '12px 14px',
                                       display: 'flex',
                                       alignItems: 'center',
                                       justifyContent: 'space-between',
                                       gap: '12px',
                                       flexWrap: 'wrap'
                                   }}>
                                       <div>
                                           <div style={{ fontWeight: 700, color, marginBottom: '2px' }}>{label}</div>
                                           <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{where}</div>
                                       </div>
                                       <a
                                           href={link}
                                           target="_blank"
                                           rel="noopener noreferrer"
                                           style={{
                                               display: 'inline-flex',
                                               alignItems: 'center',
                                               gap: '5px',
                                               background: `${color}18`,
                                               border: `1px solid ${color}55`,
                                               borderRadius: '8px',
                                               color,
                                               padding: '7px 12px',
                                               textDecoration: 'none',
                                               fontSize: '12px',
                                               fontWeight: 700,
                                               whiteSpace: 'nowrap'
                                           }}
                                       >
                                           Open {label} <FiExternalLink size={12} />
                                       </a>
                                   </div>
                                ))}
                            </div>
                        );
                    })()}
                </section>

                <section style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '18px',
                    background: 'var(--card-bg)',
                    padding: '18px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <FiShield />
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Safety & AI Checks</h2>
                    </div>
                    <p style={{ marginTop: 0, color: 'var(--light-color)', fontSize: '14px' }}>
                        Uploads and recordings are scanned and verified before they are published.
                    </p>

                    <div style={{ display: 'grid', gap: '10px' }}>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px' }}>
                            <strong>Malware scanning</strong>
                            <div style={{ color: 'var(--light-color)', fontSize: '13px', marginTop: '4px' }}>
                                Enforced on upload and retained before media becomes public.
                            </div>
                        </div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px' }}>
                            <strong>Truth-score verification</strong>
                            <div style={{ color: 'var(--light-color)', fontSize: '13px', marginTop: '4px' }}>
                                AI-assisted checks remain tied to the upload and recording flow.
                            </div>
                        </div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px' }}>
                            <strong>Copyright protection</strong>
                            <div style={{ color: 'var(--light-color)', fontSize: '13px', marginTop: '4px' }}>
                                Publish and syndication paths keep provenance attached to each asset.
                            </div>
                        </div>
                    </div>
                </section>

                <section style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '18px',
                    background: 'var(--card-bg)',
                    padding: '18px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <FiTrendingUp />
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Admin Metrics Wall</h2>
                    </div>
                    <p style={{ marginTop: 0, color: 'var(--light-color)', fontSize: '14px' }}>
                        Reach, engagement, conversion, and response metrics are gated to the admin wall.
                    </p>

                    {isAdminUser ? (
                        loading || !adminMetrics ? (
                            <div style={{ padding: '18px 0', color: 'var(--light-color)' }}>Loading admin metrics...</div>
                        ) : (
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {[
                                    ['Reach', adminMetrics.reach, 'followers reached'],
                                    ['Impressions', adminMetrics.impressions.toLocaleString(), 'total post views'],
                                    ['Share of Voice', `${adminMetrics.shareOfVoice.toFixed(1)}%`, 'feed visibility share'],
                                    ['Follower Growth', `${adminMetrics.followerGrowthRate.toFixed(1)}%`, 'growth vs stored baseline'],
                                    ['Engagement Rate', `${adminMetrics.engagementRate.toFixed(1)}%`, 'likes + comments + shares + saves'],
                                    ['Saves', adminMetrics.saves.toLocaleString(), 'bookmarked posts'],
                                    ['Shares', adminMetrics.shares.toLocaleString(), 'share amplification'],
                                    ['Watch Time', `${adminMetrics.watchTimeMinutes.toFixed(1)} min`, 'estimated watch time'],
                                    ['Completion Rate', adminMetrics.completionRate == null ? '—' : `${adminMetrics.completionRate.toFixed(1)}%`, 'video completion rate'],
                                    ['CTR', adminMetrics.ctr == null ? '—' : `${adminMetrics.ctr.toFixed(1)}%`, 'click-through rate'],
                                    ['Conversion Rate', adminMetrics.conversionRate == null ? '—' : `${adminMetrics.conversionRate.toFixed(1)}%`, 'conversion rate'],
                                    ['CPL / CPC', `${adminMetrics.cpl == null ? '—' : adminMetrics.cpl.toFixed(2)} / ${adminMetrics.cpc == null ? '—' : adminMetrics.cpc.toFixed(2)}`, 'paid acquisition']
                                ].map(([label, value, note]) => (
                                    <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--light-color)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                                        <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>{value}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{note}</div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            border: '1px dashed var(--border-color)',
                            borderRadius: '12px',
                            padding: '14px',
                            color: 'var(--light-color)'
                        }}>
                            <FiLock />
                            Admin access required to view performance counts.
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default SettingsPage;
