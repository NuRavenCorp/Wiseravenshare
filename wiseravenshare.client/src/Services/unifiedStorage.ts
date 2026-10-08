/**
 * Unified Storage Service
 * Consolidated from utils/storage.js, Services/storage.js, and Services/authStorage.js
 * Supports multiple backends: localStorage, sessionStorage, IndexedDB, memory
 */

type StorageBackend = 'localStorage' | 'sessionStorage' | 'indexedDB' | 'memory';

interface StorageItem<T = any> {
    value: T;
    timestamp: number;
    expiry?: number;
}

class UnifiedStorageService {
    private prefix: string;
    private memoryStore: Map<string, StorageItem> = new Map();
    private hasLS: boolean;
    private hasSS: boolean;

    constructor(prefix = 'wiseraven_') {
        this.prefix = prefix;
        this.hasLS = this._checkLocalStorage();
        this.hasSS = this._checkSessionStorage();
    }

    // ========================================================================
    // CORE STORAGE OPERATIONS
    // ========================================================================

    /**
     * Get value from storage with backend fallback
     * Tries: localStorage -> sessionStorage -> memory fallback
     */
    get<T = any>(key: string, fallback?: T, backend?: StorageBackend): T | null {
        const prefixedKey = this.getKey(key);

        try {
            if (backend === 'memory' || !this.hasLS) {
                return this._getMemory(prefixedKey, fallback);
            }

            const raw = localStorage.getItem(prefixedKey);
            if (!raw) {
                return this._getSessionStorage(prefixedKey, fallback) as T || fallback || null;
            }

            const parsed = JSON.parse(raw) as StorageItem<T>;

            if (parsed.expiry && Date.now() - parsed.timestamp > parsed.expiry) {
                this.remove(key);
                return fallback || null;
            }

            return parsed.value;
        } catch {
            return this._getMemory(prefixedKey, fallback) as T;
        }
    }

    /**
     * Set value in storage (localStorage by default, with memory fallback)
     */
    set<T = any>(key: string, value: T, expiryMinutes?: number, backend?: StorageBackend): boolean {
        const prefixedKey = this.getKey(key);
        const item: StorageItem<T> = {
            value,
            timestamp: Date.now()
        };

        if (expiryMinutes) {
            item.expiry = expiryMinutes * 60 * 1000;
        }

        try {
            if (backend === 'memory') {
                this.memoryStore.set(prefixedKey, item as any);
                return true;
            }

            if (this.hasLS) {
                localStorage.setItem(prefixedKey, JSON.stringify(item));
                return true;
            }

            this.memoryStore.set(prefixedKey, item as any);
            return true;
        } catch {
            this.memoryStore.set(prefixedKey, item as any);
            return false;
        }
    }

    /**
     * Remove key from all storage backends
     */
    remove(key: string): void {
        const prefixedKey = this.getKey(key);

        try {
            if (this.hasLS) {
                localStorage.removeItem(prefixedKey);
            }
        } catch {
            // Ignore
        }

        try {
            if (this.hasSS) {
                sessionStorage.removeItem(prefixedKey);
            }
        } catch {
            // Ignore
        }

        this.memoryStore.delete(prefixedKey);
    }

    /**
     * Clear all items with this prefix
     */
    clear(): void {
        try {
            if (this.hasLS) {
                Object.keys(localStorage)
                    .filter(key => key.startsWith(this.prefix))
                    .forEach(key => localStorage.removeItem(key));
            }
        } catch {
            // Ignore
        }

        try {
            if (this.hasSS) {
                Object.keys(sessionStorage)
                    .filter(key => key.startsWith(this.prefix))
                    .forEach(key => sessionStorage.removeItem(key));
            }
        } catch {
            // Ignore
        }

        Array.from(this.memoryStore.keys())
            .filter(key => key.startsWith(this.prefix))
            .forEach(key => this.memoryStore.delete(key));
    }

    /**
     * Check if key exists
     */
    has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Get all keys with this prefix
     */
    keys(): string[] {
        const keys = new Set<string>();

        try {
            if (this.hasLS) {
                Object.keys(localStorage)
                    .filter(k => k.startsWith(this.prefix))
                    .forEach(k => keys.add(k.slice(this.prefix.length)));
            }
        } catch {
            // Ignore
        }

        Array.from(this.memoryStore.keys())
            .filter(k => k.startsWith(this.prefix))
            .forEach(k => keys.add(k.slice(this.prefix.length)));

        return Array.from(keys);
    }

