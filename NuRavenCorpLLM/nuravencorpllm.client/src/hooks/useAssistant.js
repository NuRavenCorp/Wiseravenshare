// src/hooks/useAssistant.js
import { useEffect, useRef, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import { assistantService } from '../services/assistantService';

export function useAssistant(conversationId) {
    const [messages, setMessages] = useState([]);
    const [streamingText, setStreamingText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const connRef = useRef(null);

    useEffect(() => {
        const conn = new signalR.HubConnectionBuilder()
            .withUrl(`${import.meta.env.VITE_WS_URL}/hubs/assistant`, {
                accessTokenFactory: () => localStorage.getItem('accessToken') || ''
            })
            .withAutomaticReconnect()
            .build();

        conn.on('chunk', (evt) => {
            if (evt.type === 'delta') setStreamingText(prev => prev + (evt.delta || ''));
            if (evt.type === 'done') {
                setMessages(prev => [...prev, evt.message]);
                setStreamingText('');
                setIsThinking(false);
            }
            if (evt.type === 'blocked') { setStreamingText(''); setIsThinking(false); }
        });
        conn.on('transcript', (text) => {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'User', content: text }]);
        });
        conn.on('audio', (b64, mime) => {
            const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: mime });
            const audio = new Audio(URL.createObjectURL(blob));
            audio.play();
        });

        conn.start().then(() => { connRef.current = conn; });
        return () => conn.stop();
    }, []);

    const send = useCallback(async (text, voiceReply = false) => {
        if (!text.trim()) return;
        setIsThinking(true);
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'User', content: text }]);
        await connRef.current?.invoke('SendText', conversationId, text, voiceReply);
    }, [conversationId]);

    const sendAudio = useCallback(async (blob) => {
        const b64 = await blobToBase64(blob);
        await connRef.current?.invoke('SendAudio', conversationId, b64, blob.type);
    }, [conversationId]);

    return { messages, streamingText, isThinking, send, sendAudio };
}

function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}