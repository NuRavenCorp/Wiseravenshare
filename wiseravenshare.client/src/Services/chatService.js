import { getAuthToken } from './authStorage.js';

const API_BASE = '/api/conversations';

async function fetchJson(url, options = {}) {
    const token = getAuthToken();
    const res = await fetch(url, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers
        },
        ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
}

/** Get a short-lived Twilio Conversations JWT for the current user */
export const getConversationsToken = () =>
    fetchJson(`${API_BASE}/token`);

/** Create a 1-on-1 conversation room between current user and participantIdentity */
export const createConversationRoom = (participantIdentity, friendlyName) =>
    fetchJson(`${API_BASE}/room`, {
        method: 'POST',
        body: JSON.stringify({ participantIdentity, friendlyName })
    });
