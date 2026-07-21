import api from './api';

class AuthService {
    buildAuthFallbackBases() {
        const bases = [];
        const primaryBase = (api?.defaults?.baseURL || '').replace(/\/+$/, '');
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const ravensightUrl = (import.meta.env.VITE_RAVENSIGHT_API_URL || '').trim();

        if (primaryBase) {
            bases.push(primaryBase);
        }

        if (origin) {
            bases.push(origin);
        }

        if (ravensightUrl) {
            const trimmed = ravensightUrl.replace(/\/+$/, '');
            const withoutRavensight = trimmed.replace(/\/api\/ravensight$/i, '');
            if (withoutRavensight) {
                bases.push(withoutRavensight);
            }
        }

        // Local development fallbacks for common ASP.NET launch profiles.
        if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/i.test(window.location.hostname)) {
            bases.push('http://localhost:5242');
            bases.push('https://localhost:7146');
        }

        return [...new Set(bases.filter(Boolean))];
    }

    async postAuthWithFallback(path, payload = {}, options = {}) {
        const bases = this.buildAuthFallbackBases();
        const attempts = [];

        const requestOnce = async (url, headers = {}) => {
            return fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: JSON.stringify(payload)
            });
        };

        // Try conventional /api/auth path first, then /auth path as compatibility fallback.
        for (const base of bases) {
            const normalizedBase = base.replace(/\/+$/, '');
            attempts.push(`${normalizedBase}/auth${path}`);
            if (!/\/api$/i.test(normalizedBase)) {
                attempts.push(`${normalizedBase}/api/auth${path}`);
            }
        }

        const token = this.getToken();
        let lastError = null;

        for (const url of attempts) {
            try {
                const response = await requestOnce(url, token ? { Authorization: `Bearer ${token}` } : {});
                if (response.ok) {
                    return await response.json();
                }

                if (response.status !== 404) {
                    const body = await response.json().catch(() => ({}));
                    const error = new Error(body?.message || 'Server error');
                    error.status = response.status;
                    throw error;
                }

                lastError = { status: 404 };
            } catch (error) {
                if (error?.status && error.status !== 404) {
                    throw error;
                }
                lastError = error;
            }
        }

        const err = new Error('Authentication service is currently unavailable. Please try again.');
        err.status = lastError?.status || 0;
        throw err;
    }

    async login(email, password) {
        try {
            const response = await this.postAuthWithFallback('/login', { email, password });
            if (response.token) {
                this.setToken(response.token);
                this.setUser(response.user);
            }
            return response;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async register(userData) {
        try {
            const response = await this.postAuthWithFallback('/register', userData);
            if (response.token) {
                this.setToken(response.token);
                this.setUser(response.user);
            }
            return response;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async logout() {
        try {
            await this.postAuthWithFallback('/logout', {});
        } finally {
            this.clearToken();
            this.clearUser();
        }
    }

    async verifyToken(token) {
        try {
            const response = await this.postAuthWithFallback('/verify', { token });
            if (response.valid) {
                this.setUser(response.user);
                return response.user;
            }
            throw new Error('Invalid token');
        } catch (error) {
            if (error?.response?.status === 401 || error?.response?.status === 403 || error?.status === 401 || error?.status === 403) {
                this.clearToken();
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
            await api.post('/auth/change-password', { currentPassword, newPassword });
            return true;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async requestPasswordReset(email) {
        try {
            return await this.postAuthWithFallback('/forgot-password', { email });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async resetPassword(token, newPassword) {
        try {
            return await this.postAuthWithFallback('/reset-password', { token, newPassword });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    setToken(token) {
        localStorage.setItem('auth_token', token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    getToken() {
        return localStorage.getItem('auth_token');
    }

    clearToken() {
        localStorage.removeItem('auth_token');
        delete api.defaults.headers.common['Authorization'];
    }

    setUser(user) {
        localStorage.setItem('user_data', JSON.stringify(user));
    }

    getUser() {
        const userData = localStorage.getItem('user_data');
        return userData ? JSON.parse(userData) : null;
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