import { useEffect, useRef, useState } from 'react';
import { createConnection } from '../lib/signalr';

export function useAnalyticsLive() {
  const [usage, setUsage] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const connRef = useRef(null);

  useEffect(() => {
    const conn = createConnection('analytics');
    conn.on('usage', (u) => setUsage(u));
    conn.on('anomaly', (a) => setAnomalies((prev) => [a, ...prev].slice(0, 50)));
    conn.start().then(() => {
      connRef.current = conn;
      conn.invoke('SubscribeUsage').catch(() => {});
      conn.invoke('SubscribeAnomalies').catch(() => {});
    }).catch(() => {});
    return () => { conn.stop().catch(() => {}); };
  }, []);

  return { usage, anomalies };
}
