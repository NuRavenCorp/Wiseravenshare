import { useEffect, useRef, useState } from 'react';
import { createConnection } from '../lib/signalr';

export function useIngestion(jobId) {
  const [snapshot, setSnapshot] = useState(null);
  const [events, setEvents] = useState([]);
  const connRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    const conn = createConnection('ingestion');
    conn.on('snapshot', (s) => setSnapshot(s));
    conn.on('progress', (p) => setEvents((e) => [...e, p]));
    conn.start().then(() => {
      connRef.current = conn;
      conn.invoke('Subscribe', jobId).catch(() => {});
    }).catch(() => {});
    return () => {
      if (connRef.current) connRef.current.invoke('Unsubscribe', jobId).catch(() => {});
      conn.stop().catch(() => {});
    };
  }, [jobId]);

  return { snapshot, events };
}
