import * as signalR from '@microsoft/signalr';

const baseURL = import.meta.env.VITE_WS_URL || 'http://localhost:5000';

export function createConnection(hubPath) {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${baseURL}/hubs/${hubPath}`, {
      accessTokenFactory: () => localStorage.getItem('nr_token') || '',
      withCredentials: true,
    })
    .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();
}
