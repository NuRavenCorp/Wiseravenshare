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

    const clearAuthState = () => {
        authService.clearToken();
        authService.clearUser();
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        setUser(null);
    };

    const checkAuth = async () => {
        const token = localStorage.getItem('auth_token');
        const localUser = authService.getUser();

        if (!token) {
            clearAuthState();
            setLoading(false);
            return;
        }

        // Keep the local session available while token verification runs.
        if (localUser) {
            setUser(localUser);
        }

        try {
            const userData = await authService.verifyToken(token);
            setUser(userData);
        } catch (err) {
            console.error('Auth check failed:', err);
            if (err?.status === 401) {
                clearAuthState();
            }
            else if (localUser) {
                setUser(localUser);
            }
            else {
                clearAuthState();
            }
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        setError(null);
        try {
            const response = await authService.login(email, password);
            setUser(response.user);
            localStorage.setItem('auth_token', response.token);
            localStorage.setItem('user_data', JSON.stringify(response.user));
            return response;
        } catch (err) {
            clearAuthState();
            setError(err?.message || 'Authentication failed.');
            throw err;
        }
    };

    const register = async (userData) => {
        setError(null);
        try {
            const response = await authService.register(userData);
            setUser(response.user);
            localStorage.setItem('auth_token', response.token);
            localStorage.setItem('user_data', JSON.stringify(response.user));
            return response;
        } catch (err) {
            clearAuthState();
            setError(err?.message || 'Registration failed.');
            throw err;
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