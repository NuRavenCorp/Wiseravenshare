import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../Services/Auth.jsx';

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

    return {
        ...user,
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

    const clearAuthState = () => {
        authService.clearToken();
        authService.clearUser();
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('wiseSocialFeeds');
        setUser(null);
        window.dispatchEvent(new Event('wiseraven:social-updated'));
    };

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem('auth_token');
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
            const cachedUser = authService.getUser();
            const hasToken = Boolean(localStorage.getItem('auth_token'));
            if (cachedUser && hasToken) {
                const normalizedCachedUser = normalizeUser(cachedUser);
                setUser(normalizedCachedUser);
                localStorage.setItem('user_data', JSON.stringify(normalizedCachedUser));
                localStorage.setItem('wiseSocialFeeds', JSON.stringify(normalizedCachedUser?.socialFeeds || {}));
                window.dispatchEvent(new Event('wiseraven:social-updated'));
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
            localStorage.setItem('auth_token', response.token);
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
            const response = await authService.register(userData);
            const normalizedUser = normalizeUser(response.user);
            setUser(normalizedUser);
            localStorage.setItem('auth_token', response.token);
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
            const updatedUser = normalizeUser(await authService.updateProfile(user.id, updates));
            setUser(updatedUser);
            localStorage.setItem('user_data', JSON.stringify(updatedUser));
            localStorage.setItem('wiseSocialFeeds', JSON.stringify(updatedUser?.socialFeeds || {}));
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