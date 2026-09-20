import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiExternalLink, FiX } from 'react-icons/fi';

export function CitationDrawer({ open, citations, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 900,
            background: 'rgba(4, 6, 12, 0.6)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: 420, maxWidth: '90vw',
              background: 'var(--surface-1)',
              borderLeft: '1px solid var(--border)',
              padding: 24, overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Citations</h3>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <FiX size={18} />
              </button>
            </div>
            {(citations || []).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No citations for this message.</p>
            )}
            {(citations || []).map((c, i) => (
              <div key={i} style={{
                padding: 14, marginBottom: 10, borderRadius: 10,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{c.title}</div>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer" style={{
                    fontSize: 12, color: 'var(--accent-2)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    Open source <FiExternalLink size={11} />
                  </a>
                )}
                {c.snippet && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                    {c.snippet}
                  </p>
                )}
              </div>
            ))}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
