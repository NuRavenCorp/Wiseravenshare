// src/App.tsx
import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './styles/ThemeProvider';
import { GlobalStyles } from './styles/GlobalStyles';
import { AuthProvider } from './contexts/AuthContext';
import { TruthProvider } from './contexts/TruthContext';
import { EvolutionProvider } from './contexts/EvolutionContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { LoadingScreen } from './components/common/LoadingScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Lazy load pages
const HomePage = lazy(() => import('./pages/HomePage'));
const FeedPage = lazy(() => import('./pages/FeedPage'));
const TruthSeekerPage = lazy(() => import('./pages/TruthSeekerPage'));
const RavenSightPage = lazy(() => import('./pages/RavenSightPage'));
const PlannerPage = lazy(() => import('./pages/PlannerPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const EvolutionDashboard = lazy(() => import('./pages/EvolutionDashboard'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            cacheTime: 1000 * 60 * 30,
            retry: 3,
            refetchOnWindowFocus: false,
        },
    },
});

const App: React.FC = () => {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js');
            });
        }
    }, []);

    return (
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider>
                    <GlobalStyles />
                    <BrowserRouter>
                        <AuthProvider>
                            <WebSocketProvider>
                                <TruthProvider>
                                    <EvolutionProvider>
                                        <Suspense fallback={<LoadingScreen />}>
                                            <AnimatePresence mode="wait">
                                                <Routes>
                                                    <Route path="/" element={<HomePage />} />
                                                    <Route path="/feed" element={<FeedPage />} />
                                                    <Route path="/truth" element={<TruthSeekerPage />} />
                                                    <Route path="/ravensight" element={<RavenSightPage />} />
                                                    <Route path="/planner" element={<PlannerPage />} />
                                                    <Route path="/profile/:userId?" element={<ProfilePage />} />
                                                    <Route path="/messages" element={<MessagesPage />} />
                                                    <Route path="/notifications" element={<NotificationsPage />} />
                                                    <Route path="/evolution" element={<EvolutionDashboard />} />
                                                    <Route path="/settings" element={<SettingsPage />} />
                                                    <Route path="*" element={<Navigate to="/" replace />} />
                                                </Routes>
                                            </AnimatePresence>
                                        </Suspense>
                                    </EvolutionProvider>
                                </TruthProvider>
                            </WebSocketProvider>
                        </AuthProvider>
                    </BrowserRouter>
                    <Toaster
                        position="top-right"
                        toastOptions={{
                            duration: 4000,
                            style: {
                                background: 'var(--card-bg)',
                                color: 'var(--text-color)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                            },
                        }}
                    />
                    {import.meta.env.DEV && <ReactQueryDevtools />}
                </ThemeProvider>
            </QueryClientProvider>
        </ErrorBoundary>
    );
};

export default App;