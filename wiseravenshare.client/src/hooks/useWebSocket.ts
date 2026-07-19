// src/hooks/useWebSocket.ts
import { useEffect, useRef, useState } from 'react';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';

export const useWebSocket = (url: string) => {
    const [connection, setConnection] = useState<HubConnection | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const connectionRef = useRef<HubConnection | null>(null);

    useEffect(() => {
        const connect = async () => {
            try {
                const hubConnection = new HubConnectionBuilder()
                    .withUrl(url)
                    .withAutomaticReconnect()
                    .build();

                await hubConnection.start();
                setConnection(hubConnection);
                setIsConnected(true);
                connectionRef.current = hubConnection;

                hubConnection.onreconnecting(() => {
                    setIsConnected(false);
                });

                hubConnection.onreconnected(() => {
                    setIsConnected(true);
                });

                hubConnection.onclose(() => {
                    setIsConnected(false);
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Connection failed');
                setIsConnected(false);
            }
        };

        connect();

        return () => {
            if (connectionRef.current) {
                connectionRef.current.stop();
            }
        };
    }, [url]);

    return { connection, isConnected, error };
};