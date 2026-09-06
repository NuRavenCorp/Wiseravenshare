// wiseravenshare.client/src/Services/communiqueService.js
// RavenCommunique — Twilio SMS / WhatsApp / Voice API client

import { getAuthToken } from './authStorage';

// Use the same origin as the main API — never a separate communique subdomain.
const resolveCommuniqueApiBase = () => {
    const configured = (import.meta?.env?.VITE_API_URL || '').trim().replace(/\/+$/, '');
    if (configured) {
        return `${configured.replace(/\/api$/i, '')}/api`;
    }
    if (typeof window !== 'undefined') {
        const host = (window.location.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://localhost:5242/api';
        }
        return `${window.location.origin}/api`;
    }
    return '/api';
};

const COMMUNIQUE_BASE_URL = resolveCommuniqueApiBase();

const getAuthHeader = () => {
    try {
        const raw = getAuthToken();
        return raw ? { Authorization: `Bearer ${raw}` } : {};
    } catch {
        return {};
    }
};

const request = async (path, init = {}) => {
    const res = await fetch(`${COMMUNIQUE_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
            ...(init.headers || {})
        },
        ...init
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
    }
    return data;
};

const post = async (path, body) =>
    request(path, {
        method: 'POST',
        body: JSON.stringify(body)
    });

/** Send an SMS via Twilio */
export const sendSms = (to, message) =>
    post('/communique/sms', { to, message });

/** Send a WhatsApp message via Twilio */
export const sendWhatsApp = (to, message) =>
    post('/communique/whatsapp', { to, message });

/** Unified send — channel: 'sms' | 'whatsapp' | 'voice' */
export const sendCommunique = (channel, to, message) =>
    post('/communique/send', { channel, to, message });

/** Start phone verification — channel: 'sms' | 'whatsapp' */
export const startCommuniqueVerification = (to, channel = 'sms') =>
    post('/communique/verify/start', { to, channel });

/** Check a phone verification code */
export const checkCommuniqueVerification = (to, code) =>
    post('/communique/verify/check', { to, code });

/** Aggregated recent dispatches across SMS/WhatsApp/Voice */
export const getCommuniqueMessages = async ({ channel = '', limit = 20 } = {}) => {
    const query = new URLSearchParams();
    if (channel) query.set('channel', channel);
    if (Number.isFinite(limit) && limit > 0) query.set('limit', String(Math.floor(limit)));
    const suffix = query.toString() ? `?${query.toString()}` : '';

    return request(`/communique/messages${suffix}`, {
        method: 'GET'
    });
};
