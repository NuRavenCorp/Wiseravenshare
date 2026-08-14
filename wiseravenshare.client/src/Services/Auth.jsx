import api from './api';
import { getAuthToken, setAuthToken, clearAuthToken } from './authStorage.js';

const DEFAULT_AUTH_REQUEST_TIMEOUT_MS = 12000;
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

class AuthService {
    constructor() {
        const token = this.getToken();
        if (token) {
            api.defaults.headers.common.Authorization = `Bearer ${token}`;
        }
    }

    getRefreshToken() {
        try {
            return localStorage.getItem(REFRESH_TOKEN_KEY) || '';
        } catch {
            return '';
        }
    }

    setRefreshToken(token) {
        try {
            if (token) {
                localStorage.setItem(REFRESH_TOKEN_KEY, token);
            } else {
                localStorage.removeItem(REFRESH_TOKEN_KEY);
            }
        } catch {
            // Ignore storage failures for refresh token.
        }
    }

    clearRefreshToken() {
        this.setRefreshToken('');
    }

    normalizeAuthResponse(payload) {
        const source = payload && typeof payload === 'object' ? payload : {};
        const token = source.token || source.accessToken || source.AccessToken || source.jwt || '';
        const refreshToken = source.refreshToken || source.RefreshToken || '';
        const user = source.user || source.User || null;

        return {
            ...source,
            token,
            refreshToken,
            user
        };
    }

    async postAuth(path, payload = {}, options = {}) {
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_AUTH_REQUEST_TIMEOUT_MS;
        const token = this.getToken();
        const headers = {
            ...(options.withAuth && token ? { Authorization: `Bearer ${token}` } : {})
        };

        const response = await api.post(`/auth${path}`, payload, {
            timeout: timeoutMs,
            headers
        });

        return response?.data ?? {};
    }

    async login(email, password) {
        try {
            const response = this.normalizeAuthResponse(await this.postAuth('/login', { email, password }));
            if (!response.token) {
                const err = new Error('Authentication token was not returned by the server.');
                err.status = 500;
                throw err;
            }

            this.setToken(response.token);
            this.setRefreshToken(response.refreshToken);
            this.setUser(response.user);
            return response;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async register(userData) {
        try {
            const response = this.normalizeAuthResponse(await this.postAuth('/register', userData));
            if (response.token) {
                this.setToken(response.token);
                this.setRefreshToken(response.refreshToken);
                this.setUser(response.user);
            }

            return response;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async logout() {
        try {
            await this.postAuth('/logout', {}, { withAuth: true });
        } finally {
            this.clearToken();
            this.clearRefreshToken();
            this.clearUser();
        }
    }

    async verifyToken(token) {
        try {
            const response = this.normalizeAuthResponse(await this.postAuth('/verify', { token }, { withAuth: true }));
            if (response.valid && response.user) {
                this.setUser(response.user);
                return response.user;
            }

            const err = new Error(response.message || 'Invalid token');
            err.status = 401;
            throw err;
        } catch (error) {
            if (error?.response?.status === 401 || error?.response?.status === 403 || error?.status === 401 || error?.status === 403) {
                this.clearToken();
                this.clearRefreshToken();
                this.clearUser();
            }
            throw this.handleError(error);
        }
    }

    async updateProfile(userId, updates) {
        try {
            const response = await api.put(`/users/${userId}`, updates);
            this.setUser(response.data);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async changePassword(currentPassword, newPassword) {
        try {
            await this.postAuth('/change-password', { currentPassword, newPassword }, { withAuth: true });
            return true;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async requestPasswordReset(email) {
        try {
            return await this.postAuth('/forgot-password', { email });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async resetPassword(token, newPassword) {
        try {
            return await this.postAuth('/reset-password', { token, newPassword });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    setToken(token) {
        setAuthToken(token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    getToken() {
        return getAuthToken();
    }

    clearToken() {
        clearAuthToken();
        this.clearRefreshToken();
        delete api.defaults.headers.common['Authorization'];
    }

    setUser(user) {
        if (!user) {
            this.clearUser();
            return;
        }

        localStorage.setItem('user_data', JSON.stringify(user));
    }

    getUser() {
        try {
            const userData = localStorage.getItem('user_data');
            return userData ? JSON.parse(userData) : null;
        } catch {
            return null;
        }
    }

    clearUser() {
        localStorage.removeItem('user_data');
    }

    handleError(error) {
        if (error.response) {
            const err = new Error(error.response.data.message || 'Server error');
            err.status = error.response.status;
            return err;
        } else if (error?.status) {
            const err = new Error(error.message || 'Server error');
            err.status = error.status;
            return err;
        } else if (error?.code === 'ECONNABORTED') {
            const err = new Error('Authentication request timed out. Please retry.');
            err.status = 0;
            return err;
        } else if (error.request) {
            const err = new Error('Network error - please check your connection');
            err.status = 0;
            return err;
        } else {
            return error;
        }
    }

    isAuthenticated() {
        return !!this.getToken() && !!this.getUser();
    }
}

export const authService = new AuthService();