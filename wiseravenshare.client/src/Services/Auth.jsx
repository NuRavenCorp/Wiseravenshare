import api from './api';

class AuthService {
    async login(email, password) {
        try {
            const response = await api.post('/auth/login', { email, password });
            if (response.data.token) {
                this.setToken(response.data.token);
                this.setUser(response.data.user);
            }
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async register(userData) {
        try {
            const response = await api.post('/auth/register', userData);
            if (response.data.token) {
                this.setToken(response.data.token);
                this.setUser(response.data.user);
            }
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async logout() {
        try {
            await api.post('/auth/logout');
        } finally {
            this.clearToken();
            this.clearUser();
        }
    }

    async verifyToken(token) {
        try {
            const response = await api.post('/auth/verify', { token });
            if (response.data.valid) {
                return response.data.user;
            }
            throw new Error('Invalid token');
        } catch (error) {
            this.clearToken();
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
            await api.post('/auth/forgot-password', { email });
            return true;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async resetPassword(token, newPassword) {
        try {
            await api.post('/auth/reset-password', { token, newPassword });
            return true;
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
            return new Error(error.response.data.message || 'Server error');
        } else if (error.request) {
            return new Error('Network error - please check your connection');
        } else {
            return error;
        }
    }

    isAuthenticated() {
        return !!this.getToken() && !!this.getUser();
    }
}

export const authService = new AuthService();