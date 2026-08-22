import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../Services/Auth.jsx';
import { socialGraphService } from '../Services/SocialGraph';
import { compressAvatarImage } from '../utils/avatarUtils';

const getConnection = (feeds, ...keys) => {
    const source = feeds || {};
    for (const key of keys) {
        if (source[key]) {
            return source[key];
        }
    }
    return {};
};

const normalizeSocialFeeds = (socialFeeds) => {
    const feeds = socialFeeds || {};

    const mapConnection = (connection) => ({
        enabled: Boolean(connection?.enabled),
        username: String(connection?.username || '').trim(),
        profileUrl: String(connection?.profileUrl || '').trim(),
        feedUrl: String(connection?.feedUrl || '').trim()
    });

    return {
        tikTok: mapConnection(getConnection(feeds, 'tikTok', 'tiktok', 'TikTok')),
        facebook: mapConnection(getConnection(feeds, 'facebook', 'Facebook')),
        instagram: mapConnection(getConnection(feeds, 'instagram', 'Instagram'))
    };
};

const normalizeUser = (user) => {
    if (!user || typeof user !== 'object') {
        return user;
    }

    const avatar = user.avatar || user.avatarUrl || user.photoURL || '';
    const avatarUrl = user.avatarUrl || user.avatar || user.photoURL || '';
    const name = user.name || user.displayName || user.username || '';
    const displayName = user.displayName || user.name || user.username || '';

    return {
        ...user,
        name,
        displayName,
        avatar,
        avatarUrl,
        socialFeeds: normalizeSocialFeeds(user.socialFeeds)
    };
};

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        const handleAuthExpired = () => {
            clearAuthState();
            setError('Your session expired. Please sign in again.');
        };

        window.addEventListener('wiseraven:auth-expired', handleAuthExpired);
        return () => window.removeEventListener('wiseraven:auth-expired', handleAuthExpired);
    }, []);

    const clearAuthState = () => {
        authService.clearToken();
        authService.clearUser();
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('wiseSocialFeeds');
        localStorage.removeItem('ws.accessToken');
        localStorage.removeItem('wise-raven-token');
        setUser(null);
        window.dispatchEvent(new Event('wiseraven:social-updated'));
    };

    const checkAuth = async () => {
        try {
            const token = authService.getToken();
            if (token) {
                const userData = normalizeUser(await authService.verifyToken(token));
                setUser(userData);
                localStorage.setItem('user_data', JSON.stringify(userData));
                localStorage.setItem('wiseSocialFeeds', JSON.stringify(userData?.socialFeeds || {}));
                window.dispatchEvent(new Event('wiseraven:social-updated'));
            } else {
                clearAuthState();
            }
        } catch (err) {
            console.error('Auth check failed:', err);
            const status = err?.status || err?.response?.status || 0;
            if (status === 401 || status === 403) {
                clearAuthState();
                setError('Your session is no longer valid. Please sign in again.');
                return;
            }

            const cachedUser = authService.getUser();
            const hasToken = Boolean(authService.getToken());
            if (cachedUser && hasToken) {
                const normalizedCachedUser = normalizeUser(cachedUser);
                setUser(normalizedCachedUser);
                localStorage.setItem('user_data', JSON.stringify(normalizedCachedUser));
                localStorage.setItem('wiseSocialFeeds', JSON.stringify(normalizedCachedUser?.socialFeeds || {}));
                window.dispatchEvent(new Event('wiseraven:social-updated'));
                setError('Unable to validate your session right now. Some actions may be unavailable until connectivity recovers.');
            } else {
                clearAuthState();
            }
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authService.login(email, password);
            const normalizedUser = normalizeUser(response.user);
            setUser(normalizedUser);
            authService.setToken(response.token);
            localStorage.setItem('user_data', JSON.stringify(normalizedUser));
            localStorage.setItem('wiseSocialFeeds', JSON.stringify(normalizedUser?.socialFeeds || {}));
            window.dispatchEvent(new Event('wiseraven:social-updated'));
            return { ...response, user: normalizedUser };
        } catch (err) {
            clearAuthState();
            setError(err?.message || 'Authentication failed.');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const register = async (userData) => {
        setLoading(true);
        setError(null);
        try {
            let response = await authService.register(userData);
            if (!response?.token && userData?.email && userData?.password) {
                // Some environments complete account creation but omit token payloads.
                response = await authService.login(userData.email, userData.password);
            }
            const normalizedUser = normalizeUser(response.user);
            setUser(normalizedUser);
            authService.setToken(response.token);
            localStorage.setItem('user_data', JSON.stringify(normalizedUser));
            localStorage.setItem('wiseSocialFeeds', JSON.stringify(normalizedUser?.socialFeeds || {}));
            window.dispatchEvent(new Event('wiseraven:social-updated'));
            return { ...response, user: normalizedUser };
        } catch (err) {
            clearAuthState();
            setError(err?.message || 'Registration failed.');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const acceptTeamInvite = async ({ inviteToken, email, password, name }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authService.acceptTeamInvite({ inviteToken, email, password, name });
            const normalizedUser = normalizeUser(response.user);
            setUser(normalizedUser);
            authService.setToken(response.token);
            localStorage.setItem('user_data', JSON.stringify(normalizedUser));
            localStorage.setItem('wiseSocialFeeds', JSON.stringify(normalizedUser?.socialFeeds || {}));
            window.dispatchEvent(new Event('wiseraven:social-updated'));
            return { ...response, user: normalizedUser };
        } catch (err) {
            clearAuthState();
            setError(err?.message || 'Team invite sign-in failed.');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            await authService.logout();
        } finally {
            clearAuthState();
        }
    };

    const updateProfile = async (updates) => {
        setLoading(true);
        setError(null);
        try {
            let avatarVal = updates?.avatar || updates?.avatarUrl || user?.avatar || user?.avatarUrl || '';
            if (avatarVal && typeof avatarVal === 'string' && avatarVal.startsWith('data:image/')) {
                try {
                    avatarVal = await compressAvatarImage(avatarVal, 180, 60000);
                } catch {
                    /* fallback if compression fails */
                }
            }

            const payload = {
                ...updates,
                avatar: avatarVal,
                avatarUrl: avatarVal
            };

            let updatedUser = null;
            try {
                const apiResult = await authService.updateProfile(user.id, payload);
                updatedUser = normalizeUser(apiResult);
            } catch (apiErr) {
                console.warn('Backend updateProfile endpoint call failed, updating profile locally:', apiErr);
                updatedUser = normalizeUser({
                    ...user,
                    ...payload,
                    avatar: avatarVal,
                    avatarUrl: avatarVal
                });
                authService.setUser(updatedUser);
            }

            setUser(updatedUser);
            try {
                localStorage.setItem('user_data', JSON.stringify(updatedUser));
            } catch (err) {
                console.warn('Failed to save user_data to localStorage:', err);
            }
            try {
                localStorage.setItem('wiseSocialFeeds', JSON.stringify(updatedUser?.socialFeeds || {}));
            } catch (err) {
                console.warn('Failed to save wiseSocialFeeds to localStorage:', err);
            }

            socialGraphService.syncProfileAcrossStorage(updatedUser);
            window.dispatchEvent(new Event('wiseraven:social-updated'));
            return updatedUser;
        } catch (err) {
            setError(err?.message || 'Profile update failed.');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const value = {
        user,
        loading,
        error,
        login,
        register,
        acceptTeamInvite,
        logout,
        updateProfile,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};