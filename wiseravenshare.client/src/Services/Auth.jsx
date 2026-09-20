import api from './api';
import { getAuthToken, getAdminPassToken, setAuthToken, setAdminPassToken, clearAuthToken, clearAdminPassToken } from './authStorage.js';

const DEFAULT_AUTH_REQUEST_TIMEOUT_MS = 30000;
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const AUTH_V2_PREFIX = '/auth-v2';

const getConnection = (feeds, ...keys) => {
    const source = feeds || {};
    for (const key of keys) {
        if (source[key]) {
            return source[key];
        }
    }
    return {};
};

const normalizeConnection = (connection) => ({
    enabled: Boolean(connection?.enabled),
    username: String(connection?.username || '').trim(),
    profileUrl: String(connection?.profileUrl || '').trim(),
    feedUrl: String(connection?.feedUrl || '').trim(),
    designation: String(connection?.designation || '').trim()
});

const hasMeaningfulFeeds = (socialFeeds) => {
    if (!socialFeeds || typeof socialFeeds !== 'object') return false;
    return Object.values(socialFeeds).some(conn =>
        conn && typeof conn === 'object' &&
        (Boolean(conn.username) || Boolean(conn.enabled) || Boolean(conn.profileUrl) || Boolean(conn.feedUrl))
    );
};

