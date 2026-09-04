import React, { useMemo, useState, useEffect } from 'react';
import Header from './Components/Common/Header';
import Sidebar from './Components/Common/Sidebar';
import RightSidebar from './Components/Common/RightSidebar';
import TruthAlert from './Components/Common/TruthAlert';
import RavenCommuniqueModal from './Components/Modal/RavenCommuniqueModal';
import FeedPage from './Pages/FeedPage';
import AiAssistantPage from './Pages/AiAssistantPage';
import DiscoverPage from './Pages/DiscoverPage';
import BookmarksPage from './Pages/BookmarksPage';
import MessagesPage from './Pages/MessagesPage';
import NotificationsPage from './Pages/NotificationsPage';
import PlannerPage from './Pages/PlannerPage';
import ProfilePage from './Pages/ProfilePage';
import LoginPage from './Pages/LoginPage';
import BreakingNewsPage from './Pages/BreakingNewsPage';
import ArticlePage from './Pages/ArticlePage';
import RavensightVideo from './Components/Ravensight/RavensightVideo';
import TruthSeeker from './Components/Truth/TruthSeeker';
import AINews from './Components/News/AINews';
import GrowthPage from './Pages/GrowthPage';
import RevenueConsolePage from './Pages/RevenueConsolePage';
import NewsroomRecorderPage from './Pages/NewsroomRecorderPage';
import TeamAccessAdminPage from './Pages/TeamAccessAdminPage';
import PrivacyPolicyPage from './Pages/PrivacyPolicyPage';
import TermsOfServicePage from './Pages/TermsOfServicePage';
import AmateurJournalistPage from './Pages/AmateurJournalistPage';
import CanvasPage from './Pages/CanvasPage';
import CollaborationPage from './Pages/CollaborationPage';
import TeamLaunchpadPage from './Pages/TeamLaunchpadPage';
import MusicRightsStudioPage from './Pages/MusicRightsStudioPage';
import MusicStudioPage from './Pages/MusicStudioPage';
import MyLibraryPage from './Pages/MyLibraryPage';
import InstrumentConnectorPage from './Pages/InstrumentConnectorPage';
import PodcastRightsStudioPage from './Pages/PodcastRightsStudioPage';
import { ErrorBoundary } from './Components/Common/ErrorBoundary';
import { queueRavensightTab } from './Services/podcastStudioBridge';
import { EvolutionEngine } from './Components/evolution/EvolutionEngine';
import { useAuth } from './Contexts/AuthContext';
import { useNotification } from './Contexts/NotificationContext';
import { apiService } from './Services/api';
import './Styles/Global.css';

const SPONSOR_PAYMENT_LINK = String(
    import.meta.env.VITE_STRIPE_SPONSOR_PAYMENT_LINK
    || import.meta.env.VITE_STRIPE_PAYMENT_LINK
    || 'https://buy.stripe.com/9B67sL9h13oZ4vTe8Tf7i00'
).trim();

