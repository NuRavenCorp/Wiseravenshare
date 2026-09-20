import { useEffect, useRef, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';

export function useAssistant(conversationId) {
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const connRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken') || '';
    const wsUrl = import.meta.env.VITE_WS_URL || 'wss://api.wiseravenshare.com';
    
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${wsUrl}/hubs/assistant`, {
        accessTokenFactory: () => token,
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
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
      if (evt.type === 'blocked') {
        setStreamingText('');
        setIsThinking(false);
      }
    });

    conn.on('transcript', (text) => {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'User', content: text }]);
    });

    conn.on('audio', (b64, mime) => {
      const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: mime });
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play().catch(err => console.warn('Audio playback failed', err));
    });

    conn.on('error', (error) => {
      console.error('SignalR error:', error);
      setIsThinking(false);
    });

    conn.start().then(() => { connRef.current = conn; }).catch(err => console.error('Connection failed', err));
    
    return () => conn.stop();
  }, []);

  const send = useCallback(async (text, voiceReply = false) => {
    if (!text.trim()) return;
    setIsThinking(true);
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'User', content: text }]);
    try {
      await connRef.current?.invoke('SendText', conversationId, text, voiceReply);
    } catch (error) {
      console.error('SendText failed', error);
      setIsThinking(false);
    }
  }, [conversationId]);

  const sendAudio = useCallback(async (blob) => {
    const b64 = await blobToBase64(blob);
    try {
      setIsThinking(true);
      await connRef.current?.invoke('SendAudio', conversationId, b64, blob.type);
    } catch (error) {
      console.error('SendAudio failed', error);
      setIsThinking(false);
    }
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
