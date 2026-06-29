import React, { useState, useEffect } from 'react';
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
import { EvolutionEngine } from './Components/Evolution/EvolutionEngine';
import { useAuth } from './Contexts/AuthContext';
import { useNotification } from './Contexts/NotificationContext';
import './Styles/Global.css';

const App = () => {
    const [currentPage, setCurrentPage] = useState('feed');
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

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }

        const engine = EvolutionEngine.getInstance();
        engine.initialize().catch((error) => {
            console.error('Failed to initialize Evolution Engine:', error);
        });

        return () => {
            engine.destroy();
        };
    }, [isAuthenticated]);

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

    const handleLogin = async ({ mode, name, email, password, bio, location, website, avatar }) => {
        if (mode === 'signup') {
            await register({ name, email, password, bio, location, website, avatar });
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
                return <FeedPage addTruthAlert={addTruthAlert} />;
            case 'discover':
                return <DiscoverPage />;
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
            case 'ravensight':
                return <RavensightVideo />;
            default:
                return <FeedPage addTruthAlert={addTruthAlert} />;
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

    if (isRavensightMode) {
        return (
            <div>
                <Header onNavigate={setCurrentPage} currentPage={currentPage} onLogout={handleLogout} user={user} />
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
            <Header onNavigate={setCurrentPage} currentPage={currentPage} onLogout={handleLogout} user={user} />
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
        </div>
    );
};

export default App;

