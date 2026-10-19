import React, { useEffect, useState } from 'react';
import { api, endpoints } from '../../lib/api';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';
import { PersonaPicker } from './PersonaPicker';
import { useConversation } from '../../hooks/useConversation';
import { Loader } from '../common/Loader';
import { EmptyState } from '../common/EmptyState';
import { Chip } from '../common/Chip';
import { FiMessageSquare } from 'react-icons/fi';

export function ConversationView({ conversationId, persona, onPersonaChange }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const { events, streaming, streamText, done, send } = useConversation(conversationId);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`${endpoints.conversations}/${conversationId}/messages`);
        setMessages(data);
      } finally { setLoading(false); }
    })();
  }, [conversationId]);

  useEffect(() => {
    const route = events.find((e) => e.type === 'route');
    if (route) setRouteInfo(route.data);
  }, [events]);

  useEffect(() => {
    if (done?.message) {
      setMessages((m) => [...m, done.message]);
      setRouteInfo(null);
    }
  }, [done]);

  const handleSend = (text) => {
    const localUser = { id: `local-${Date.now()}`, role: 'User', content: text };
    setMessages((m) => [...m, localUser]);
    send(text);
  };

  if (!conversationId) {
    return (
      <EmptyState
        icon={<FiMessageSquare />}
        title="No conversation selected"
        description="Create or pick a conversation to begin."
      />
    );
  }

  return (
    <>
      <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {routeInfo?.model && (
            <>
              <Chip tone="accent">{routeInfo.model}</Chip>
              {routeInfo.provider && <Chip>{routeInfo.provider}</Chip>}
            </>
          )}
        </div>
        <PersonaPicker value={persona} onChange={onPersonaChange} />
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: 20 }}>
        {loading ? <Loader /> : (
          <>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                citations={m.citations}
                latency={m.latencyMs}
                tokens={m.totalTokens}
              />
            ))}
            {streaming && <MessageBubble role="Assistant" content={streamText} streaming />}
          </>
        )}
      </div>

      <Composer onSend={handleSend} streaming={streaming} />
    </>
  );
}
