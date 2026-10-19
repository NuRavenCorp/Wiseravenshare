import { useEffect, useRef, useState, useCallback } from 'react';
import { createConnection } from '../lib/signalr';

export function useConversation(conversationId) {
  const [events, setEvents] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [done, setDone] = useState(null);
  const connRef = useRef(null);

  useEffect(() => {
    const conn = createConnection('conversation');
    conn.on('route', (r) => setEvents((e) => [...e, { type: 'route', data: r }]));
    conn.on('delta', (d) => setStreamText((t) => t + d));
    conn.on('done', (d) => { setDone(d); setStreaming(false); });
    conn.on('error', (err) => { setEvents((e) => [...e, { type: 'error', data: err }]); setStreaming(false); });
    conn.start().then(() => { connRef.current = conn; }).catch(() => {});
    return () => { conn.stop().catch(() => {}); };
  }, []);

  const send = useCallback(async (prompt) => {
    if (!connRef.current || !conversationId) return;
    setStreaming(true);
    setStreamText('');
    setDone(null);
    setEvents([]);
    await connRef.current.invoke('StreamCompletion', conversationId, prompt);
  }, [conversationId]);

  return { events, streaming, streamText, done, send };
}
