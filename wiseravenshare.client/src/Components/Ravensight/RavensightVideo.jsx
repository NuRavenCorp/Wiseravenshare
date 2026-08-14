import React, { useEffect, useState } from 'react';
import VideoRecorder from './VideoRecorder';
import VideoFeed from './VideoFeed';
import VideoUploader from './VideoUploader';
import VideoLibrary from './VideoLibrary';
import WiseRavenLogo from '../Common/WiseRavenLogo';
import { useAuth } from '../../Contexts/AuthContext';
import { apiService } from '../../Services/api';
import { subscriptionService } from '../../services/subscriptionService';

const PRICING_PLANS = [
    {
        id: 'creator_pro',
        name: 'Creator Pro',
        tagline: 'For solo creators shipping consistently',
        monthlyPrice: 19,
        annualPrice: 190,
        monthlyCycleDays: 30,
        annualCycleDays: 365,
        badge: 'Most popular',
        features: [
            'Direct publishing to YouTube and TikTok',
            'Scheduled uploads and publishing workflow',
            'Creator controls for privacy and approvals'
        ]
    },
    {
        id: 'growth_suite',
        name: 'Growth Suite',
        tagline: 'For creators scaling their audience',
        monthlyPrice: 39,
        annualPrice: 390,
        monthlyCycleDays: 30,
        annualCycleDays: 365,
        badge: 'Best for growth',
        features: [
            'Everything in Creator Pro',
            'Advanced audience growth analytics',
            'Trend and publishing optimization tools'
        ]
    },
    {
        id: 'studio_plus',
        name: 'Studio Plus',
        tagline: 'For teams and agencies',
        monthlyPrice: 79,
        annualPrice: 790,
        monthlyCycleDays: 30,
        annualCycleDays: 365,
        badge: 'For teams',
        features: [
            'Everything in Growth Suite',
            'Multi-user access and team workflows',
            'Expanded publishing and delivery controls'
        ]
    }
];

const DEFAULT_PLAN_ID = 'creator_pro';
const DEFAULT_BILLING_CYCLE = 'monthly';

const PRODUCT_ROADMAP = [
    {
        phase: 'Launch',
        title: 'Creator publishing core',
        description: 'Direct publishing, scheduling, video upload flows, and clean creator controls for the essentials.'
    },
    {
        phase: 'Next',
        title: 'Growth intelligence',
        description: 'Trend-aware planning, content ideas, and audience optimization tools for faster reach.'
    },
    {
        phase: 'Scale',
        title: 'Team and agency workflows',
        description: 'Collaborations, approvals, shared libraries, and multi-brand publishing capabilities.'
    }
];

const CAPABILITY_STACK = [
    {
        title: 'Creator publishing core',
        subitems: ['Direct video upload flows', 'Publishing queue and scheduling', 'Creator privacy and approval controls']
    },
    {
        title: 'Growth intelligence',
        subitems: ['AI-assisted ideation', 'Trend-aware content planning', 'Performance-based publishing recommendations']
    },
    {
        title: 'Team / agency mode',
        subitems: ['Shared workspace', 'Approvals and comments', 'Client-ready workflows and multi-brand publishing']
    }
];

const CHANNEL_ROLLOUT = [
    { name: 'YouTube', status: 'Ready' },
    { name: 'TikTok', status: 'Ready' },
    { name: 'Instagram', status: 'Phase 2' },
    { name: 'LinkedIn', status: 'Phase 2' },
    { name: 'X', status: 'Phase 3' },
    { name: 'Facebook', status: 'Phase 3' }
];

const VALUE_PROFILES = [
    {
        planId: 'creator_pro',
        headline: 'Publish faster without admin drag.',
        outcome: 'Direct upload and creator controls remove repetitive steps from the publishing loop.',
        unlocks: ['Direct publishing', 'Scheduled uploads', 'Creator approvals']
    },
    {
        planId: 'growth_suite',
        headline: 'Grow with clearer signals.',
        outcome: 'Trend-aware planning and audience insights turn the video workflow into a growth system.',
        unlocks: ['Growth analytics', 'Trend recommendations', 'Publishing optimization']
    },
    {
        planId: 'studio_plus',
        headline: 'Run teams, not just accounts.',
        outcome: 'Shared workflows and multi-user controls support agencies and internal content teams.',
        unlocks: ['Shared workspaces', 'Approvals', 'Multi-brand publishing']
    }
];

