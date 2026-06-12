class StorageService {
    constructor(prefix = 'wiseraven_') {
        this.prefix = prefix;
    }

    getKey(key) {
        return `${this.prefix}${key}`;
    }

    set(key, value, expiryMinutes = null) {
        const item = {
            value: value,
            timestamp: Date.now()
        };

        if (expiryMinutes) {
            item.expiry = expiryMinutes * 60 * 1000;
        }

        localStorage.setItem(this.getKey(key), JSON.stringify(item));
    }

    get(key) {
        const item = localStorage.getItem(this.getKey(key));
        if (!item) return null;

        try {
            const parsed = JSON.parse(item);

            if (parsed.expiry) {
                const isExpired = Date.now() - parsed.timestamp > parsed.expiry;
                if (isExpired) {
                    this.remove(key);
                    return null;
                }
            }

            return parsed.value;
        } catch {
            return null;
        }
    }

    remove(key) {
        localStorage.removeItem(this.getKey(key));
    }

    clear() {
        Object.keys(localStorage)
            .filter(key => key.startsWith(this.prefix))
            .forEach(key => localStorage.removeItem(key));
    }

    has(key) {
        return this.get(key) !== null;
    }

    // Session storage methods
    setSession(key, value) {
        sessionStorage.setItem(this.getKey(key), JSON.stringify(value));
    }

    getSession(key) {
        const item = sessionStorage.getItem(this.getKey(key));
        return item ? JSON.parse(item) : null;
    }

    removeSession(key) {
        sessionStorage.removeItem(this.getKey(key));
    }

    clearSession() {
        Object.keys(sessionStorage)
            .filter(key => key.startsWith(this.prefix))
            .forEach(key => sessionStorage.removeItem(key));
    }

    // IndexedDB methods for large data
    async setIndexedDB(storeName, key, value) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(`${this.prefix}db`, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const putRequest = store.put(value, key);

                putRequest.onsuccess = () => resolve(true);
                putRequest.onerror = () => reject(putRequest.error);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async getIndexedDB(storeName, key) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(`${this.prefix}db`, 1);

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const getRequest = store.get(key);

                getRequest.onsuccess = () => resolve(getRequest.result);
                getRequest.onerror = () => reject(getRequest.error);
            };

            request.onerror = () => reject(request.error);
        });
    }
}

export const storage = new StorageService();