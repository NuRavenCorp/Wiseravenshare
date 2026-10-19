import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { aiDataService } from '../../services/aiDataService';

export const HistoryDrawer = ({ open, onClose, onPick }) => {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    aiDataService.history(50).then((data) => setItems(data || [])).catch(() => setItems([]));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="drawer-backdrop" onClick={onClose} type="button" />
          <motion.aside className="history-drawer" initial={{ x: 360 }} animate={{ x: 0 }} exit={{ x: 360 }}>
            <div className="panel-head">
              <h3 className="panel-title">Query History</h3>
              <button type="button" className="link-btn" onClick={onClose}><FiX /></button>
            </div>
            <div className="suggestion-list">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="suggestion-btn"
                  onClick={() => {
                    onPick(item.prompt);
                    onClose();
                  }}
                >
                  <div className="suggestion-title">{item.prompt}</div>
                  <div className="suggestion-prompt">
                    {new Date(item.createdAt).toLocaleString()} · {(item.sources || []).join(', ')}
                  </div>
                </button>
              ))}
              {!items.length && <div className="suggestion-prompt">No queries yet.</div>}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
