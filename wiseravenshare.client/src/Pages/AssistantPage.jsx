import React, { useEffect, useState } from 'react';
import { assistantService } from '../Services/assistantService.js';
import { AssistantChatPanel } from '../Components/assistant/AssistantChatPanel.jsx';

export default function AssistantPage() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const list = await assistantService.listConversations();
      setConversations(list);
      if (list.length && !activeId) setActiveId(list[0].id);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setLoading(false);
    }
  };

  const createNew = async () => {
    try {
      const conv = await assistantService.createConversation({ title: `Conversation ${new Date().toLocaleTimeString()}` });
      setConversations(prev => [conv, ...prev]);
      setActiveId(conv.id);
    } catch (err) {
      console.error('Failed to create conversation', err);
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '280px 1fr',
      gap: '24px',
      maxWidth: '1400px',
      margin: '0 auto',
      padding: '24px'
    }}>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button onClick={createNew}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            borderRadius: '12px',
            backgroundColor: 'var(--primary-color)',
            border: 'none',
            cursor: 'pointer',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'opacity 0.2s'
          }}>
          ➕ New conversation
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {conversations.map(c => (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: activeId === c.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-color)',
                fontSize: '0.875rem',
                transition: 'all 0.2s'
              }}>
              💬
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title || 'Untitled'}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--light-color)', paddingTop: '40px' }}>Loading…</div>
        ) : activeId ? (
          <AssistantChatPanel conversationId={activeId} />
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--light-color)' }}>Start a new conversation.</p>
        )}
      </main>
    </div>
  );
}
