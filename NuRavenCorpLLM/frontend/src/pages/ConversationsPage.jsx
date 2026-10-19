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

export default function ConversationsPage() {
  const [activeId, setActiveId] = useState(null);
  const [persona, setPersona] = useState('Default');
  const [messages, setMessages] = useState([]);
  const { streaming, streamText, done, send } = useConversation(activeId);

  React.useEffect(() => {
    if (done?.message) setMessages((m) => [...m, done.message]);
  }, [done]);

  const createConversation = async () => {
    const { data } = await api.post(endpoints.conversations, { title: 'New conversation', persona });
    setActiveId(data.id);
    setMessages([]);
  };

  const handleSend = (text) => {
    setMessages((m) => [...m, { id: Date.now().toString(), role: 'User', content: text }]);
    send(text);
  };

  return (
    <Layout title="Conversations" subtitle="Stream responses in real time">
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, height: 'calc(100vh - 180px)' }}>
        <div style={{ overflowY: 'auto' }}>
          <ConversationList activeId={activeId} onSelect={setActiveId} onCreate={createConversation} />
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
