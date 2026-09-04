const AUTH_TOKEN_KEY = 'auth_token';
const ADMIN_PASS_TOKEN_KEY = 'admin_pass_token';
const LEGACY_TOKEN_KEYS = ['ws.accessToken', 'wise-raven-token'];
const AUTH_COOKIE_NAME = 'wr_auth_token';
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const resolveCookieDomainFlag = (host) => {
    const value = String(host || '').toLowerCase();
    if (value === 'wise-ravens.com' || value === 'www.wise-ravens.com' || value.endsWith('.wise-ravens.com')) {
        return '; Domain=.wise-ravens.com';
    }

    if (value === 'wiseravenshare.com' || value === 'www.wiseravenshare.com' || value.endsWith('.wiseravenshare.com')) {
        return '; Domain=.wiseravenshare.com';
    }

    return '';
};

const getWindow = () => (typeof window !== 'undefined' ? window : globalThis);

const getStorage = () => {
    const win = getWindow();
    return win?.localStorage || null;
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

export const getAuthToken = () => {
    const storage = getStorage();
    const storageToken = storage?.getItem(AUTH_TOKEN_KEY);
    if (storageToken) {
        return storageToken;
    }

    for (const key of LEGACY_TOKEN_KEYS) {
        const legacyToken = storage?.getItem(key);
        if (legacyToken) {
            return legacyToken;
        }
    }

    return readCookie();
};

export const setAuthToken = (token) => {
    const storage = getStorage();
    if (storage) {
        storage.setItem(AUTH_TOKEN_KEY, token);
        for (const key of LEGACY_TOKEN_KEYS) {
            storage.setItem(key, token);
        }
    }

    if (token) {
        writeCookie(token);
    } else {
        clearCookie();
    }
};

export const clearAuthToken = () => {
    const storage = getStorage();
    if (storage) {
        storage.removeItem(AUTH_TOKEN_KEY);
        for (const key of LEGACY_TOKEN_KEYS) {
            storage.removeItem(key);
        }
    }

    clearCookie();
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
