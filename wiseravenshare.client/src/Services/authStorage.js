const AUTH_TOKEN_KEY = 'wr_auth_token';
const ADMIN_PASS_TOKEN_KEY = 'admin_pass_token';
const LEGACY_TOKEN_KEYS = ['auth_token', 'ws.accessToken', 'wise-raven-token', 'token'];
const AUTH_COOKIE_NAME = 'wr_auth_token';
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const resolveCookieDomainFlag = (host) => {
    const value = String(host || '').toLowerCase();
    const hostCandidates = [value, value.replace(/^www\./, ''), value.replace(/^app\./, ''), value.replace(/^ravensight\./, ''), value.replace(/^communique\./, '')];

    for (const candidate of hostCandidates) {
        if (candidate === 'wise-ravens.com' || candidate.endsWith('.wise-ravens.com')) {
            return '; Domain=.wise-ravens.com';
        }

        if (candidate === 'wiseravenshare.com' || candidate.endsWith('.wiseravenshare.com')) {
            return '; Domain=.wiseravenshare.com';
        }
    }

    return '';
};

const getWindow = () => (typeof window !== 'undefined' ? window : globalThis);

const getStorage = () => {
    const win = getWindow();
    try {
        return win?.localStorage || null;
    } catch {
        return null;
    }
};

const getSessionStorage = () => {
    const win = getWindow();
    try {
        return win?.sessionStorage || null;
    } catch {
        return null;
    }
};

const getPersistedTokenKeys = () => [AUTH_TOKEN_KEY, ...LEGACY_TOKEN_KEYS];

const readStorageValue = (storage, key) => {
    if (!storage) {
        return '';
    }

    try {
        return String(storage.getItem(key) || '');
    } catch {
        return '';
    }
};

const writeStorageValue = (storage, key, value) => {
    if (!storage) {
        return;
    }

    try {
        if (value) {
            storage.setItem(key, value);
        } else {
            storage.removeItem(key);
        }
    } catch {
        // Ignore storage failures. The cookie remains the durable fallback.
    }
};

const readCookie = () => {
    const win = getWindow();
    if (!win?.document?.cookie) {
        return '';
    }

    const cookies = win.document.cookie.split(';').map((part) => part.trim());
    const match = cookies.find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
    if (!match) {
        return '';
    }

    const value = match.substring(AUTH_COOKIE_NAME.length + 1);
    return decodeURIComponent(value || '');
};

const writeCookie = (token) => {
    const win = getWindow();
    if (!win?.document) {
        return;
    }

    const secureFlag = win.location?.protocol === 'https:' ? '; Secure' : '';
    const sameSiteFlag = '; SameSite=Lax';
    const host = (win.location?.hostname || '').toLowerCase();
    const domainFlag = resolveCookieDomainFlag(host);

    const cookieValue = encodeURIComponent(token);
    const cookie = `${AUTH_COOKIE_NAME}=${cookieValue}; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}${sameSiteFlag}${secureFlag}${domainFlag}`;
    win.document.cookie = cookie;
};

const clearCookie = () => {
    const win = getWindow();
    if (!win?.document) {
        return;
    }

    const secureFlag = win.location?.protocol === 'https:' ? '; Secure' : '';
    const host = (win.location?.hostname || '').toLowerCase();
    const domainFlag = resolveCookieDomainFlag(host);
    win.document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0${secureFlag}${domainFlag}`;
};

const syncTokenAcrossStorage = (token) => {
    const storage = getStorage();
    const sessionStorage = getSessionStorage();
    const tokenValue = typeof token === 'string' ? token : token ? String(token) : '';

    for (const key of getPersistedTokenKeys()) {
        writeStorageValue(storage, key, tokenValue);
        writeStorageValue(sessionStorage, key, tokenValue);
    }

    if (tokenValue) {
        writeCookie(tokenValue);
    } else {
        clearCookie();
    }
};

export const getAuthToken = () => {
    const storage = getStorage();
    const sessionStorage = getSessionStorage();

    for (const key of getPersistedTokenKeys()) {
        const value = readStorageValue(storage, key) || readStorageValue(sessionStorage, key);
        if (value) {
            return value;
        }
    }

    return readCookie();
};

export const setAuthToken = (token) => {
    syncTokenAcrossStorage(token || '');
};

export const clearAuthToken = () => {
    syncTokenAcrossStorage('');
};

export const getAdminPassToken = () => {
    const storage = getStorage();
    return storage?.getItem(ADMIN_PASS_TOKEN_KEY) || '';
};

export const setAdminPassToken = (token) => {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    if (token) {
        storage.setItem(ADMIN_PASS_TOKEN_KEY, token);
    } else {
        storage.removeItem(ADMIN_PASS_TOKEN_KEY);
    }
};

export const clearAdminPassToken = () => {
    const storage = getStorage();
    storage?.removeItem(ADMIN_PASS_TOKEN_KEY);
};
