import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { getAuthToken } from './authStorage.js';

const VITE_DEV_PORTS = new Set(['5173', '4173']);

const isAbsoluteUrl = (value = '') => /^https?:\/\//i.test(String(value || '').trim());

const stripApiSegment = (value = '') => String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');

const resolveHubBaseUrl = () => {
    const configuredApi = String(import.meta.env.VITE_API_URL || '').trim();
    const configuredRoot = stripApiSegment(configuredApi);

    if (typeof window !== 'undefined') {
        const host = String(window.location.hostname || '').toLowerCase();
        const isLocalHost = host === 'localhost' || host === '127.0.0.1';
        const isViteDevServer = VITE_DEV_PORTS.has(String(window.location.port || ''));

        // Relative configured API URLs on Vite dev resolve to :5173 and break SignalR hubs.
        if ((isLocalHost || isViteDevServer) && !isAbsoluteUrl(configuredApi)) {
            return 'http://localhost:5242';
        }
    }

    if (configuredRoot) {
        if (isAbsoluteUrl(configuredRoot)) {
            return configuredRoot;
        }

        if (typeof window !== 'undefined' && window.location?.origin) {
            const relativeRoot = configuredRoot.startsWith('/') ? configuredRoot : `/${configuredRoot}`;
            return `${window.location.origin.replace(/\/+$/, '')}${relativeRoot}`;
        }
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin.replace(/\/+$/, '');
    }

    return 'http://localhost:5242';
};

export const createHubConnection = (hubPath) => {
    const base = resolveHubBaseUrl();
    const path = String(hubPath || '').startsWith('/') ? hubPath : `/${hubPath}`;

    return new HubConnectionBuilder()
        .withUrl(`${base}${path}`, {
            accessTokenFactory: () => getAuthToken() || '',
            withCredentials: false
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();
};