const normalizeSocialFeeds = (socialFeeds) => {
    const feeds = socialFeeds || {};
    return {
        tikTok: normalizeConnection(getConnection(feeds, 'tikTok', 'tiktok', 'TikTok')),
        facebook: normalizeConnection(getConnection(feeds, 'facebook', 'Facebook')),
        instagram: normalizeConnection(getConnection(feeds, 'instagram', 'Instagram')),
        // ASP.NET Core camelCase serializes YouTube → youTube; check all variants
        youtube: normalizeConnection(getConnection(feeds, 'youtube', 'youTube', 'YouTube')),
        twitter: normalizeConnection(getConnection(feeds, 'twitter', 'Twitter')),
        linkedIn: normalizeConnection(getConnection(feeds, 'linkedIn', 'linkedin', 'LinkedIn')),
        bluesky: normalizeConnection(getConnection(feeds, 'bluesky', 'Bluesky'))
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

class AuthService {
    constructor() {
        const token = this.getToken();
        if (token) {
            api.defaults.headers.common.Authorization = `Bearer ${token}`;
        }

        const adminPassToken = this.getAdminPassToken();
        if (adminPassToken) {
            api.defaults.headers.common['X-Admin-Pass-Token'] = adminPassToken;
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
        const adminPassToken = source.adminPassToken || source.AdminPassToken || '';
        const user = normalizeUser(source.user || source.User || null);

        return {
            ...source,
            token,
            refreshToken,
            adminPassToken,
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
            headers,
            withCredentials: true
        });

        return response?.data ?? {};
    }

    async postAuthV2(path, payload = {}, options = {}) {
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_AUTH_REQUEST_TIMEOUT_MS;
        const token = this.getToken();
        const headers = {
            ...(options.withAuth && token ? { Authorization: `Bearer ${token}` } : {})
        };

        const response = await api.post(`${AUTH_V2_PREFIX}${path}`, payload, {
            timeout: timeoutMs,
            headers,
            withCredentials: true
        });

        return response?.data ?? {};
    }

    async getStatus() {
        try {
            const response = await api.get(`${AUTH_V2_PREFIX}/status`, {
                timeout: DEFAULT_AUTH_REQUEST_TIMEOUT_MS
            });

            return response?.data ?? {};
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async login(email, password) {
        try {
            return await this.legacyLogin(email, password);
        } catch (error) {
            if ((!error?.response && error?.message?.includes('Network')) || (error?.code === 'ERR_NETWORK' && !error?.response)) {
                const networkError = new Error('The backend API is unavailable or unreachable. Start the ASP.NET server and retry.');
                networkError.status = 0;
                networkError.cause = error;
                throw networkError;
            }

            throw this.handleError(error);
        }
    }

    async register(userData) {
        try {
            return await this.legacyRegister(userData);
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async acceptTeamInvite({ inviteToken, email, password, name }) {
        try {
            const response = this.normalizeAuthResponse(await this.postAuth('/team-access/accept', {
                inviteToken,
                email,
                password,
                name
            }));

            if (!response.token) {
                const err = new Error('Team invite acceptance did not return an authentication token.');
                err.status = 500;
                throw err;
            }

            this.setToken(response.token);
            this.setRefreshToken(response.refreshToken);
            this.setAdminPassToken(response.adminPassToken);
            this.setUser(response.user);
            return response;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async createTeamInvite(payload) {
        try {
            return await this.postAuth('/team-access/invites', payload, { withAuth: true });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async createPrearrangedTeamToken(payload) {
        try {
            return await this.postAuth('/team-access/prearrange', payload, { withAuth: true });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async revokeTeamInvite(inviteId, reason = '') {
        try {
            return await this.postAuth(`/team-access/invites/${encodeURIComponent(inviteId)}/revoke`, { reason }, { withAuth: true });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async setTeamMemberStatus(email, active, reason = '') {
        try {
            return await this.postAuth(`/team-access/members/${encodeURIComponent(email)}/status`, { active: Boolean(active), reason }, { withAuth: true });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getTeamAccessSnapshot() {
        try {
            const token = this.getToken();
            const response = await api.get('/auth/team-access', {
                timeout: DEFAULT_AUTH_REQUEST_TIMEOUT_MS,
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            return response?.data ?? {};
        } catch (error) {
            throw this.handleError(error);
        }
    }

    decodeTokenPayload() {
        const token = this.getToken();
        if (!token || token.split('.').length < 2) {
            return null;
        }

        try {
            const [, payloadSegment] = token.split('.');
            const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
            const json = decodeURIComponent(
                atob(normalized)
                    .split('')
                    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
                    .join('')
            );

            return JSON.parse(json);
        } catch {
            return null;
        }
    }

    buildPodcastControlFallbackState() {
        const payload = this.decodeTokenPayload() || {};
        const accessScope = String(payload.access_scope || '').trim().toLowerCase() || 'team';
        const rawRole = String(
            payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
            || payload.role
            || ''
        ).trim().toLowerCase();

        const normalizeRole = (value) => {
            if (value === 'owner') return 'owner';
            if (value === 'producer') return 'producer';
            if (value === 'host') return 'host';
            if (value === 'editor') return 'editor';
            if (value === 'script lead' || value === 'script_lead' || value === 'script-lead') return 'script-lead';
            return 'guest';
        };

        const role = normalizeRole(rawRole);
        const canGoLive = role === 'owner' || role === 'producer' || role === 'host';
        const canEditScript = role !== 'guest';
        const canAssignShots = role === 'owner' || role === 'producer' || role === 'host' || role === 'editor' || role === 'script-lead';
        const canApproveSegments = role === 'owner' || role === 'producer' || role === 'editor' || role === 'script-lead';

        return {
            accessScope,
            teamRole: role,
            effectiveRole: role,
            allowedRoles: role === 'owner'
                ? ['owner', 'producer', 'host', 'editor', 'script-lead', 'guest']
                : [role],
            permissions: {
                canGoLive,
                canEditScript,
                canAssignShots,
                canApproveSegments,
                canSwitchMonitors: canAssignShots,
                canManageGuests: role === 'owner' || role === 'producer'
            },
            policyVersion: 'podcast-control-fallback-v1',
            syncedAtUtc: new Date().toISOString(),
            isFallback: true
        };
    }

    async getPodcastControlState() {
        try {
            const token = this.getToken();
            const response = await api.get('/auth/team-access/podcast-control-state', {
                timeout: DEFAULT_AUTH_REQUEST_TIMEOUT_MS,
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            return {
                ...(response?.data ?? {}),
                isFallback: false
            };
        } catch (error) {
            const fallback = this.buildPodcastControlFallbackState();
            if (fallback?.effectiveRole) {
                return fallback;
            }

            throw this.handleError(error);
        }
    }

    async requestPodcastControlRole(requestedRole) {
        try {
            return await this.postAuth('/team-access/podcast-control-role', { requestedRole }, { withAuth: true });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getSharedPodcastScript(roomId = 'main') {
        try {
            const token = this.getToken();
            const response = await api.get('/auth/team-access/podcast-shared-script', {
                timeout: DEFAULT_AUTH_REQUEST_TIMEOUT_MS,
                params: { roomId },
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            return response?.data ?? {};
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async sharePodcastScript(payload) {
        try {
            return await this.postAuth('/team-access/podcast-shared-script', payload, { withAuth: true });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getPodcastSessionSnapshot(roomId = 'main') {
        try {
            const token = this.getToken();
            const response = await api.get('/auth/team-access/podcast-session-snapshot', {
                timeout: DEFAULT_AUTH_REQUEST_TIMEOUT_MS,
                params: { roomId },
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            return response?.data ?? {};
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async savePodcastSessionSnapshot(payload) {
        try {
            return await this.postAuth('/team-access/podcast-session-snapshot', payload, { withAuth: true });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getPodcastTeamSelection(roomId = 'main') {
        try {
            const token = this.getToken();
            const response = await api.get('/auth/team-access/podcast-team-selection', {
                timeout: DEFAULT_AUTH_REQUEST_TIMEOUT_MS,
                params: { roomId },
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            return response?.data ?? {};
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async savePodcastTeamSelection(payload) {
        try {
            return await this.postAuth('/team-access/podcast-team-selection', payload, { withAuth: true });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async issueAdminPassToken() {
        try {
            const response = await this.postAuth('/admin-pass', {}, { withAuth: true });
            const token = response?.adminPassToken || '';
            if (token) {
                this.setAdminPassToken(token);
            }
            return response;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async logout() {
        try {
            await this.postAuthV2('/logout', {}, { withAuth: true });
        } finally {
            this.clearToken();
            this.clearRefreshToken();
            this.clearUser();
        }
    }

    async refreshSession() {
        const refreshToken = this.getRefreshToken();
        const payload = refreshToken ? { refreshToken } : {};

        const response = this.normalizeAuthResponse(await this.postAuthV2('/refresh-token', payload));
        if (!response.token) {
            const err = new Error('Session refresh did not return an access token.');
            err.status = 401;
            throw err;
        }

        this.setToken(response.token);
        this.setRefreshToken(response.refreshToken || refreshToken || '');
        this.setAdminPassToken(response.adminPassToken || this.getAdminPassToken() || '');
        if (response.user) {
            this.setUser(response.user);
        }

        return response;
    }

    async verifyToken(token) {
        try {
            const response = this.normalizeAuthResponse(await this.postAuthV2('/verify', { token }, { withAuth: true }));
            if (response.valid && response.user) {
                this.setUser(response.user);
                return response.user;
            }

            const err = new Error(response.message || 'Invalid token');
            err.status = 401;
            throw err;
        } catch (error) {
            const status = Number(error?.response?.status || error?.status || 0);
            if (status === 401 || status === 403) {
                try {
                    await this.refreshSession();
                    const refreshedToken = this.getToken();
                    if (!refreshedToken) {
                        throw error;
                    }

                    const retryResponse = this.normalizeAuthResponse(await this.postAuthV2('/verify', { token: refreshedToken }, { withAuth: true }));
                    if (retryResponse.valid && retryResponse.user) {
                        this.setUser(retryResponse.user);
                        return retryResponse.user;
                    }

                    throw error;
                } catch {
                    this.clearToken();
                    this.clearRefreshToken();
                    this.clearUser();
                    throw this.handleError(error);
                }
            }

            const cachedUser = this.getUser();
            const payload = this.decodeTokenPayload() || {};
            const fallbackUser = {
                ...(cachedUser || {}),
                id: cachedUser?.id || payload.sub || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] || '',
                email: cachedUser?.email || payload.email || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || '',
                username: cachedUser?.username || payload.unique_name || payload.name || payload.preferred_username || '',
                name: cachedUser?.name || cachedUser?.displayName || payload.name || payload.unique_name || payload.preferred_username || '',
                displayName: cachedUser?.displayName || cachedUser?.name || payload.name || payload.unique_name || payload.preferred_username || '',
                avatar: cachedUser?.avatar || cachedUser?.avatarUrl || payload.avatar || payload.picture || '',
                avatarUrl: cachedUser?.avatarUrl || cachedUser?.avatar || payload.avatar || payload.picture || ''
            };

            const normalizedFallbackUser = this.normalizeUser(fallbackUser);
            if (normalizedFallbackUser && (normalizedFallbackUser.id || normalizedFallbackUser.email || normalizedFallbackUser.username)) {
                this.setUser(normalizedFallbackUser);
                return normalizedFallbackUser;
            }

            throw this.handleError(error);
        }
    }

    async updateProfile(userId, updates) {
        try {
            const response = await api.put(`/users/${userId}`, updates);
            const normalized = normalizeUser(response.data);
            this.setUser(normalized);
            return normalized;
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

    async legacyLogin(email, password) {
        const normalizedLogin = this.normalizeLoginIdentifier(email);
        const response = this.normalizeAuthResponse(await this.postAuthV2('/login', {
            email: normalizedLogin,
            usernameOrEmail: normalizedLogin,
            password
        }));
        if (!response.token) {
            const err = new Error('Authentication token was not returned by the server.');
            err.status = 500;
            throw err;
        }

        this.setToken(response.token);
        this.setRefreshToken(response.refreshToken);
        this.setAdminPassToken(response.adminPassToken);
        this.setUser(response.user);
        return response;
    }

    normalizeLoginIdentifier(value) {
        const text = String(value || '').trim();
        if (!text) {
            return '';
        }

        if (text.startsWith('@')) {
            return text.slice(1).trim();
        }

        return text;
    }

    async legacyRegister(userData) {
        const response = this.normalizeAuthResponse(await this.postAuthV2('/register', userData));
        if (response.token) {
            this.setToken(response.token);
            this.setRefreshToken(response.refreshToken);
            this.setAdminPassToken(response.adminPassToken);
            this.setUser(response.user);
        }

        return response;
    }

    getSocialLoginStartUrl(providerId, returnUrl) {
        const provider = String(providerId || '').trim().toLowerCase();
        const baseUrl = String(api?.defaults?.baseURL || '').trim();
        const safeReturnUrl = String(returnUrl || '').trim();

        if (!provider) {
            throw new Error('Social provider is required.');
        }

        const callbackPath = `/auth/oauth/${encodeURIComponent(provider)}/start`;
        const query = safeReturnUrl ? `?returnUrl=${encodeURIComponent(safeReturnUrl)}` : '';

        if (/^https?:\/\//i.test(baseUrl)) {
            return `${baseUrl.replace(/\/+$/, '')}${callbackPath}${query}`;
        }

        if (typeof window !== 'undefined') {
            const root = baseUrl.startsWith('/')
                ? `${window.location.origin}${baseUrl}`
                : `${window.location.origin}/${baseUrl}`;
            return `${root.replace(/\/+$/, '')}${callbackPath}${query}`;
        }

        return `/api${callbackPath}${query}`;
    }

    async socialLogin(providerId, returnUrl) {
        const provider = String(providerId || '').trim().toLowerCase();

        if (typeof window !== 'undefined') {
            window.location.assign(this.getSocialLoginStartUrl(provider, returnUrl));
        }

        return null;
    }

    setToken(token) {
        setAuthToken(token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    setAdminPassToken(token) {
        setAdminPassToken(token || '');
        if (token) {
            api.defaults.headers.common['X-Admin-Pass-Token'] = token;
        } else {
            delete api.defaults.headers.common['X-Admin-Pass-Token'];
        }
    }

    getAdminPassToken() {
        return getAdminPassToken();
    }

    getToken() {
        return getAuthToken();
    }

    clearToken() {
        clearAuthToken();
        clearAdminPassToken();
        this.clearRefreshToken();
        delete api.defaults.headers.common['Authorization'];
        delete api.defaults.headers.common['X-Admin-Pass-Token'];
    }

    isAdminAllAccess() {
        const payload = this.decodeTokenPayload() || {};
        const accessScope = String(payload.access_scope || '').trim().toLowerCase();
        const claim = String(payload.admin_pass || '').trim().toLowerCase();
        return Boolean(this.getAdminPassToken()) || accessScope === 'admin' || claim === 'all-access';
    }

    setUser(user) {
        if (!user) {
            this.clearUser();
            return;
        }

        // When the server omits socialFeeds (e.g. verify/refresh endpoints), preserve
        // whatever was previously cached so we don't wipe saved connections on reload.
        const existing = this.getUser();
        const userToStore = (!hasMeaningfulFeeds(user.socialFeeds) && hasMeaningfulFeeds(existing?.socialFeeds))
            ? { ...user, socialFeeds: existing.socialFeeds }
            : user;

        localStorage.setItem('user_data', JSON.stringify(normalizeUser(userToStore)));
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
            const data = error.response.data;
            const message = (data && typeof data === 'object')
                ? (data.message || data.error || data.title || data.detail || (typeof data.errors === 'object' ? Object.values(data.errors).flat().join(' ') : null))
                : (typeof data === 'string' && data.trim() ? data : null);
            const err = new Error(message || (error.response.status === 401 ? 'Invalid email or password.' : 'Authentication failed.'));
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