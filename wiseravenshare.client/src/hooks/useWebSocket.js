import { useState, useEffect, useCallback, useRef } from 'react';

export const useWebSocket = (url, options = {}) => {
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState(null);
    const [error, setError] = useState(null);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(url);

            ws.onopen = () => {
                setIsConnected(true);
                setError(null);
                options.onOpen?.();
            };

            ws.onclose = () => {
                setIsConnected(false);
                options.onClose?.();

                // Auto-reconnect
                if (options.reconnect !== false) {
                    reconnectTimeoutRef.current = setTimeout(connect, options.reconnectInterval || 3000);
                }
            };

            ws.onerror = (err) => {
                setError(err);
                options.onError?.(err);
            };

            ws.onmessage = (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch {
                    data = event.data;
                }
                setLastMessage(data);
                options.onMessage?.(data);
            };

            wsRef.current = ws;
        } catch (err) {
            setError(err);
            options.onError?.(err);
        }
    }, [url, options]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsConnected(false);
    }, []);

    const sendMessage = useCallback((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            wsRef.current.send(message);
            return true;
        }
        return false;
    }, []);

    useEffect(() => {
        connect();
        return disconnect;
    }, [connect, disconnect]);

    return {
        isConnected,
        lastMessage,
        error,
        sendMessage,
        disconnect,
        connect
    };
};