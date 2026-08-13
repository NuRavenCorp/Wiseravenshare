import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { getAuthToken } from './authStorage.js';

const resolveHubBaseUrl = () => {
    const configuredApi = String(import.meta.env.VITE_API_URL || '').trim();

    if (configuredApi) {
        return configuredApi
            .replace(/\/+$/, '')
            .replace(/\/api$/i, '');
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
            accessTokenFactory: () => getAuthToken() || ''
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();
};
