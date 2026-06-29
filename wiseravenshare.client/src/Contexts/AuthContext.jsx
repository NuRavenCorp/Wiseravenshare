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
        try {
            const token = localStorage.getItem('auth_token');
            if (token) {
                const userData = await authService.verifyToken(token);
                let canonicalUser = userData;
                try {
                    const profile = await authService.getProfile();
                    if (profile) {
                        canonicalUser = profile;
                    }
                } catch {
                    // Fallback to verify payload when profile endpoint is unavailable.
                }

                setUser(canonicalUser);
                localStorage.setItem('user_data', JSON.stringify(canonicalUser));
            } else {
                clearAuthState();
            }
        } catch (err) {
            console.error('Auth check failed:', err);
            clearAuthState();
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authService.login(email, password);
            let userData = response.user;
            try {
                const profile = await authService.getProfile();
                if (profile) {
                    userData = profile;
                }
            } catch {
                // Keep login flow resilient if profile lookup fails.
            }

            setUser(userData);
            localStorage.setItem('auth_token', response.token);
            localStorage.setItem('user_data', JSON.stringify(userData));
            return response;
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
            let canonicalUser = response.user;
            try {
                const profile = await authService.getProfile();
                if (profile) {
                    canonicalUser = profile;
                }
            } catch {
                // Keep registration flow resilient if profile lookup fails.
            }

            setUser(canonicalUser);
            localStorage.setItem('auth_token', response.token);
            localStorage.setItem('user_data', JSON.stringify(canonicalUser));
            return response;
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
        try {
            const updatedUser = await authService.updateProfile(user.id, updates);
            setUser(updatedUser);
            localStorage.setItem('user_data', JSON.stringify(updatedUser));
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