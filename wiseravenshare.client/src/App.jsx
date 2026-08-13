import React, { useMemo, useState, useEffect } from 'react';
import Header from './Components/Common/Header';
import Sidebar from './Components/Common/Sidebar';
import RightSidebar from './Components/Common/RightSidebar';
import TruthAlert from './Components/Common/TruthAlert';
import FeedPage from './Pages/FeedPage';
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
import PrivacyPolicyPage from './Pages/PrivacyPolicyPage';
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

const App = () => {
    const [currentPage, setCurrentPage] = useState(() =>
        window.location.pathname === '/privacy' ? 'privacy' : 'feed'
    );
    const [isRavensightMode, setIsRavensightMode] = useState(false);
    const [truthAlerts, setTruthAlerts] = useState([]);
    const [selectedArticle, setSelectedArticle] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('wiseSelectedArticle') || 'null');
        } catch {
            return null;
        }
    });
    const [articleBackPage, setArticleBackPage] = useState('ainews');
    const { user, isAuthenticated, loading, login, register, logout } = useAuth();
    const { addToast } = useNotification();
    const adminEmails = useMemo(() => parseAdminEmails(), []);
    const isAdminUser = useMemo(() => {
        const email = String(user?.email || '').trim().toLowerCase();
        return email.length > 0 && adminEmails.has(email);
    }, [adminEmails, user?.email]);

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

    const handleLogin = async ({ mode, name, email, password, bio, location, website, avatar, referralCode }) => {
        if (mode === 'signup') {
            await register({ name, email, password, bio, location, website, avatar, referralCode });
            addToast('Account created successfully.', 'success');
            setCurrentPage('profile');
            addToast('You are signed in. Finish your profile on this page.', 'info');
            return;
        }

        await login(email, password);
        addToast('Signed in successfully.', 'success');
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

    const exitRavensightMode = () => {
        setIsRavensightMode(false);
        setCurrentPage('feed');
        addToast('Returned to main app.', 'info');
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
            case 'ainews':
                return <AINews onOpenArticle={(article) => openArticle(article, 'ainews')} />;
            case 'breakingnews':
                return <BreakingNewsPage onOpenArticle={(article) => openArticle(article, 'breakingnews')} />;
            case 'article':
                return <ArticlePage article={selectedArticle} onBack={() => setCurrentPage(articleBackPage)} />;
            case 'profile':
                return <ProfilePage />;
            case 'growth':
                return isAdminUser
                    ? <GrowthPage />
                    : <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>Admin access required.</div>;
            case 'revenue':
                return isAdminUser
                    ? <RevenueConsolePage />
                    : <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>Admin access required.</div>;
            case 'ravensight':
                return <RavensightVideo />;
            case 'privacy':
                return <PrivacyPolicyPage onBack={() => setCurrentPage('feed')} />;
            default:
                return <FeedPage addTruthAlert={addTruthAlert} onNavigate={setCurrentPage} />;
        }
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
    }

    if (!isAuthenticated) {
        return <LoginPage onAuth={handleLogin} />;
    }

    const navItems = [
        { id: 'feed', label: 'Feed' },
        { id: 'discover', label: 'Discover' },
        { id: 'bookmarks', label: 'Bookmarks' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'messages', label: 'Messages' },
        { id: 'planner', label: 'Planner' },
        { id: 'truthseeker', label: 'Truth Seeker' },
        { id: 'ainews', label: 'AI News' },
        { id: 'profile', label: 'Profile' }
    ];

    if (isAdminUser) {
        navItems.splice(8, 0, { id: 'growth', label: 'Growth' }, { id: 'revenue', label: 'Revenue' });
    }

    if (isRavensightMode) {
        return (
            <div>
                <Header onNavigate={setCurrentPage} currentPage={currentPage} onLogout={handleLogout} onSponsor={handleSponsor} user={user} />
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
                    <RavensightVideo />
                </div>
            </div>
        );
    }

    return (
        <div>
            <Header onNavigate={setCurrentPage} currentPage={currentPage} onLogout={handleLogout} onSponsor={handleSponsor} user={user} />
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
                </div>
            </div>
            <div className="container">
                <div className="grid-3">
                    <Sidebar onNavigate={setCurrentPage} currentPage={currentPage} user={user} />
                    <main className="middle-column">
                        {renderPage()}
                    </main>
                    <RightSidebar onNavigate={setCurrentPage} />
                </div>
            </div>
            <footer style={{ textAlign: 'center', padding: '16px 0 24px', fontSize: '12px', color: 'var(--light-color)' }}>
                <button
                    onClick={() => setCurrentPage('privacy')}
                    style={{ background: 'none', border: 'none', color: 'var(--light-color)', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}
                >
                    Privacy Policy
                </button>
                &nbsp;·&nbsp;© {new Date().getFullYear()} NuRaven Corp
            </footer>
        </div>
    );
};

export default App;