const parseAdminEmails = () => {
    const fromEnv = String(import.meta.env.VITE_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return new Set(['admin@wise-ravens.com', ...fromEnv]);
};

const hasPrivilegedAggregatorRole = (user) => {
    const roleCandidates = [
        user?.teamRole,
        user?.role,
        user?.effectiveRole,
        user?.accessScope,
        user?.access_scope
    ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);

    return roleCandidates.includes('privileged') || roleCandidates.includes('priveledged');
};

const resolveInitialPublicPage = () => {
    if (typeof window === 'undefined') {
        return 'public-home';
    }

    const search = window.location.search || '';
    if (/authToken=|socialAuthError=|refreshToken=|adminPassToken=/i.test(search)) {
        return 'login';
    }

    const normalizedPath = String(window.location.pathname || '/').trim().toLowerCase();

    if (normalizedPath === '/privacy' || normalizedPath.startsWith('/privacy/')) {
        return 'privacy';
    }

    if (normalizedPath === '/terms' || normalizedPath.startsWith('/terms/')) {
        return 'terms';
    }

    if (normalizedPath === '/login' || normalizedPath === '/social/access') {
        return 'login';
    }

    return 'public-home';
};

const App = () => {
    const [currentPage, setCurrentPage] = useState(() =>
        resolveInitialPublicPage()
    );
    const [isRavensightMode, setIsRavensightMode] = useState(false);
    const [profileEditRequested, setProfileEditRequested] = useState(false);
    const [communiqueOpen, setCommuniqueOpen] = useState(false);
    const [truthAlerts, setTruthAlerts] = useState([]);
    const [selectedArticle, setSelectedArticle] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('wiseSelectedArticle') || 'null');
        } catch {
            return null;
        }
    });
    const [articleBackPage, setArticleBackPage] = useState('ainews');
    const { user, isAuthenticated, loading, login, register, acceptTeamInvite, logout } = useAuth();
    const { addToast } = useNotification();
    const adminEmails = useMemo(() => parseAdminEmails(), []);
    const isAdminUser = useMemo(() => {
        const email = String(user?.email || '').trim().toLowerCase();
        return email.length > 0 && adminEmails.has(email);
    }, [adminEmails, user?.email]);
    const canAccessPlatformAggregator = useMemo(() => {
        return isAdminUser || hasPrivilegedAggregatorRole(user);
    }, [isAdminUser, user]);

    useEffect(() => {
        const migrationKey = 'wiseContentCleanupV1';
        if (localStorage.getItem(migrationKey) === 'done') {
            return;
        }

        const isSuspiciousLongToken = (value) => {
            if (typeof value !== 'string') return false;
            const trimmed = value.trim();
            return trimmed.length > 120 && !/\s/.test(trimmed);
        };

        const sanitizeText = (value) => (isSuspiciousLongToken(value) ? '' : value);

        const sanitizePosts = (items) => {
            if (!Array.isArray(items)) return [];

            return items
                .map((item) => ({
                    ...item,
                    content: sanitizeText(item?.content),
                    lastMessage: sanitizeText(item?.lastMessage),
                    messages: Array.isArray(item?.messages)
                        ? item.messages.map((message) => ({
                            ...message,
                            text: sanitizeText(message?.text)
                        }))
                        : item?.messages
                }))
                .filter((item) => !isSuspiciousLongToken(item?.content));
        };

        const sanitizeStoredArray = (storageKey, mapper) => {
            try {
                const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
                const next = mapper(raw);
                localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
                localStorage.removeItem(storageKey);
            }
        };

        sanitizeStoredArray('wiseRecentPosts', sanitizePosts);
        sanitizeStoredArray('wiseDiscoverPosts', sanitizePosts);
        sanitizeStoredArray('wiseBookmarks', sanitizePosts);
        sanitizeStoredArray('wiseMessagesConversations', sanitizePosts);
        localStorage.setItem(migrationKey, 'done');
    }, []);

    useEffect(() => {
        const handleOpenSocialAggregator = (event) => {
            if (!canAccessPlatformAggregator) {
                addToast('Platform aggregator is restricted to admin and priveledged users.', 'info');
                return;
            }

            const detail = event?.detail || {};
            const requestedPlatform = String(detail.platform || '').trim().toLowerCase().replace('-feed', '');
            const platformPage = requestedPlatform && requestedPlatform !== 'all' ? `${requestedPlatform}-feed` : '';
            if (platformPage) {
                setCurrentPage(platformPage);
                return;
            }

            if (detail.page) {
                setCurrentPage(detail.page);
                return;
            }

            setCurrentPage('social-feeds');
        };

        window.addEventListener('wiseraven:open-social-aggregator', handleOpenSocialAggregator);
        return () => {
            window.removeEventListener('wiseraven:open-social-aggregator', handleOpenSocialAggregator);
        };
    }, [addToast, canAccessPlatformAggregator]);

    useEffect(() => {
        if (!isAuthenticated) {
            return undefined;
        }

        let isMounted = true;
        const engine = EvolutionEngine.getInstance();

        engine.initialize().catch((error) => {
            if (!isMounted) {
                return;
            }

            console.error('Failed to initialize evolution agents:', error);
            addToast('Agent initialization is temporarily unavailable.', 'warning');
        });

        return () => {
            isMounted = false;
            engine.destroy();
        };
    }, [isAuthenticated, addToast]);

    useEffect(() => {
        const perfTrimKey = 'wisePerfTrimV2';
        if (localStorage.getItem(perfTrimKey) === 'done') {
            return;
        }

        const trimStoredArray = (storageKey, maxItems) => {
            try {
                const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (!Array.isArray(raw)) {
                    localStorage.removeItem(storageKey);
                    return;
                }

                if (raw.length > maxItems) {
                    localStorage.setItem(storageKey, JSON.stringify(raw.slice(0, maxItems)));
                }
            } catch {
                localStorage.removeItem(storageKey);
            }
        };

        trimStoredArray('wiseRecentPosts', 120);
        trimStoredArray('wiseDiscoverPosts', 120);
        trimStoredArray('wiseBookmarks', 200);
        trimStoredArray('wiseMessagesConversations', 80);
        trimStoredArray('wiseLikedPosts', 200);
        localStorage.setItem(perfTrimKey, 'done');
    }, []);

    const addTruthAlert = (type, message, correction = null) => {
        const alert = {
            id: Date.now(),
            type: type,
            message: message,
            correction: correction
        };
        setTruthAlerts(prev => [alert, ...prev].slice(0, 5));
        setTimeout(() => {
            setTruthAlerts(prev => prev.filter(a => a.id !== alert.id));
        }, 8000);
    };

    const navigateToPage = (target) => {
        if (typeof target === 'string') {
            setCurrentPage(target);
            return;
        }

        if (target?.page) {
            setCurrentPage(target.page);
        }

        if (target?.editProfile) {
            setProfileEditRequested(true);
        }
    };

    const handleLogin = async ({ mode, name, email, password, bio, location, website, avatar, referralCode, inviteToken }) => {
        if (mode === 'signup') {
            await register({ name, email, password, bio, location, website, avatar, referralCode });
            addToast('Account created successfully.', 'success');
            setCurrentPage('profile');
            addToast('You are signed in. Finish your profile on this page.', 'info');
            return;
        }

        if (mode === 'teamInvite') {
            await acceptTeamInvite({ inviteToken, email, password, name });
            addToast('Team invite accepted. You are signed in.', 'success');
            setCurrentPage('team-launchpad');
            return;
        }

        const response = await login(email, password);
        addToast('Signed in successfully.', 'success');
        if (response?.user?.teamRole) {
            setCurrentPage('team-launchpad');
        }
    };

    const handleLogout = async () => {
        await logout();
        setIsRavensightMode(false);
        setCurrentPage('feed');
        addToast('You have been logged out.', 'info');
    };

    const handleSponsor = async () => {
        if (SPONSOR_PAYMENT_LINK) {
            window.location.assign(SPONSOR_PAYMENT_LINK);
            return;
        }

        try {
            const response = await apiService.createCheckoutSession({
                plan: 'sponsorship',
                billingCycle: 'monthly',
                successUrl: `${window.location.origin}/?subscription=success`,
                cancelUrl: `${window.location.origin}/?subscription=cancelled`
            });

            const checkoutUrl = response?.data?.url;
            if (checkoutUrl) {
                window.location.assign(checkoutUrl);
                return;
            }

            throw new Error('Missing Stripe sponsorship checkout URL.');
        } catch (error) {
            const message = error?.response?.data?.message || error?.message || 'Sponsorship checkout is unavailable right now.';
            addToast(message, 'error');
        }
    };

    const enterRavensightMode = () => {
        setCurrentPage('ravensight');
        setIsRavensightMode(true);
        addToast('Ravensight mode enabled.', 'info');
    };

    const openRavensightWithTab = (tabId = 'record') => {
        queueRavensightTab(tabId);
        setCurrentPage('ravensight');
        setIsRavensightMode(true);
        addToast('Opening Ravensight control room.', 'info');
    };

    const exitRavensightMode = () => {
        setIsRavensightMode(false);
        setCurrentPage('feed');
        addToast('Returned to main app.', 'info');
    };

    const navigateFromRavensight = (targetPage) => {
        const next = String(targetPage || '').trim();
        if (!next) {
            return;
        }

        setIsRavensightMode(false);
        setCurrentPage(next);
    };

    const renderPage = () => {
        const isValidExternalUrl = (value) => {
            if (typeof value !== 'string') return false;
            try {
                const parsed = new URL(value);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch {
                return false;
            }
        };

        const openArticle = (article, fromPage = currentPage) => {
            const shouldRedirectExternally = fromPage !== 'ainews' && isValidExternalUrl(article?.externalUrl);
            if (shouldRedirectExternally) {
                window.location.assign(article.externalUrl);
                return;
            }

            setSelectedArticle(article);
            setArticleBackPage(fromPage);
            localStorage.setItem('wiseSelectedArticle', JSON.stringify(article));
            setCurrentPage('article');
        };

        switch (currentPage) {
            case 'feed':
                return <FeedPage addTruthAlert={addTruthAlert} onNavigate={setCurrentPage} />;
            case 'discover':
                return <DiscoverPage onNavigate={setCurrentPage} />;
            case 'bookmarks':
                return <BookmarksPage />;
            case 'messages':
                return <MessagesPage />;
            case 'notifications':
                return <NotificationsPage />;
            case 'planner':
                return <PlannerPage />;
            case 'truthseeker':
                return <TruthSeeker />;
            case 'ai-assistant':
                return <AiAssistantPage addTruthAlert={addTruthAlert} />;
            case 'ainews':
                return <AINews onOpenArticle={(article) => openArticle(article, 'ainews')} />;
            case 'breakingnews':
                return <BreakingNewsPage onOpenArticle={(article) => openArticle(article, 'breakingnews')} />;
            case 'article':
                return <ArticlePage article={selectedArticle} onBack={() => setCurrentPage(articleBackPage)} />;
            case 'profile':
                return (
                    <ProfilePage
                        openEditMode={profileEditRequested}
                        onEditModeHandled={() => setProfileEditRequested(false)}
                    />
                );
            case 'growth':
                return isAdminUser
                    ? <GrowthPage />
                    : <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>Admin access required.</div>;
            case 'revenue':
                return isAdminUser
                    ? <RevenueConsolePage />
                    : <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>Admin access required.</div>;
            case 'team-access-admin':
                return isAdminUser
                    ? <TeamAccessAdminPage />
                    : <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>Admin access required.</div>;
            case 'facebook-feed':
            case 'tiktok-feed':
            case 'instagram-feed':
            case 'youtube-feed':
            case 'twitter-feed':
            case 'linkedin-feed':
            case 'bluesky-feed':
            case 'social-feeds':
                return canAccessPlatformAggregator
                    ? <FeedPage addTruthAlert={addTruthAlert} onNavigate={setCurrentPage} initialPlatform={currentPage.replace('-feed', '')} />
                    : <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>Platform aggregator access is limited to admin and priveledged users.</div>;
            case 'ravensight':
                return <RavensightVideo onNavigate={navigateFromRavensight} />;
            case 'newsroom-video':
                return <NewsroomRecorderPage onSendToPodcastControlRoom={() => openRavensightWithTab('podcast')} />;
            case 'amateur-journalist':
                return <AmateurJournalistPage onNavigate={setCurrentPage} />;
            case 'canvas':
                return <CanvasPage onNavigate={setCurrentPage} />;
            case 'collaboration':
                return (
                    <ErrorBoundary>
                        <CollaborationPage />
                    </ErrorBoundary>
                );
            case 'team-launchpad':
                return <TeamLaunchpadPage user={user} onNavigate={setCurrentPage} isAdminUser={isAdminUser} />;
            case 'music-rights-studio':
                return isAdminUser
                    ? <MusicRightsStudioPage user={user} onNavigate={setCurrentPage} />
                    : <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>Admin access required.</div>;
            case 'music-player':
                return <MusicStudioPage onNavigate={setCurrentPage} />;
            case 'my-library':
                return <MyLibraryPage onNavigate={setCurrentPage} />;
            case 'instrument-connector':
                return <InstrumentConnectorPage onNavigate={setCurrentPage} />;
            case 'podcast-rights-studio':
                return <PodcastRightsStudioPage user={user} onNavigate={setCurrentPage} />;
            case 'privacy':
                return <PrivacyPolicyPage onBack={() => setCurrentPage('feed')} />;
            case 'terms':
                return <TermsOfServicePage onBack={() => setCurrentPage('feed')} />;
            default:
                return <FeedPage addTruthAlert={addTruthAlert} onNavigate={setCurrentPage} />;
        }
    };

    const renderPublicHome = () => (
        <div className="container" style={{ paddingTop: '32px', paddingBottom: '40px' }}>
            <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '18px',
                padding: '28px',
                background: 'linear-gradient(165deg, rgba(59,130,246,0.12) 0%, rgba(15,23,42,0.03) 100%)'
            }}>
                <h1 style={{ margin: 0, fontSize: '34px', lineHeight: 1.2 }}>WiseRavenShare</h1>
                <p style={{ marginTop: '12px', color: 'var(--light-color)', fontSize: '16px', maxWidth: '880px' }}>
                    WiseRavenShare is a media collaboration and publishing platform where creators can record podcast clips,
                    upload music and video, verify facts with AI-assisted tools, and distribute content across social channels.
                </p>
                <p style={{ marginTop: '10px', color: 'var(--light-color)', fontSize: '15px', maxWidth: '880px' }}>
                    Core features include the Ravensight production studio, collaborative newsroom workflows, social feed management,
                    media libraries, messaging, and compliance-first upload security scanning.
                </p>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
                    <button
                        onClick={() => setCurrentPage('login')}
                        style={{
                            border: '1px solid var(--highlight-color)',
                            background: 'var(--highlight-color)',
                            color: '#fff',
                            padding: '10px 16px',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontWeight: 700
                        }}
                    >
                        Sign In
                    </button>
                    <button
                        onClick={() => setCurrentPage('privacy')}
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)',
                            padding: '10px 16px',
                            borderRadius: '999px',
                            cursor: 'pointer'
                        }}
                    >
                        Privacy Policy
                    </button>
                    <button
                        onClick={() => setCurrentPage('terms')}
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)',
                            padding: '10px 16px',
                            borderRadius: '999px',
                            cursor: 'pointer'
                        }}
                    >
                        Terms of Service
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '14px' }}>
                {[
                    { title: 'Ravensight Studio', body: 'Record podcast and newsroom segments, then move output directly into your content workflow.' },
                    { title: 'Social Distribution', body: 'Prepare and route stories and media to connected social channels from one workspace.' },
                    { title: 'Truth & Verification', body: 'Use truth scoring, contradiction checks, and verification alerts before publishing.' },
                    { title: 'Secure Uploads', body: 'Global malware scanning and media-type validation are enforced on upload requests.' }
                ].map((card) => (
                    <div key={card.title} style={{ border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px', background: 'var(--card-bg)' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px' }}>{card.title}</h2>
                        <p style={{ margin: 0, color: 'var(--light-color)', fontSize: '14px', lineHeight: 1.6 }}>{card.body}</p>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '28px', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '24px', background: 'var(--card-bg)' }}>
                <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '20px' }}>Frequently Asked Questions</h2>
                <div style={{ display: 'grid', gap: '16px' }}>
                    <div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--highlight-color)' }}>What is WiseRavenShare?</h3>
                        <p style={{ margin: 0, color: 'var(--light-color)', fontSize: '14px', lineHeight: 1.6 }}>
                            WiseRavenShare is a public media collaboration platform designed for podcasters, journalists, content creators, and newsrooms to record, upload, verify, and distribute multimedia content securely across the internet and connected social media channels.
                        </p>
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--highlight-color)' }}>Who can use WiseRavenShare?</h3>
                        <p style={{ margin: 0, color: 'var(--light-color)', fontSize: '14px', lineHeight: 1.6 }}>
                            Anyone can create an account to publish podcasts, record newsroom segments, upload music and video, and share stories across social platforms. Sign up is free and open to content creators worldwide.
                        </p>
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--highlight-color)' }}>What are the main features?</h3>
                        <p style={{ margin: 0, color: 'var(--light-color)', fontSize: '14px', lineHeight: 1.6 }}>
                            Ravensight Studio for recording, AI-powered content verification and truth scoring, secure media upload with malware scanning, social distribution tools, collaborative newsroom workflows, and integrated messaging and notification systems.
                        </p>
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--highlight-color)' }}>Is content moderated?</h3>
                        <p style={{ margin: 0, color: 'var(--light-color)', fontSize: '14px', lineHeight: 1.6 }}>
                            Yes. All uploads are scanned for malware as a mandatory security policy. Content is subject to our Terms of Service, and we enforce community guidelines to maintain a safe platform for creators and audiences.
                        </p>
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--highlight-color)' }}>Can I connect social media accounts?</h3>
                        <p style={{ margin: 0, color: 'var(--light-color)', fontSize: '14px', lineHeight: 1.6 }}>
                            Yes. Authenticated users can connect and manage accounts on Facebook, TikTok, Instagram, YouTube, Twitter, LinkedIn, and Bluesky to directly distribute content from WiseRavenShare to those platforms.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderPublicPage = () => {
        if (currentPage === 'privacy') {
            return <PrivacyPolicyPage onBack={() => setCurrentPage('public-home')} />;
        }

        if (currentPage === 'terms') {
            return <TermsOfServicePage onBack={() => setCurrentPage('public-home')} />;
        }

        if (currentPage === 'login') {
            return <LoginPage onAuth={handleLogin} />;
        }

        return renderPublicHome();
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
    }

    if (!isAuthenticated) {
        return renderPublicPage();
    }

    const navItems = [
        { id: 'feed', label: 'Feed' },
        { id: 'discover', label: 'Discover' },
        { id: 'bookmarks', label: 'Bookmarks' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'messages', label: 'Messages' },
        { id: 'planner', label: 'Planner' },
        { id: 'newsroom-video', label: 'Newsroom Video' },
        { id: 'amateur-journalist', label: 'Amateur Journalist' },
        { id: 'canvas', label: 'Canvas Studio' },
        { id: 'team-launchpad', label: 'Team Launchpad' },
        { id: 'collaboration', label: 'Collaborate' },
        { id: 'truthseeker', label: 'Truth Seeker' },
        { id: 'ainews', label: 'AI News' },
        { id: 'ai-assistant', label: 'AI Assistant' },
        { id: 'music-player', label: '🎚️ Music Studio' },
        { id: 'my-library', label: '📚 My Library' },
        { id: 'instrument-connector', label: '🎸 Instrument Connector' },
        { id: 'profile', label: 'Profile' }
    ];

    if (canAccessPlatformAggregator) {
        navItems.splice(2, 0, { id: 'social-feeds', label: 'Social Feeds' });
    }

    if (isAdminUser) {
        navItems.splice(8, 0,
            { id: 'growth', label: 'Growth' },
            { id: 'revenue', label: 'Revenue' },
            { id: 'team-access-admin', label: 'Team Access' },
            { id: 'music-rights-studio', label: 'Music Rights' }
        );
    }

    if (isRavensightMode) {
        return (
            <div>
                <Header onNavigate={navigateToPage} currentPage={currentPage} onLogout={handleLogout} onSponsor={handleSponsor} user={user} />
                <div className="container" style={{ paddingTop: '10px', paddingBottom: '0' }}>
                    <button
                        onClick={exitRavensightMode}
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)',
                            padding: '8px 14px',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        Back To Main App
                    </button>
                </div>
                <div className="container" style={{ paddingTop: '12px' }}>
                    <RavensightVideo onNavigate={navigateFromRavensight} />
                </div>
            </div>
        );
    }

    return (
        <div>
                <Header onNavigate={navigateToPage} currentPage={currentPage} onLogout={handleLogout} onSponsor={handleSponsor} user={user} />
            <TruthAlert alerts={truthAlerts} onDismiss={(id) => setTruthAlerts(prev => prev.filter(a => a.id !== id))} />
            <div className="container" style={{ paddingTop: '10px', paddingBottom: '0' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setCurrentPage(item.id)}
                            style={{
                                border: '1px solid var(--border-color)',
                                background: currentPage === item.id ? 'var(--highlight-color)' : 'var(--card-bg)',
                                color: 'var(--text-color)',
                                padding: '8px 12px',
                                borderRadius: '999px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                    <button
                        onClick={enterRavensightMode}
                        style={{
                            border: '1px solid var(--highlight-color)',
                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }}
                    >
                        Launch Ravensight
                    </button>
                    <button
                        onClick={() => setCommuniqueOpen(true)}
                        style={{
                            border: '1px solid rgba(139,92,246,0.5)',
                            background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }}
                    >
                        🪶 Communiqué
                    </button>
                </div>
            </div>
            <div className="container">
                <div className="grid-3">
                    <Sidebar onNavigate={navigateToPage} currentPage={currentPage} user={user} />
                    <main className="middle-column">
                        {renderPage()}
                    </main>
                    <RightSidebar onNavigate={setCurrentPage} />
                </div>
            </div>
            <RavenCommuniqueModal isOpen={communiqueOpen} onClose={() => setCommuniqueOpen(false)} />
            <footer style={{ textAlign: 'center', padding: '16px 0 24px', fontSize: '12px', color: 'var(--light-color)' }}>
                <button
                    onClick={() => setCurrentPage('privacy')}
                    style={{ background: 'none', border: 'none', color: 'var(--light-color)', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}
                >
                    Privacy Policy
                </button>
                &nbsp;·&nbsp;
                <button
                    onClick={() => setCurrentPage('terms')}
                    style={{ background: 'none', border: 'none', color: 'var(--light-color)', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}
                >
                    Terms of Service
                </button>
                &nbsp;·&nbsp;© {new Date().getFullYear()} NuRaven Corp
            </footer>
        </div>
    );
};

export default App;
