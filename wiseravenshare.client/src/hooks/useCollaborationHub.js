// wiseravenshare.client/src/hooks/useCollaborationHub.js
// SignalR hook for the cross-platform collaboration hub
// (/api/hubs/collaboration). Built on the shared createHubConnection factory
// in Services/realtimeHub.js so dev/prod URL resolution stays consistent.

import { useState, useEffect, useCallback, useRef } from 'react';
import { LogLevel } from '@microsoft/signalr';
import { createHubConnection } from '../Services/realtimeHub.js';
import { getAuthToken } from '../Services/authStorage.js';

const HUB_PATH = '/api/hubs/collaboration';

const EVENT_NAMES = [
    'UserConnected', 'UserDisconnected',
    'UserJoined', 'UserLeft', 'RoomJoined',
    'ReceiveMessage', 'UserTyping',
    'FileTransferStarted', 'FileTransferProgress', 'FileTransferComplete', 'FileChunkAcknowledged',
    'PresenceUpdated', 'ExternalBridge'
];

export const useCollaborationHub = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState(null);
    const connectionRef = useRef(null);
    const eventCallbacks = useRef(new Map());
    const startedRef = useRef(false);

    const connect = useCallback(async () => {
        if (!getAuthToken() || startedRef.current) return;

        setIsConnecting(true);
        try {
            const connection = createHubConnection(HUB_PATH);

            for (const eventName of EVENT_NAMES) {
                connection.on(eventName, (data) => {
                    const callbacks = eventCallbacks.current.get(eventName);
                    if (callbacks) callbacks.forEach((fn) => fn(data));
                });
            }

            connection.onreconnecting(() => setIsConnected(false));
            connection.onreconnected(() => setIsConnected(true));
            connection.onclose(() => {
                setIsConnected(false);
                startedRef.current = false;
            });

            await connection.start();
            connectionRef.current = connection;
            startedRef.current = true;
            setIsConnected(true);
            setError(null);
        } catch (err) {
            console.error('Collaboration hub connection failed:', err);
            setError(err?.message || 'Connection failed');
            setIsConnected(false);
            startedRef.current = false;
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const disconnect = useCallback(async () => {
        if (connectionRef.current) {
            try { await connectionRef.current.stop(); } catch { /* ignore */ }
            connectionRef.current = null;
            startedRef.current = false;
            setIsConnected(false);
        }
    }, []);

    const invoke = useCallback(async (method, ...args) => {
        if (!connectionRef.current) throw new Error('Collaboration connection not established');
        return await connectionRef.current.invoke(method, ...args);
    }, []);

    const onEvent = useCallback((eventName, callback) => {
        if (!eventCallbacks.current.has(eventName)) {
            eventCallbacks.current.set(eventName, new Set());
        }
        eventCallbacks.current.get(eventName).add(callback);
        return () => {
            const callbacks = eventCallbacks.current.get(eventName);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) eventCallbacks.current.delete(eventName);
            }
        };
    }, []);

    const createRoom = useCallback((roomName, platform) => invoke('CreateRoom', roomName, platform), [invoke]);
    const joinRoom = useCallback((roomId) => invoke('JoinRoom', roomId), [invoke]);
    const leaveRoom = useCallback((roomId) => invoke('LeaveRoom', roomId), [invoke]);
    const sendMessage = useCallback((roomId, message, type = 'text') =>
        invoke('SendRoomMessage', roomId, message, type), [invoke]);
    const startFileTransfer = useCallback((roomId, fileName, fileSize, fileType) =>
        invoke('StartFileTransfer', roomId, fileName, fileSize, fileType), [invoke]);
    const sendFileChunk = useCallback((transferId, chunk, index, total) =>
        invoke('SendFileChunk', transferId, chunk, index, total), [invoke]);
    const updatePresence = useCallback((status, activity) =>
        invoke('UpdatePresence', status, activity), [invoke]);
    const bridgeToExternalPlatform = useCallback((platform, targetUserId, data) =>
        invoke('BridgeToExternalPlatform', platform, targetUserId, data), [invoke]);

    useEffect(() => {
        connect();
        return () => { disconnect(); };
    }, [connect, disconnect]);

    return {
        isConnected,
        isConnecting,
        error,
        connection: connectionRef.current,
        connect,
        disconnect,
        onEvent,
        invoke,
        createRoom,
        joinRoom,
        leaveRoom,
        sendMessage,
        startFileTransfer,
        sendFileChunk,
        updatePresence,
        bridgeToExternalPlatform
    };
};
