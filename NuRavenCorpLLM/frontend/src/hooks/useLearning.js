import { useEffect, useRef, useState } from 'react';
import { createConnection } from '../lib/signalr';

export function useLearningLive() {
  const [stats, setStats] = useState(null);
  const connRef = useRef(null);

  useEffect(() => {
    const conn = createConnection('learning');
    conn.on('stats', (s) => setStats(s));
    conn.start().then(() => {
      connRef.current = conn;
      conn.invoke('SubscribeClientFeed').catch(() => {});
    }).catch(() => {});
    return () => { conn.stop().catch(() => {}); };
  }, []);

  return { stats };
}
