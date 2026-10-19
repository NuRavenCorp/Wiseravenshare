import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { aiDataService } from '../services/aiDataService';

export function useAiData() {
  const [events, setEvents] = useState([]);
  const [activeSources, setActiveSources] = useState([]);
  const [finalResponse, setFinalResponse] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const connRef = useRef(null);

  useEffect(() => {
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_WS_URL || ''}/hubs/ai-data`, {
        accessTokenFactory: () => localStorage.getItem('accessToken') || ''
      })
      .withAutomaticReconnect()
      .build();

    conn.on('event', (evt) => {
      setEvents((prev) => [...prev, evt]);

      if (evt.type === 'route' && evt.payload?.sources) {
        setActiveSources(evt.payload.sources);
      }

      if (evt.type === 'source_start' && evt.payload?.source) {
        setActiveSources((prev) =>
          prev.includes(evt.payload.source) ? prev : [...prev, evt.payload.source]
        );
      }

      if (evt.type === 'final') {
        setFinalResponse(evt.payload);
        setIsStreaming(false);
      }
    });

    conn.start().then(() => {
      connRef.current = conn;
    }).catch(() => {
      connRef.current = null;
    });

    return () => {
      conn.stop();
    };
  }, []);

  const ask = useCallback(async (prompt) => {
    setEvents([]);
    setActiveSources([]);
    setFinalResponse(null);
    setError(null);
    setIsStreaming(true);

    try {
      if (!connRef.current) {
        throw new Error('Streaming unavailable');
      }

      await connRef.current.invoke('Ask', prompt);
    } catch {
      try {
        const response = await aiDataService.ask(prompt);
        setFinalResponse(response);
      } catch (err) {
        setError(err?.message || 'Request failed');
      } finally {
        setIsStreaming(false);
      }
    }
  }, []);

  return { events, activeSources, finalResponse, isStreaming, error, ask };
}
