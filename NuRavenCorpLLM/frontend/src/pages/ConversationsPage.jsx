import React, { useState } from 'react';
import { Layout } from '../components/common/Layout';
import { ConversationList } from '../components/conversations/ConversationList';
import { MessageBubble } from '../components/conversations/MessageBubble';
import { Composer } from '../components/conversations/Composer';
import { PersonaPicker } from '../components/conversations/PersonaPicker';
import { EmptyState } from '../components/common/EmptyState';
import { api, endpoints } from '../lib/api';
import { useConversation } from '../hooks/useConversation';
import { FiMessageSquare } from 'react-icons/fi';
import { Button } from '../components/common/Button';
import toast from 'react-hot-toast';

export default function ConversationsPage() {
  const [activeId, setActiveId] = useState(null);
  const [persona, setPersona] = useState('Default');
  const [messages, setMessages] = useState([]);
  const [refreshListKey, setRefreshListKey] = useState(0);
  const [localConversations, setLocalConversations] = useState([]);
  const { streaming, streamText, done, send } = useConversation(activeId);

  React.useEffect(() => {
    if (done?.message) setMessages((m) => [...m, done.message]);
  }, [done]);

  React.useEffect(() => {
    if (!activeId || activeId.startsWith('local-')) return;
    (async () => {
      try {
        const { data } = await api.get(`${endpoints.conversations}/${activeId}`);
        const loaded = (data?.messages || []).map((m) => ({
          ...m,
          role: typeof m.role === 'number' ? (m.role === 1 ? 'User' : 'Assistant') : m.role,
        }));
        setMessages(loaded);
      } catch {
        setMessages([]);
      }
    })();
  }, [activeId]);

  const createConversation = async () => {
    try {
      const { data } = await api.post(endpoints.conversations, { title: 'New conversation', persona });
      setActiveId(data.id);
      setMessages([]);
      setRefreshListKey((k) => k + 1);
    } catch {
      const localId = `local-${Date.now()}`;
      const localItem = {
        id: localId,
        title: 'Local conversation',
        messageCount: 0,
        lastMessageAt: new Date().toISOString(),
      };
      setLocalConversations((list) => [localItem, ...list]);
      setActiveId(localId);
      setMessages([]);
      toast.error('Conversation API unavailable. Using local mode.');
    }
  };

  const handleSend = async (text) => {
    if (!activeId) return;
    setMessages((m) => [...m, { id: Date.now().toString(), role: 'User', content: text }]);
    if (activeId.startsWith('local-')) {
      try {
        const { data } = await api.post('/ai-data/ask', { prompt: text });
        const content = data?.answer || data?.narrative || 'No response generated.';
        setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'Assistant', content }]);
      } catch {
        toast.error('Local mode response failed');
      }
      return;
    }
    try {
      await send(text);
      setRefreshListKey((k) => k + 1);
    } catch {
      toast.error('Message send failed');
    }
  };

  return (
    <Layout title="Conversations" subtitle="Stream responses in real time">
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, height: 'calc(100vh - 180px)' }}>
        <div style={{ overflowY: 'auto' }}>
          <ConversationList
            activeId={activeId}
            onSelect={setActiveId}
            onCreate={createConversation}
            refreshKey={refreshListKey}
            extraItems={localConversations}
          />
        </div>
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Conversation view</span>
            <PersonaPicker value={persona} onChange={setPersona} />
          </div>
          <div className="scroll-y" style={{ flex: 1, padding: 20 }}>
            {messages.length === 0 && !activeId && (
              <EmptyState icon={<FiMessageSquare />} title="No conversation selected" description="Create or select a conversation to start streaming responses." action={<Button onClick={createConversation}>New conversation</Button>} />
            )}
            {messages.map((m) => <MessageBubble key={m.id} role={m.role} content={m.content} />)}
            {streaming && <MessageBubble role="Assistant" content={streamText} streaming />}
          </div>
          {activeId && <Composer onSend={handleSend} streaming={streaming} disabled={!activeId} />}
        </div>
      </div>
    </Layout>
  );
}
