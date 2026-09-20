import React from 'react';
import { motion } from 'framer-motion';

export const PromptSuggestions = ({ templates, onPick }) => (
  <div className="glass-card">
    <h3 className="subtle-title">Quick prompts</h3>
    <div className="suggestion-list">
      {(Array.isArray(templates) ? templates : []).map((template, i) => (
        <motion.button
          type="button"
          key={template.id || `${template.title}-${i}`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="suggestion-btn"
          onClick={() => onPick(template.prompt)}
        >
          <div className="suggestion-title">{template.title}</div>
          <div className="suggestion-prompt">{template.prompt}</div>
        </motion.button>
      ))}
    </div>
  </div>
);
