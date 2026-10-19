import React from 'react';
import { motion } from 'framer-motion';
import { CardsBlock } from './CardsBlock';
import { ChartBlock } from './ChartBlock';
import { MetricsGrid } from './MetricsGrid';
import { TableBlock } from './TableBlock';
import { TimelineBlock } from './TimelineBlock';

function normalizeData(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parsed;
    } catch {
      return data;
    }
  }

  return data;
}

export const OutputRenderer = ({ blocks }) => (
  <div className="output-stack">
    {blocks.map((block, i) => {
      const data = normalizeData(block.data);
      return (
        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {block.type === 'metrics' && <MetricsGrid title={block.title} data={data} />}
          {block.type === 'chart' && <ChartBlock title={block.title} data={data} />}
          {block.type === 'table' && <TableBlock title={block.title} data={data} />}
          {block.type === 'timeline' && <TimelineBlock title={block.title} data={data} />}
          {block.type === 'cards' && <CardsBlock title={block.title} data={data} />}
          {block.type === 'text' && (
            <div className="glass-card">
              {block.title && <div className="subtle-title">{block.title}</div>}
              <div className="answer-text">{typeof data === 'string' ? data : JSON.stringify(data)}</div>
            </div>
          )}
        </motion.div>
      );
    })}
  </div>
);