const PAID_FEATURES = [
    {
        title: 'Direct publishing',
        detail: 'Send content to connected channels without manual copy-paste steps.',
        access: 'creator_pro'
    },
    {
        title: 'Scheduling and queueing',
        detail: 'Plan a content run in advance so publishing keeps moving when the team is offline.',
        access: 'creator_pro'
    },
    {
        title: 'Growth analytics',
        detail: 'Use trend and audience signals to prioritize what gets posted next.',
        access: 'growth_suite'
    },
    {
        title: 'Team workflows',
        detail: 'Bring reviewers, editors, and operators into the same publishing lane.',
        access: 'studio_plus'
    }
];

const allowLocalCheckoutFallback =
    import.meta.env.DEV || String(import.meta.env.VITE_STRIPE_CHECKOUT_LOCAL_FALLBACK || '').toLowerCase() === 'true';

const hostedStripePaymentLink =
    String(import.meta.env.VITE_STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/9B67sL9h13oZ4vTe8Tf7i00').trim();

const buildSubscriptionStorageKey = (userId) => `wiseRavensightSubscription_${userId || 'guest'}`;
const buildPaywallVariantStorageKey = (userId) => `wiseRavensightPaywallVariant_${userId || 'guest'}`;

const buildRenewDate = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
};

const formatMoney = (value) => `$${Number(value).toFixed(2)}`;

const getPlanById = (planId = DEFAULT_PLAN_ID) => {
    return PRICING_PLANS.find((plan) => plan.id === planId) || PRICING_PLANS[0];
};

