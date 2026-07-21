import React, { useState } from 'react';
import VideoRecorder from './VideoRecorder';
import VideoFeed from './VideoFeed';
import VideoUploader from './VideoUploader';
import VideoLibrary from './VideoLibrary';
import WiseRavenLogo from '../Common/WiseRavenLogo';
import { useAuth } from '../../Contexts/AuthContext';
import { apiService } from '../../Services/api';

const CREATOR_PRO = {
    tier: 'Creator Pro',
    monthlyPrice: 9.99,
    annualPrice: 109.00,
    monthlyCycleDays: 30,
    annualCycleDays: 365
};

const buildSubscriptionStorageKey = (userId) => `wiseRavensightSubscription_${userId || 'guest'}`;

const buildRenewDate = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
};

const RavensightVideo = () => {
    const [activeTab, setActiveTab] = useState('record'); // record, feed, upload, library
    const [notifications, setNotifications] = useState([]);
    const { user } = useAuth();
    const subscriptionStorageKey = buildSubscriptionStorageKey(user?.id);
    const [subscription, setSubscription] = useState(() => {
        try {
            const raw = localStorage.getItem(subscriptionStorageKey);
            return raw
                ? JSON.parse(raw)
                : {
                    tier: CREATOR_PRO.tier,
                    isActive: false,
                    billingCycle: 'monthly',
                    price: CREATOR_PRO.monthlyPrice,
                    renewsAt: null
                };
        } catch {
            return {
                tier: CREATOR_PRO.tier,
                isActive: false,
                billingCycle: 'monthly',
                price: CREATOR_PRO.monthlyPrice,
                renewsAt: null
            };
        }
    });

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

    const subscribeNow = async (billingCycle = 'monthly') => {
        const successUrl = `${window.location.origin}/?subscription=success`;
        const cancelUrl = `${window.location.origin}/?subscription=cancelled`;

        try {
            const response = await apiService.createCheckoutSession({
                plan: 'creator_pro',
                billingCycle,
                successUrl,
                cancelUrl
            });

            const checkoutUrl = response?.data?.url;
            if (checkoutUrl) {
                window.location.assign(checkoutUrl);
                return;
            }

            throw new Error('Missing Stripe checkout URL.');
        } catch (error) {
            // Fallback keeps local test workflow functional if Stripe is not configured yet.
            const isAnnual = billingCycle === 'annual';
            const next = {
                tier: CREATOR_PRO.tier,
                isActive: true,
                billingCycle,
                price: isAnnual ? CREATOR_PRO.annualPrice : CREATOR_PRO.monthlyPrice,
                renewsAt: buildRenewDate(isAnnual ? CREATOR_PRO.annualCycleDays : CREATOR_PRO.monthlyCycleDays)
            };

            persistSubscription(next);
            addNotification(
                isAnnual
                    ? `Stripe checkout is unavailable. Local ${CREATOR_PRO.tier} annual test mode enabled.`
                    : `Stripe checkout is unavailable. Local ${CREATOR_PRO.tier} monthly test mode enabled.`,
                'warning'
            );
        }
    };

    const cancelSubscription = () => {
        const next = {
            tier: CREATOR_PRO.tier,
            isActive: false,
            billingCycle: subscription?.billingCycle || 'monthly',
            price: subscription?.billingCycle === 'annual' ? CREATOR_PRO.annualPrice : CREATOR_PRO.monthlyPrice,
            renewsAt: null
        };
        persistSubscription(next);
        addNotification('Subscription canceled. Direct upload is now locked.', 'warning');
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
                <p style={{ opacity: 0.9 }}>Record, upload, and share videos directly to YouTube and TikTok</p>
                <div style={{ marginTop: '10px', fontSize: '13px', opacity: 0.95 }}>
                    Direct Upload:
                    <strong style={{ marginLeft: '6px' }}>
                        {subscription?.isActive ? `${subscription.tier} Active` : `Locked - ${CREATOR_PRO.tier} $${CREATOR_PRO.monthlyPrice.toFixed(2)}/month`}
                    </strong>
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
                {activeTab === 'record' && (
                    <VideoRecorder
                        onNotification={addNotification}
                        canDirectUpload={Boolean(subscription?.isActive)}
                        subscriptionPriceMonthly={CREATOR_PRO.monthlyPrice}
                    />
                )}
                {activeTab === 'feed' && (
                    <VideoFeed onNotification={addNotification} />
                )}
                {activeTab === 'upload' && (
                    <VideoUploader
                        onNotification={addNotification}
                        canDirectUpload={Boolean(subscription?.isActive)}
                        subscriptionPriceMonthly={CREATOR_PRO.monthlyPrice}
                    />
                )}
                {activeTab === 'library' && (
                    <VideoLibrary onNotification={addNotification} />
                )}
                {activeTab === 'subscribe' && (
                    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                        <div style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '14px',
                            background: 'linear-gradient(145deg, rgba(79,116,214,0.18), rgba(163,58,93,0.14))',
                            padding: '24px'
                        }}>
                            <h3 style={{ marginTop: 0, marginBottom: '8px' }}>{CREATOR_PRO.tier}</h3>
                            <p style={{ margin: 0, color: 'var(--light-color)' }}>
                                Unlock direct video uploads to YouTube and TikTok with scheduling and creator controls.
                            </p>

                            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '16px', marginBottom: '18px' }}>
                                <span style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '999px',
                                    padding: '6px 12px',
                                    fontWeight: 700
                                }}>
                                    ${CREATOR_PRO.monthlyPrice.toFixed(2)}/month
                                </span>
                                <span style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '999px',
                                    padding: '6px 12px',
                                    fontWeight: 700
                                }}>
                                    ${CREATOR_PRO.annualPrice.toFixed(2)}/year
                                </span>
                            </div>

                            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--light-color)', lineHeight: 1.6 }}>
                                <li>Direct upload pipeline for YouTube and TikTok</li>
                                <li>Upload scheduling and privacy controls</li>
                                <li>Priority upload reliability profile</li>
                            </ul>

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '22px' }}>
                                {!subscription?.isActive ? (
                                    <>
                                        <button
                                            onClick={() => subscribeNow('monthly')}
                                            style={{
                                                border: 'none',
                                                background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                                color: 'white',
                                                borderRadius: '999px',
                                                padding: '10px 16px',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Subscribe Monthly
                                        </button>
                                        <button
                                            onClick={() => subscribeNow('annual')}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--card-bg)',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '10px 16px',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Subscribe Annual (Save 9%)
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ alignSelf: 'center', color: 'var(--light-color)' }}>
                                            Active plan: {subscription.tier}
                                            {subscription?.renewsAt ? ` • Renews ${new Date(subscription.renewsAt).toLocaleDateString()}` : ''}
                                        </div>
                                        <button
                                            onClick={cancelSubscription}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                background: 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '10px 16px',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Cancel Subscription
                                        </button>
                                    </>
                                )}
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