import React, { useEffect, useState } from 'react';
import { api, endpoints } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import { Loader } from '../common/Loader';
import { Button } from '../common/Button';
import { FiPlus } from 'react-icons/fi';

export function ConversationList({ activeId, onSelect, onCreate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`${endpoints.conversations}?limit=50`);
        setItems(data);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loader />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Button size="sm" icon={<FiPlus />} onClick={onCreate}>New conversation</Button>
      {items.map((c) => (
        <div key={c.id} onClick={() => onSelect(c.id)} style={{ padding: 12, borderRadius: 'var(--radius-md)', border: `1px solid ${activeId === c.id ? 'var(--accent)' : 'var(--border)'}`, background: activeId === c.id ? 'rgba(124,92,255,0.1)' : 'var(--surface-2)', cursor: 'pointer' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title || 'Untitled'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{c.messageCount} messages · {relativeTime(c.lastMessageAt || Date.now())}</div>
        </div>
      ))}
    </div>
  );
}
