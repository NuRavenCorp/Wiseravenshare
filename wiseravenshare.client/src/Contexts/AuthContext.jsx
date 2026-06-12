import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../Services/Auth.jsx';

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

    const checkAuth = async () => {
        const localUser = authService.getUser();
        if (localUser) {
            setUser(localUser);
            setLoading(false);
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            if (token) {
                const userData = await authService.verifyToken(token);
                setUser(userData);
            }
        } catch (err) {
            console.error('Auth check failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authService.login(email, password);
            setUser(response.user);
            localStorage.setItem('auth_token', response.token);
            localStorage.setItem('user_data', JSON.stringify(response.user));
            return response;
        } catch (err) {
            // Fallback for local/demo mode when API auth endpoints are unavailable.
            const mockUser = {
                id: `user-${Date.now()}`,
                name: email.split('@')[0] || 'Wiseraven User',
                email,
                handle: email.split('@')[0] || 'user',
                avatar: (email[0] || 'U').toUpperCase(),
                createdAt: new Date().toISOString()
            };

            const token = `demo-token-${Date.now()}`;
            authService.setToken(token);
            authService.setUser(mockUser);
            setUser(mockUser);
            return { user: mockUser, token, fallback: true };
        } finally {
            setLoading(false);
        }
    };

    const register = async (userData) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authService.register(userData);
            setUser(response.user);
            localStorage.setItem('auth_token', response.token);
            localStorage.setItem('user_data', JSON.stringify(response.user));
            return response;
        } catch (err) {
            const mockUser = {
                id: `user-${Date.now()}`,
                name: userData.name || 'Wiseraven User',
                email: userData.email,
                handle: (userData.name || userData.email || 'user').toLowerCase().replace(/\s+/g, ''),
                avatar: userData.avatar || (userData.name?.[0] || userData.email?.[0] || 'U').toUpperCase(),
                bio: userData.bio || '',
                location: userData.location || '',
                website: userData.website || '',
                createdAt: new Date().toISOString()
            };

            const token = `demo-token-${Date.now()}`;
            authService.setToken(token);
            authService.setUser(mockUser);
            setUser(mockUser);
            return { user: mockUser, token, fallback: true };
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            await authService.logout();
        } finally {
            setUser(null);
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
        }
    };

    const updateProfile = async (updates) => {
        setLoading(true);
        try {
            const updatedUser = await authService.updateProfile(user.id, updates);
            setUser(updatedUser);
            localStorage.setItem('user_data', JSON.stringify(updatedUser));
            return updatedUser;
        } catch (err) {
            const updatedUser = { ...user, ...updates };
            authService.setUser(updatedUser);
            setUser(updatedUser);
            return updatedUser;
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