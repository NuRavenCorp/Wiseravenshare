import React, { useState } from 'react';
import { assistantService } from '../../Services/assistantService';

export const AssistantMessage = ({ message }) => {
  const isUser = message.role === 'User' || message.role === 'user';
  const [voted, setVoted] = useState(null);
  const [showCitations, setShowCitations] = useState(false);

  const citations = message.citations ? safeParse(message.citations) : null;

  const vote = async (v) => {
    setVoted(v);
    try {
      await assistantService.submitFeedback(message.id, { vote: v });
    } catch (err) {
      console.error('Feedback failed', err);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
      <div style={{
        maxWidth: '80%',
        borderRadius: '16px',
        padding: '12px 16px',
        backgroundColor: isUser ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
        color: 'var(--text-color)',
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap'
      }}>
        <div style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{message.content}</div>

        {citations && (
          <div style={{ marginTop: '8px', fontSize: '0.75rem' }}>
            <button onClick={() => setShowCitations(s => !s)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary-color)',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0
              }}>
              Sources ({(citations.rag?.length || 0) + (citations.web?.length || 0)})
            </button>
            {showCitations && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {citations.rag?.map((r, i) => (
                  <div key={`rag-${i}`}><span style={{ color: 'var(--light-color)' }}>[RAG]</span> {r.title}</div>
                ))}
                {citations.web?.map((w, i) => (
                  <a key={`web-${i}`} href={w.url} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)', textDecoration: 'none' }}>
                    🔗 {w.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {!isUser && message.status !== 'streaming' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', opacity: 0.6, cursor: 'pointer' }}>
            <button onClick={() => vote('ThumbUp')} style={{
              background: 'none',
              border: 'none',
              color: voted === 'ThumbUp' ? 'var(--success-color)' : 'var(--text-color)',
              cursor: 'pointer',
              fontSize: '1rem'
            }}>👍</button>
            <button onClick={() => vote('ThumbDown')} style={{
              background: 'none',
              border: 'none',
              color: voted === 'ThumbDown' ? 'var(--danger-color)' : 'var(--text-color)',
              cursor: 'pointer',
              fontSize: '1rem'
            }}>👎</button>
          </div>
        )}
      </div>
    </div>
  );
};

function safeParse(v) {
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
}
