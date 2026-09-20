import React from 'react';

export const TimelineBlock = ({ title, data }) => {
  const items = Array.isArray(data) ? data : [];
  if (!items.length) {
    return null;
  }

  return (
    <div className="glass-card">
      {title && <div className="subtle-title">{title}</div>}
      <div className="timeline">
        {items.map((item, i) => (
          <div key={i} className="timeline-item">
            <div className="timeline-dot" />
            <div>
              <div className="timeline-title">{item.title || item.label || `Event ${i + 1}`}</div>
              <div className="timeline-meta">{item.time || item.date || item.subtitle || ''}</div>
              {item.body && <div>{item.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
