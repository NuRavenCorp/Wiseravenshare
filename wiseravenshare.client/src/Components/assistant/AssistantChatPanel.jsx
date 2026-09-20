import React, { useEffect, useRef, useState } from 'react';
import { useAssistant } from '../../hooks/useAssistant';
import { useRecorder } from '../../hooks/useRecorder';
import { AssistantMessage } from './AssistantMessage';
import { VoiceSelector } from './VoiceSelector';
import { PersonaSelector } from './PersonaSelector';

export const AssistantChatPanel = ({ conversationId }) => {
  const { messages, streamingText, isThinking, send, sendAudio } = useAssistant(conversationId);
  const [text, setText] = useState('');
  const [voiceReply, setVoiceReply] = useState(false);
  const [persona, setPersona] = useState('Default');
  const [voiceId, setVoiceId] = useState('alloy');
  const bottomRef = useRef(null);

  const recorder = useRecorder({
    onStop: async (blob) => {
      if (blob.size < 1500) return;
      await sendAudio(blob);
    }
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  const handleSend = () => {
    if (!text.trim()) return;
    send(text, voiceReply);
    setText('');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '80vh',
      backgroundColor: 'var(--card-bg)',
      borderRadius: '16px',
      border: `1px solid var(--border-color)`,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        borderBottom: `1px solid var(--border-color)`
      }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '1.125rem', fontWeight: '600' }}>WiseRaven Assistant</h2>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--light-color)' }}>Learns from WiseRavenShare + the web</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <PersonaSelector value={persona} onChange={setPersona} />
          <VoiceSelector value={voiceId} onChange={setVoiceId} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map(m => (
          <AssistantMessage key={m.id} message={m} />
        ))}
        {streamingText && (
          <AssistantMessage
            message={{ role: 'Assistant', content: streamingText, status: 'streaming' }}
          />
        )}
        {isThinking && !streamingText && (
          <div style={{ fontSize: '0.875rem', color: 'var(--light-color)' }}>WiseRaven is thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '16px',
        borderTop: `1px solid var(--border-color)`,
        backgroundColor: 'var(--card-bg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={recorder.recording ? recorder.stop : recorder.start}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '28px',
              backgroundColor: recorder.recording ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              color: recorder.recording ? '#ef4444' : '#3b82f6',
              transition: 'all 0.2s'
            }}>
            🎤
          </button>

          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask WiseRaven anything…"
            style={{
              flex: 1,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: `1px solid var(--border-color)`,
              borderRadius: '12px',
              padding: '12px 16px',
              color: 'var(--text-color)',
              fontSize: '0.875rem'
            }}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--light-color)', cursor: 'pointer' }}>
            <input type="checkbox" checked={voiceReply}
              onChange={e => setVoiceReply(e.target.checked)}
              style={{ cursor: 'pointer' }} />
            Speak reply
          </label>

          <button onClick={handleSend}
            style={{
              padding: '12px',
              borderRadius: '12px',
              backgroundColor: 'var(--primary-color)',
              border: 'none',
              cursor: 'pointer',
              color: 'white',
              fontSize: '1rem',
              transition: 'opacity 0.2s'
            }}>
            ➤
          </button>
        </div>

        {recorder.recording && (
          <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '8px' }}>
            Recording… {recorder.elapsed}s — tap the mic to send
          </div>
        )}
      </div>
    </div>
  );
};