    /**
     * Get prefixed key
     */
    getKey(key: string): string {
        return `${this.prefix}${key}`;
    }

    // ========================================================================
    // SESSION STORAGE OPERATIONS
    // ========================================================================

    setSession<T = any>(key: string, value: T): boolean {
        const prefixedKey = this.getKey(key);

        try {
            if (this.hasSS) {
                sessionStorage.setItem(prefixedKey, JSON.stringify(value));
                return true;
            }

            this.memoryStore.set(prefixedKey, { value, timestamp: Date.now() } as any);
            return true;
        } catch {
            this.memoryStore.set(prefixedKey, { value, timestamp: Date.now() } as any);
            return false;
        }
    }

    getSession<T = any>(key: string, fallback?: T): T | null {
        const prefixedKey = this.getKey(key);

        try {
            if (this.hasSS) {
                const raw = sessionStorage.getItem(prefixedKey);
                if (raw) {
                    return JSON.parse(raw);
                }
            }
        } catch {
            // Ignore
        }

        const inMemory = this.memoryStore.get(prefixedKey);
        if (inMemory) {
            return inMemory.value as T;
        }

        return fallback || null;
    }

    removeSession(key: string): void {
        const prefixedKey = this.getKey(key);

        try {
            if (this.hasSS) {
                sessionStorage.removeItem(prefixedKey);
            }
        } catch {
            // Ignore
        }

        this.memoryStore.delete(prefixedKey);
    }

    clearSession(): void {
        try {
            if (this.hasSS) {
                Object.keys(sessionStorage)
                    .filter(key => key.startsWith(this.prefix))
                    .forEach(key => sessionStorage.removeItem(key));
            }
        } catch {
            // Ignore
        }

        Array.from(this.memoryStore.keys())
            .forEach(key => this.memoryStore.delete(key));
    }

    // ========================================================================
    // INDEXEDDB OPERATIONS (Large data storage)
    // ========================================================================

    async setIndexedDB<T = any>(storeName: string, key: string, value: T): Promise<boolean> {
        try {
            return await new Promise((resolve) => {
                const request = indexedDB.open(`${this.prefix}db`, 1);

                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName);
                    }
                };

                request.onsuccess = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    const transaction = db.transaction([storeName], 'readwrite');
                    const store = transaction.objectStore(storeName);
                    const putRequest = store.put(value, key);

                    putRequest.onsuccess = () => resolve(true);
                    putRequest.onerror = () => resolve(false);
                };

                request.onerror = () => resolve(false);
            });
        } catch {
            return false;
        }
    }

    async getIndexedDB<T = any>(storeName: string, key: string): Promise<T | null> {
        try {
            return await new Promise((resolve) => {
                const request = indexedDB.open(`${this.prefix}db`, 1);

                request.onsuccess = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    const transaction = db.transaction([storeName], 'readonly');
                    const store = transaction.objectStore(storeName);
                    const getRequest = store.get(key);

                    getRequest.onsuccess = () => resolve(getRequest.result || null);
                    getRequest.onerror = () => resolve(null);
                };

                request.onerror = () => resolve(null);
            });
        } catch {
            return null;
        }
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    private _checkLocalStorage(): boolean {
        try {
            const testKey = `${this.prefix}__test__`;
            localStorage.setItem(testKey, 'true');
            localStorage.removeItem(testKey);
            return true;
        } catch {
            return false;
        }
    }

    private _checkSessionStorage(): boolean {
        try {
            const testKey = `${this.prefix}__test__`;
            sessionStorage.setItem(testKey, 'true');
            sessionStorage.removeItem(testKey);
            return true;
        } catch {
            return false;
        }
    }

    private _getMemory<T = any>(key: string, fallback?: T): T | null {
        const item = this.memoryStore.get(key);
        if (!item) {
            return fallback || null;
        }

        if (item.expiry && Date.now() - item.timestamp > item.expiry) {
            this.memoryStore.delete(key);
            return fallback || null;
        }

        return item.value as T;
    }

    private _getSessionStorage<T = any>(key: string, fallback?: T): T | null {
        try {
            if (!this.hasSS) {
                return null;
            }

            const raw = sessionStorage.getItem(key);
            if (!raw) {
                return null;
            }

            return JSON.parse(raw);
        } catch {
            return null;
        }
    }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

