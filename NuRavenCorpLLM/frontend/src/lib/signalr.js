import * as signalR from '@microsoft/signalr';

const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000';
const baseURL = import.meta.env.VITE_WS_URL || defaultOrigin;

export function createConnection(hubPath) {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${baseURL}/hubs/${hubPath}`, {
      accessTokenFactory: () => localStorage.getItem('nr_token') || '',
      withCredentials: false,
    })
    .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();
}
