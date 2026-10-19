import React, { useEffect, useState } from 'react';
import { FiClock, FiSend, FiZap } from 'react-icons/fi';

const EXAMPLE_PROMPTS = [
  'Show me my top posts this week by engagement',
  'Chart radio listeners over the last 14 days',
  'How many tasks did I finish yesterday?',
  'Compare podcast completion rates across episodes',
  'Give me a full pulse across all my content',
  'Which truth disputes are still open?',
  'Where did I spend the most WiseCoin this month?'
];

export const PromptStudio = ({ onSubmit, isStreaming, onOpenHistory }) => {
  const [text, setText] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = () => {
    if (!text.trim() || isStreaming) {
      return;
    }
    onSubmit(text.trim());
    setText('');
  };

  return (
    <div className="glass-card">
      <div className="panel-head">
        <h2 className="panel-title"><FiZap /> WiseRaven Command</h2>
        <button type="button" className="link-btn" onClick={onOpenHistory}>
          <FiClock /> History
        </button>
      </div>

      <textarea
        className="prompt-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSubmit();
          }
        }}
        placeholder={EXAMPLE_PROMPTS[placeholderIndex]}
        rows={5}
      />

      <div className="panel-foot">
        <span className="tip-text">Tip: Ctrl/Cmd + Enter to send</span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || isStreaming}
          className="submit-btn"
        >
          {isStreaming ? 'Working...' : <><FiSend /> Ask WiseRaven</>}
        </button>
      </div>
    </div>
  );
};
