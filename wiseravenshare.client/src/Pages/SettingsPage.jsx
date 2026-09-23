import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiExternalLink, FiLink, FiLock, FiRefreshCw, FiShield, FiTrendingUp } from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import { apiService } from '../Services/api';

const parseAdminEmails = () => {
    const fromEnv = String(import.meta.env.VITE_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return new Set(['admin@wise-ravens.com', ...fromEnv]);
};

const CONNECTION_PLATFORMS = [
    { id: 'facebook', label: 'Facebook', tone: '#93c5fd' },
    { id: 'tiktok', label: 'TikTok', tone: '#67e8f9' },
    { id: 'instagram', label: 'Instagram', tone: '#f9a8d4' },
    { id: 'youtube', label: 'YouTube', tone: '#f87171' }
];

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

const SettingsPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const { addToast } = useNotification();
    const [loading, setLoading] = useState(true);
    const [savingPlatform, setSavingPlatform] = useState('');
    const [statusByPlatform, setStatusByPlatform] = useState({});
    const [adminMetrics, setAdminMetrics] = useState(null);
    const [error, setError] = useState('');

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

    const handleConnect = async (platform) => {
        if (!user?.id) {
            return;
        }

        setSavingPlatform(platform);
        try {
            const response = await apiService.startSocialConnect(platform, user.id);
            const payload = response?.data || {};
            const redirectUrl = payload.authorizationUrl || payload.redirectUrl || payload.url || payload.connectUrl;
            if (redirectUrl) {
                window.location.assign(redirectUrl);
                return;
            }

            addToast(payload.message || `${platform} connection started.`, 'info');
        } catch (connectError) {
            addToast(connectError?.message || `Unable to start ${platform} connection.`, 'error');
        } finally {
            setSavingPlatform('');
        }
    };

    if (!user) {
        return null;
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
                <section style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '18px',
                    background: 'var(--card-bg)',
                    padding: '18px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <FiLink />
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Connections</h2>
                    </div>
                    <p style={{ marginTop: 0, color: 'var(--light-color)', fontSize: '14px' }}>
                        Social and service connections are managed here instead of scattered across the app.
                    </p>

                    <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                        {CONNECTION_PLATFORMS.map((platform) => {
                            const status = statusByPlatform[platform.id] || {};
                            const isConnected = Boolean(status.connected || status.isConnected || status.active || status.enabled);
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
                                            disabled={savingPlatform === platform.id}
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
                                            {savingPlatform === platform.id ? (
                                                <>
                                                    <FiRefreshCw />
                                                    Working
                                                </>
                                            ) : (
                                                <>
                                                    {isConnected ? 'Manage' : 'Connect'}
                                                    <FiExternalLink />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
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