export const storage = new UnifiedStorageService();
export const authStorage = new UnifiedStorageService('wr_auth_');

// ============================================================================
// AUTH TOKEN MANAGEMENT (from deprecated authStorage.js)
// ============================================================================

const AUTH_TOKEN_KEY = 'token';
const LEGACY_TOKEN_KEYS = ['auth_token', 'ws.accessToken', 'wise-raven-token', 'token', 'accessToken'];
const AUTH_COOKIE_NAME = 'wr_auth_token';
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const AUTH_SYNC_STORAGE_KEY = 'sync_key';
const AUTH_SYNC_EVENT_NAME = 'wiseraven:auth-token-changed';

const resolveCookieDomainFlag = (host: string): string => {
    const value = String(host || '').toLowerCase();
    const hostCandidates = [
        value,
        value.replace(/^www\./, ''),
        value.replace(/^app\./, ''),
        value.replace(/^ravensight\./, ''),
        value.replace(/^communique\./, '')
    ];

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

const getWindow = () => (typeof window !== 'undefined' ? window : (globalThis as any));

const readCookie = (): string => {
    const win = getWindow();
    if (!win?.document?.cookie) {
        return '';
    }

    const cookies = win.document.cookie.split(';').map((part: string) => part.trim());
    const match = cookies.find((part: string) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
    if (!match) {
        return '';
    }

    const value = match.substring(AUTH_COOKIE_NAME.length + 1);
    return decodeURIComponent(value || '');
};

const writeCookie = (token: string): void => {
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

const clearCookie = (): void => {
    const win = getWindow();
    if (!win?.document) {
        return;
    }

    const secureFlag = win.location?.protocol === 'https:' ? '; Secure' : '';
    const host = (win.location?.hostname || '').toLowerCase();
    const domainFlag = resolveCookieDomainFlag(host);
    win.document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0${secureFlag}${domainFlag}`;
};

const syncTokenAcrossStorage = (token: string): void => {
    const tokenValue = typeof token === 'string' ? token : token ? String(token) : '';

    for (const key of [AUTH_TOKEN_KEY, ...LEGACY_TOKEN_KEYS]) {
        if (tokenValue) {
            storage.set(key, tokenValue);
            storage.setSession(key, tokenValue);
            authStorage.set(key, tokenValue);
        } else {
            storage.remove(key);
            storage.removeSession(key);
            authStorage.remove(key);
        }
    }

    if (tokenValue) {
        writeCookie(tokenValue);
    } else {
        clearCookie();
    }

    const win = getWindow();
    try {
        storage.set(
            AUTH_SYNC_STORAGE_KEY,
            JSON.stringify({
                at: Date.now(),
                hasToken: Boolean(tokenValue)
            })
        );
    } catch {
        // Ignore
    }

    try {
        win?.dispatchEvent(new CustomEvent(AUTH_SYNC_EVENT_NAME, { detail: { hasToken: Boolean(tokenValue) } }));
    } catch {
        // Ignore
    }
};

export const AUTH_SYNC_EVENT = AUTH_SYNC_EVENT_NAME;
export const AUTH_SYNC_STORAGE_KEY_NAME = AUTH_SYNC_STORAGE_KEY;

export const getAuthToken = (): string => {
    for (const key of [AUTH_TOKEN_KEY, ...LEGACY_TOKEN_KEYS]) {
        const value = storage.get<string>(key) || storage.getSession<string>(key);
        if (value) {
            return value;
        }
    }

    return readCookie();
};

export const setAuthToken = (token: string): void => {
    syncTokenAcrossStorage(token || '');
};

export const clearAuthToken = (): void => {
    syncTokenAcrossStorage('');
};

export const getAdminPassToken = (): string => {
    return storage.get<string>('admin_pass_token') || '';
};

export const setAdminPassToken = (token: string): void => {
    if (token) {
        storage.set('admin_pass_token', token);
    } else {
        storage.remove('admin_pass_token');
    }
};

export const clearAdminPassToken = (): void => {
    storage.remove('admin_pass_token');
};

export default storage;
