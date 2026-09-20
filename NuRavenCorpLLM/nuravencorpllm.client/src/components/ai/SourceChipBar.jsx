import React from 'react';
import { motion } from 'framer-motion';

const ICONS = {
  posts: '📝',
  videos: '🎬',
  radio: '📻',
  podcasts: '🎙️',
  planner: '📋',
  currency: '💠',
  truth: '🛡️',
  collaboration: '🤝',
  users: '👥'
};

export const SourceChipBar = ({ sources, active }) => (
  <div className="source-bar">
    <span className="subtle-title">Sources</span>
    {(Array.isArray(sources) ? sources : []).map((source) => {
      const isActive = Array.isArray(active) ? active.includes(source.key) : Boolean(active?.includes?.(source.key));
      return (
        <motion.div
          key={source.key}
          animate={{ scale: isActive ? 1.05 : 1 }}
          className={`source-chip ${isActive ? 'active' : ''}`}
        >
          <span>{ICONS[source.key] || '📦'}</span>
          {source.name}
        </motion.div>
      );
    })}
  </div>
);