const RavensightVideo = () => {
    const [activeTab, setActiveTab] = useState('record'); // record, feed, upload, library
    const [notifications, setNotifications] = useState([]);
    const [selectedPlanId, setSelectedPlanId] = useState(DEFAULT_PLAN_ID);
    const [billingSync, setBillingSync] = useState({
        source: 'local',
        status: 'inactive',
        hasActiveSubscription: false,
        currentPeriodEnd: null,
        priceId: null,
        error: ''
    });
    const { user } = useAuth();
    const subscriptionStorageKey = buildSubscriptionStorageKey(user?.id);
    const paywallVariantStorageKey = buildPaywallVariantStorageKey(user?.id);
    const [subscription, setSubscription] = useState(() => {
        try {
            const raw = localStorage.getItem(subscriptionStorageKey);
            return raw
                ? JSON.parse(raw)
                : {
                    tier: getPlanById().name,
                    isActive: false,
                    billingCycle: DEFAULT_BILLING_CYCLE,
                    price: getPlanById().monthlyPrice,
                    renewsAt: null,
                    planId: DEFAULT_PLAN_ID
                };
        } catch {
            return {
                tier: getPlanById().name,
                isActive: false,
                billingCycle: DEFAULT_BILLING_CYCLE,
                price: getPlanById().monthlyPrice,
                renewsAt: null,
                planId: DEFAULT_PLAN_ID
            };
        }
    });
    const selectedPlan = getPlanById(selectedPlanId);
    const unlockedFeatureCount = PAID_FEATURES.filter((feature) => {
        if (feature.access === 'creator_pro') return true;
        if (feature.access === 'growth_suite') return selectedPlanId === 'growth_suite' || selectedPlanId === 'studio_plus';
        if (feature.access === 'studio_plus') return selectedPlanId === 'studio_plus';
        return false;
    }).length;

    const addNotification = (message, type = 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const persistSubscription = (nextSubscription) => {
        setSubscription(nextSubscription);
        localStorage.setItem(subscriptionStorageKey, JSON.stringify(nextSubscription));
    };

    const safeTrackGrowthEvent = (eventName, metadata = {}) => {
        apiService.trackGrowthEvent(eventName, metadata).catch(() => null);
    };

    useEffect(() => {
        try {
            const savedPlanId = localStorage.getItem(paywallVariantStorageKey);
            if (savedPlanId && PRICING_PLANS.some((plan) => plan.id === savedPlanId)) {
                setSelectedPlanId(savedPlanId);
                return;
            }

            localStorage.setItem(paywallVariantStorageKey, DEFAULT_PLAN_ID);
            setSelectedPlanId(DEFAULT_PLAN_ID);
        } catch {
            setSelectedPlanId(DEFAULT_PLAN_ID);
        }
    }, [paywallVariantStorageKey]);

    useEffect(() => {
        let cancelled = false;

        const syncBillingStatus = async () => {
            try {
                const response = await subscriptionService.getSubscriptionStatus();
                if (cancelled) {
                    return;
                }

                setBillingSync({
                    source: 'server',
                    status: response?.status || 'inactive',
                    hasActiveSubscription: Boolean(response?.hasActiveSubscription),
                    currentPeriodEnd: response?.currentPeriodEnd || null,
                    priceId: response?.priceId || null,
                    error: ''
                });

                if (response?.hasActiveSubscription) {
                    setSubscription((current) => ({
                        ...current,
                        isActive: true,
                        renewsAt: response.currentPeriodEnd || current.renewsAt,
                        planId: current.planId || DEFAULT_PLAN_ID,
                        tier: current.tier || getPlanById(current.planId || DEFAULT_PLAN_ID).name
                    }));
                    return;
                }

                if (!allowLocalCheckoutFallback) {
                    setSubscription((current) => ({
                        ...current,
                        isActive: false,
                        renewsAt: null
                    }));
                }
            } catch (error) {
                if (cancelled) {
                    return;
                }

                setBillingSync({
                    source: 'local',
                    status: 'unverified',
                    hasActiveSubscription: Boolean(subscription?.isActive),
                    currentPeriodEnd: subscription?.renewsAt || null,
                    priceId: null,
                    error: error?.message || 'Unable to verify subscription status right now.'
                });
            }
        };

        syncBillingStatus();

        return () => {
            cancelled = true;
        };
    }, [subscriptionStorageKey, user?.id]);

    useEffect(() => {
        safeTrackGrowthEvent('paywall_plan_selected', {
            source: 'ravensight_video',
            plan: selectedPlanId
        });
    }, [selectedPlanId]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search || '');
        const subscriptionResult = params.get('subscription');

        if (!subscriptionResult) {
            return;
        }

        if (subscriptionResult === 'success') {
            addNotification('Checkout completed. Subscription verification is processing.', 'success');
            safeTrackGrowthEvent('subscription_checkout_success_landing', {
                source: 'ravensight_video',
                queryValue: 'success'
            });
        } else if (subscriptionResult === 'cancelled') {
            addNotification('Checkout was cancelled before completion.', 'warning');
            safeTrackGrowthEvent('subscription_checkout_cancelled_landing', {
                source: 'ravensight_video',
                queryValue: 'cancelled'
            });
        }

        params.delete('subscription');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, nextUrl);
    }, []);

    useEffect(() => {
        if (activeTab !== 'subscribe') {
            return;
        }

        safeTrackGrowthEvent('paywall_viewed', {
            source: 'ravensight_video',
            plan: selectedPlanId
        });
    }, [activeTab, selectedPlanId]);

    const subscribeNow = async (planId = selectedPlanId, billingCycle = DEFAULT_BILLING_CYCLE) => {
        const plan = getPlanById(planId);
        const actualPlanId = plan.id;

        if (hostedStripePaymentLink) {
            safeTrackGrowthEvent('checkout_redirected_payment_link', {
                source: 'ravensight_video',
                plan: actualPlanId,
                billingCycle,
                checkoutUrl: hostedStripePaymentLink
            });
            window.location.assign(hostedStripePaymentLink);
            return;
        }

        const successUrl = `${window.location.origin}/?subscription=success`;
        const cancelUrl = `${window.location.origin}/?subscription=cancelled`;

        safeTrackGrowthEvent('checkout_started', {
            source: 'ravensight_video',
            plan: actualPlanId,
            billingCycle
        });

        try {
            const response = await apiService.createCheckoutSession({
                plan: actualPlanId,
                billingCycle,
                successUrl,
                cancelUrl
            });

            const checkoutUrl = response?.data?.url;
            if (checkoutUrl) {
                safeTrackGrowthEvent('checkout_redirected', {
                    source: 'ravensight_video',
                    plan: actualPlanId,
                    billingCycle,
                    checkoutSessionId: response?.data?.id || ''
                });
                window.location.assign(checkoutUrl);
                return;
            }

            throw new Error('Missing Stripe checkout URL.');
        } catch (error) {
            const serverMessage = error?.response?.data?.message;
            const resolvedMessage = typeof serverMessage === 'string' && serverMessage.trim().length > 0
                ? serverMessage.trim()
                : (error?.message || 'Stripe checkout is unavailable right now.');

            if (!allowLocalCheckoutFallback) {
                safeTrackGrowthEvent('checkout_failed', {
                    source: 'ravensight_video',
                    plan: actualPlanId,
                    billingCycle,
                    reason: resolvedMessage
                });
                addNotification(`Billing is temporarily unavailable. Please try again in a few minutes.`, 'error');
                return;
            }

            const isAnnual = billingCycle === 'annual';
            const next = {
                tier: plan.name,
                isActive: true,
                billingCycle,
                planId: actualPlanId,
                price: isAnnual ? plan.annualPrice : plan.monthlyPrice,
                renewsAt: buildRenewDate(isAnnual ? plan.annualCycleDays : plan.monthlyCycleDays)
            };

            persistSubscription(next);
            safeTrackGrowthEvent('checkout_fallback_enabled', {
                source: 'ravensight_video',
                plan: actualPlanId,
                billingCycle,
                reason: resolvedMessage
            });
            addNotification(
                isAnnual
                    ? `${plan.name} annual checkout is unavailable right now. A local billing test has been enabled for preview purposes.`
                    : `${plan.name} monthly checkout is unavailable right now. A local billing test has been enabled for preview purposes.`,
                'warning'
            );
        }
    };

    const openStripeCustomerPortal = async () => {
        safeTrackGrowthEvent('stripe_portal_open_started', {
            source: 'ravensight_video',
            plan: 'creator_pro'
        });

        try {
            const response = await subscriptionService.createPortalSession({
                returnUrl: `${window.location.origin}/?subscription=manage`
            });

            const portalUrl = response?.url;
            if (!portalUrl) {
                throw new Error('Missing Stripe portal URL.');
            }

            safeTrackGrowthEvent('stripe_portal_open_redirected', {
                source: 'ravensight_video',
                plan: 'creator_pro'
            });
            window.location.assign(portalUrl);
        } catch (error) {
            const reason = error?.message || 'Stripe portal unavailable right now.';
            safeTrackGrowthEvent('stripe_portal_open_failed', {
                source: 'ravensight_video',
                plan: 'creator_pro',
                reason
            });
            addNotification(`Stripe portal unavailable: ${reason}`, 'error');
        }
    };

    const tabs = [
        { id: 'record', label: '🎥 Record Video', icon: '🎥' },
        { id: 'feed', label: '📺 Video Feed', icon: '📺' },
        { id: 'upload', label: '📤 Upload to YouTube/TikTok', icon: '📤' },
        { id: 'library', label: '📚 My Library', icon: '📚' },
        { id: 'subscribe', label: '💎 Subscribe', icon: '💎' }
    ];

    return (
        <div style={{
            background: 'var(--card-bg)',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid var(--border-color)'
        }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, var(--highlight-color) 0%, var(--accent-color) 100%)',
                padding: '20px',
                color: 'white'
            }}>
                <div style={{ marginBottom: '10px' }}>
                    <WiseRavenLogo showTagline={false} />
                </div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <i className="fas fa-crow"></i>
                    Ravensight Video Studio
                </h2>
                <p style={{ opacity: 0.9 }}>Secure publishing for creators, teams, and growth-focused brands.</p>
                <div style={{ marginTop: '10px', fontSize: '13px', opacity: 0.95, display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                    <span>
                        Publishing access:
                        <strong style={{ marginLeft: '6px' }}>
                            {subscription?.isActive ? `${subscription.tier} active` : `Choose a plan below`}
                        </strong>
                    </span>
                    <span style={{
                        borderRadius: '999px',
                        padding: '4px 10px',
                        background: billingSync.hasActiveSubscription ? 'rgba(76,175,80,0.18)' : 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.18)'
                    }}>
                        {billingSync.source === 'server' ? 'Billing synced' : 'Billing preview mode'}
                    </span>
                    {billingSync.error && (
                        <span style={{ color: '#ffd7d7' }}>
                            {billingSync.error}
                        </span>
                    )}
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--secondary-color)',
                padding: '0 20px'
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '15px 25px',
                            background: activeTab === tab.id ? 'var(--card-bg)' : 'transparent',
                            border: 'none',
                            color: activeTab === tab.id ? 'var(--text-color)' : 'var(--highlight-color)',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                            borderBottom: activeTab === tab.id ? '3px solid var(--highlight-color)' : 'none',
                            transition: 'all 0.3s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div style={{ padding: '20px', minHeight: '600px' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '14px',
                    marginBottom: '18px'
                }}>
                    {PAID_FEATURES.map((feature) => {
                        const isUnlocked = feature.access === 'creator_pro'
                            || (feature.access === 'growth_suite' && (selectedPlanId === 'growth_suite' || selectedPlanId === 'studio_plus'))
                            || (feature.access === 'studio_plus' && selectedPlanId === 'studio_plus');

                        return (
                            <div key={feature.title} style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '14px',
                                padding: '14px',
                                background: isUnlocked ? 'rgba(76,175,80,0.08)' : 'rgba(255,255,255,0.02)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                                    <div style={{ fontWeight: 800 }}>{feature.title}</div>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        borderRadius: '999px',
                                        padding: '4px 8px',
                                        background: isUnlocked ? 'rgba(76,175,80,0.18)' : 'rgba(255,255,255,0.08)'
                                    }}>
                                        {isUnlocked ? 'Unlocked' : `Needs ${feature.access.replace('_', ' ')}`}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--light-color)', lineHeight: 1.5, fontSize: '13px' }}>{feature.detail}</div>
                            </div>
                        );
                    })}
                </div>

                <div style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, rgba(79,116,214,0.18), rgba(163,58,93,0.14))',
                    padding: '16px',
                    marginBottom: '18px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, opacity: 0.8 }}>Billing status</div>
                            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px' }}>
                                {billingSync.hasActiveSubscription ? 'Active subscription verified' : 'Subscription not active'}
                            </div>
                            <div style={{ color: 'var(--light-color)', marginTop: '4px' }}>
                                {billingSync.source === 'server'
                                    ? `Synced from Stripe with status ${billingSync.status}.`
                                    : 'Showing local preview until Stripe status is available.'}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, opacity: 0.8 }}>Unlocked feature groups</div>
                            <div style={{ fontSize: '28px', fontWeight: 900 }}>{unlockedFeatureCount}</div>
                        </div>
                    </div>
                </div>

                {activeTab === 'record' && (
                    <VideoRecorder
                        onNotification={addNotification}
                        canDirectUpload={Boolean(subscription?.isActive)}
                        subscriptionPriceMonthly={getPlanById(subscription?.planId || DEFAULT_PLAN_ID).monthlyPrice}
                    />
                )}
                {activeTab === 'feed' && (
                    <VideoFeed onNotification={addNotification} />
                )}
                {activeTab === 'upload' && (
                    <VideoUploader
                        onNotification={addNotification}
                        canDirectUpload={Boolean(subscription?.isActive)}
                        subscriptionPriceMonthly={getPlanById(subscription?.planId || DEFAULT_PLAN_ID).monthlyPrice}
                    />
                )}
                {activeTab === 'library' && (
                    <VideoLibrary onNotification={addNotification} />
                )}
                {activeTab === 'subscribe' && (
                    <div style={{ maxWidth: '980px', margin: '0 auto' }}>
                        <div style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '18px',
                            background: 'linear-gradient(145deg, rgba(79,116,214,0.18), rgba(163,58,93,0.14))',
                            padding: '24px'
                        }}>
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, opacity: 0.8 }}>
                                    Pricing
                                </div>
                                <h3 style={{ margin: '8px 0 6px', fontSize: '32px' }}>Choose the plan that fits your publishing pace.</h3>
                                <p style={{ margin: 0, color: 'var(--light-color)' }}>
                                    A creator-first suite designed to help you publish faster, grow smarter, and scale with more structure.
                                </p>
                            </div>

                            <div style={{
                                marginBottom: '22px',
                                border: '1px solid var(--border-color)',
                                borderRadius: '14px',
                                background: 'rgba(10,10,18,0.18)',
                                padding: '16px 18px',
                                color: 'var(--light-color)'
                            }}>
                                    <strong style={{ color: 'var(--text-color)' }}>Early access rollout:</strong> We are launching with the creator publishing core first, then expanding into growth intelligence and team workflows to power the broader social ecosystem.
                                    <div style={{ marginTop: '10px' }}>
                                        Current selected plan unlocks <strong style={{ color: 'var(--text-color)' }}>{unlockedFeatureCount} premium feature groups</strong> in the publishing studio.
                                    </div>
                            </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                    gap: '14px',
                                    marginBottom: '22px'
                                }}>
                                    {VALUE_PROFILES.map((profile) => (
                                        <div
                                            key={profile.planId}
                                            style={{
                                                border: selectedPlanId === profile.planId ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                                borderRadius: '14px',
                                                padding: '16px',
                                                background: selectedPlanId === profile.planId ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)'
                                            }}
                                        >
                                            <div style={{ fontWeight: 800, marginBottom: '8px' }}>{profile.headline}</div>
                                            <div style={{ color: 'var(--light-color)', lineHeight: 1.5, fontSize: '13px', marginBottom: '12px' }}>{profile.outcome}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {profile.unlocks.map((item) => (
                                                    <span key={item} style={{
                                                        fontSize: '11px',
                                                        borderRadius: '999px',
                                                        padding: '4px 8px',
                                                        background: 'rgba(255,255,255,0.08)'
                                                    }}>
                                                        {item}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                {PRICING_PLANS.map((plan) => {
                                    const isSelected = selectedPlanId === plan.id;
                                    const isCurrent = subscription?.planId === plan.id && subscription?.isActive;

                                    return (
                                        <div
                                            key={plan.id}
                                            onClick={() => setSelectedPlanId(plan.id)}
                                            style={{
                                                border: isSelected ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                                borderRadius: '16px',
                                                background: isSelected ? 'rgba(255,255,255,0.03)' : 'rgba(10,10,18,0.2)',
                                                padding: '18px',
                                                cursor: 'pointer',
                                                position: 'relative',
                                                boxShadow: isSelected ? '0 8px 28px rgba(79,116,214,0.18)' : 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <h4 style={{ margin: 0, fontSize: '20px' }}>{plan.name}</h4>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    borderRadius: '999px',
                                                    padding: '4px 8px',
                                                    background: 'rgba(255,255,255,0.08)',
                                                    border: '1px solid var(--border-color)'
                                                }}>
                                                    {plan.badge}
                                                </span>
                                            </div>

                                            <div style={{ marginBottom: '8px', color: 'var(--light-color)', fontSize: '14px' }}>{plan.tagline}</div>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
                                                <span style={{ fontSize: '32px', fontWeight: 800 }}>{formatMoney(plan.monthlyPrice)}</span>
                                                <span style={{ color: 'var(--light-color)' }}>/ month</span>
                                            </div>
                                            <div style={{ marginBottom: '14px', color: 'var(--light-color)', fontSize: '13px' }}>
                                                or {formatMoney(plan.annualPrice)}/year • save with annual billing
                                            </div>

                                            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--light-color)', lineHeight: 1.65, fontSize: '14px' }}>
                                                {plan.features.map((feature) => (
                                                    <li key={feature}>{feature}</li>
                                                ))}
                                            </ul>

                                            {isCurrent && (
                                                <div style={{ marginTop: '14px', fontWeight: 700, color: 'var(--highlight-color)' }}>
                                                    Active plan
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '24px', alignItems: 'center' }}>
                                {!subscription?.isActive ? (
                                    <>
                                        <button
                                            onClick={() => subscribeNow(selectedPlanId, 'monthly')}
                                            style={{
                                                border: 'none',
                                                background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                                color: 'white',
                                                borderRadius: '999px',
                                                padding: '12px 18px',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Start {selectedPlan.name} • {formatMoney(selectedPlan.monthlyPrice)}/mo
                                        </button>
                                        <button
                                            onClick={() => subscribeNow(selectedPlanId, 'annual')}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--card-bg)',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '12px 18px',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Annual {formatMoney(selectedPlan.annualPrice)} • Save more
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ alignSelf: 'center', color: 'var(--light-color)' }}>
                                            Active plan: {subscription.tier}
                                            {subscription?.renewsAt ? ` • Renews ${new Date(subscription.renewsAt).toLocaleDateString()}` : ''}
                                        </div>
                                        <button
                                            onClick={openStripeCustomerPortal}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                background: 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '12px 18px',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Manage billing
                                        </button>
                                    </>
                                )}
                            </div>

                            <div style={{ marginTop: '28px' }}>
                                <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, opacity: 0.8, marginBottom: '14px' }}>
                                    Product roadmap
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                                    {PRODUCT_ROADMAP.map((item) => (
                                        <div key={item.phase} style={{
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '12px',
                                            padding: '14px',
                                            background: 'rgba(255,255,255,0.02)'
                                        }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8, marginBottom: '8px' }}>{item.phase}</div>
                                            <div style={{ fontWeight: 700, marginBottom: '6px' }}>{item.title}</div>
                                            <div style={{ color: 'var(--light-color)', lineHeight: 1.5, fontSize: '13px' }}>{item.description}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '28px' }}>
                                {CAPABILITY_STACK.map((stack) => (
                                    <div key={stack.title} style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        background: 'rgba(10,10,18,0.18)'
                                    }}>
                                        <div style={{ fontWeight: 800, marginBottom: '10px' }}>{stack.title}</div>
                                        <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--light-color)', lineHeight: 1.6, fontSize: '14px' }}>
                                            {stack.subitems.map((item) => <li key={item}>{item}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: '30px' }}>
                                <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, opacity: 0.8, marginBottom: '12px' }}>
                                    Channel rollout
                                </div>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {CHANNEL_ROLLOUT.map((channel) => (
                                        <div key={channel.name} style={{
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '999px',
                                            padding: '8px 12px',
                                            background: 'rgba(255,255,255,0.02)',
                                            fontSize: '13px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <span>{channel.name}</span>
                                            <span style={{
                                                borderRadius: '999px',
                                                padding: '2px 7px',
                                                background: channel.status === 'Ready' ? 'rgba(76,175,80,0.18)' : 'rgba(255,152,0,0.15)',
                                                color: channel.status === 'Ready' ? '#8fe28a' : '#ffcf70',
                                                fontSize: '11px',
                                                fontWeight: 700
                                            }}>
                                                {channel.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Notifications */}
            <div style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                zIndex: 1000
            }}>
                {notifications.map(notif => (
                    <div
                        key={notif.id}
                        style={{
                            background: notif.type === 'success' ? '#4caf50' :
                                notif.type === 'error' ? '#f44336' :
                                    notif.type === 'warning' ? '#ff9800' : '#2196f3',
                            color: 'white',
                            padding: '12px 20px',
                            borderRadius: '8px',
                            marginBottom: '10px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            animation: 'slideIn 0.3s ease-out',
                            cursor: 'pointer'
                        }}
                        onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                    >
                        {notif.message}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RavensightVideo;