import React from 'react';
import { motion } from 'framer-motion';

export const CardsBlock = ({ title, data }) => {
  const items = Array.isArray(data) ? data : [];
  if (!items.length) {
    return null;
  }

  return (
    <div className="glass-card">
      {title && <div className="subtle-title">{title}</div>}
      <div className="cards-grid">
        {items.map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className="mini-card">
            <div className="card-title">{item.title || item.name}</div>
            {item.subtitle && <div className="timeline-meta">{item.subtitle}</div>}
            {item.body && <div>{item.body}</div>}
          </motion.div>
        ))}
      </div>
    </div>
  );
};
