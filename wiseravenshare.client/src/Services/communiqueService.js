// wiseravenshare.client/src/Services/communiqueService.js
// RavenCommunique — Twilio SMS / WhatsApp / Voice API client

const COMMUNIQUE_BASE_URL =
    import.meta?.env?.VITE_COMMUNIQUE_URL ||
    'https://communique.wiseravenshare.com';

const getAuthHeader = () => {
    try {
        const raw = localStorage.getItem('wiseAuthToken') || sessionStorage.getItem('wiseAuthToken');
        return raw ? { Authorization: `Bearer ${raw}` } : {};
    } catch {
        return {};
    }
};

const post = async (path, body) => {
    const res = await fetch(`${COMMUNIQUE_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader()
        },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
    }
    return data;
};

/** Send an SMS via Twilio */
export const sendSms = (to, message) =>
    post('/api/communique/sms', { to, message });

/** Send a WhatsApp message via Twilio */
export const sendWhatsApp = (to, message) =>
    post('/api/communique/whatsapp', { to, message });

/** Unified send — channel: 'sms' | 'whatsapp' | 'voice' */
export const sendCommunique = (channel, to, message) =>
    post('/api/communique/send', { channel, to, message });
