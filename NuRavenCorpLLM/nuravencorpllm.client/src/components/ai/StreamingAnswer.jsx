import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export const StreamingAnswer = ({ events, isStreaming, finalResponse, error }) => {
  const sourceEvents = events.filter((event) => event.type === 'source_start' || event.type === 'source_result');

  return (
    <div className="glass-card answer-panel">
      {error && <div className="error-text">Error: {error}</div>}

      {isStreaming && !finalResponse && (
        <div className="streaming-indicator">
          <span className="dot" />
          Consulting sources...
        </div>
      )}

      <AnimatePresence>
        {sourceEvents.map((event, index) => (
          <motion.div
            key={`${event.type}-${index}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="event-line"
          >
            {event.type === 'source_start'
              ? `Querying ${event.payload?.source}...`
              : `${event.payload?.source} returned ${
                  event.payload?.result?.rowsReturned ?? event.payload?.result?.points?.length ?? 0
                } rows`}
          </motion.div>
        ))}
      </AnimatePresence>

      {finalResponse?.answer && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="answer-text">
          {finalResponse.answer}
        </motion.div>
      )}
    </div>
  );
};
