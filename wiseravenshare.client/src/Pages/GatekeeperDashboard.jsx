import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getGatekeeperQueue, submitGatekeeperDecision } from '../Services/streamTransferService.js';

const RESULT_COLOR = { PASS: '#22c55e', FLAG: '#f59e0b', FAIL: '#ef4444' };
const ACTION_STYLE = {
  Cleared:      { bg: '#22c55e', label: '✅ Clear & Publish' },
  RequiresEdit: { bg: '#f59e0b', label: '✏️ Requires Edit' },
  Escalated:    { bg: '#8b5cf6', label: '⬆️ Escalate' },
  Rejected:     { bg: '#ef4444', label: '🚫 Reject' },
};

const originBadge = {
  background: '#0f766e',
  color: '#fff',
  borderRadius: 9999,
  padding: '2px 8px',
  fontSize: '0.7rem',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
};

export default function GatekeeperDashboard() {
  const [queue, setQueue]         = useState([]);
  const [selected, setSelected]   = useState(null);
  const [rationale, setRationale] = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const [notice, setNotice]       = useState('');
  const [query, setQuery]         = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const items = await getGatekeeperQueue();
      setQueue(items);
      setSelected((prev) => (prev ? (items.find((item) => item.id === prev.id) ?? null) : null));
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('Forbidden: this page requires Admin or Moderator role.');
        return;
      }
      setError('Failed to load queue. Check your permissions.');
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 10_000);
    return () => clearInterval(iv);
  }, [load]);

  const handleDecision = async (action) => {
    if (!selected || rationale.trim().length < 10) {
      setError('Rationale must be at least 10 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await submitGatekeeperDecision(selected.id, action, rationale.trim());
      setNotice(`Decision saved: ${ACTION_STYLE[action]?.label ?? action}`);
      setSelected(null);
      setRationale('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Decision failed.');
    } finally {
      setBusy(false);
    }
  };

  const rubric = selected?.rubricResult?.points ?? [];
  const flagCount = rubric.filter(p => p.result === 'FLAG').length;
  const filteredQueue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return queue;
    return queue.filter((item) => {
      const title = String(item?.title || '').toLowerCase();
      const creator = String(item?.sourceCreatorId || '').toLowerCase();
      return title.includes(needle) || creator.includes(needle);
    });
  }, [queue, query]);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* ── Queue ── */}
      <aside style={{ width: 320, borderRight: '1px solid #e5e7eb', overflowY: 'auto', background: '#f9fafb' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            👁️ Gatekeeper Queue
            <span style={{ marginLeft: 8, background: '#f59e0b', color: '#fff', borderRadius: 9999, padding: '2px 8px', fontSize: '0.75rem' }}>
              {filteredQueue.length}
            </span>
          </h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or creator"
              style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px', fontSize: '0.8rem' }}
            />
            <button
              onClick={() => { setNotice(''); void load(); }}
              disabled={busy}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', padding: '6px 8px', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Refresh
            </button>
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: 6 }}>{error}</p>}
          {notice && <p style={{ color: '#166534', fontSize: '0.8rem', marginTop: 6 }}>{notice}</p>}
        </div>
        {filteredQueue.length === 0 && (
          <p style={{ padding: 16, color: '#9ca3af', fontSize: '0.85rem' }}>No items pending review.</p>
        )}
        {filteredQueue.map(t => {
          const flags = t.rubricResult?.points?.filter(p => p.result === 'FLAG').length ?? 0;
          const isSelected = selected?.id === t.id;
          return (
            <div
              key={t.id}
              onClick={() => { setSelected(t); setRationale(''); setError(null); setNotice(''); }}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #e5e7eb',
                cursor: 'pointer',
                background: isSelected ? '#eff6ff' : 'transparent',
                borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                {t.sourceCreatorId} · {new Date(t.createdAt).toLocaleTimeString()}
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={originBadge}>{t.sourceApp || 'WiseRavenShare'}</span>
              </div>
              {flags > 0 && (
                <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', marginTop: 4, display: 'inline-block' }}>
                  {flags} flag{flags > 1 ? 's' : ''}
                </span>
              )}
            </div>
          );
        })}
      </aside>

      {/* ── Detail ── */}
      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ color: '#9ca3af', marginTop: 60, textAlign: 'center' }}>
            <div style={{ fontSize: '3rem' }}>📋</div>
            <div>Select a transfer to review</div>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 4 }}>{selected.title}</h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 16 }}>
              Creator: <strong>{selected.sourceCreatorId}</strong> ·
              Submitted: {new Date(selected.createdAt).toLocaleString()} ·
              {flagCount > 0 && <span style={{ color: '#f59e0b' }}> {flagCount} flag{flagCount > 1 ? 's' : ''}</span>}
            </p>
            <div style={{ marginBottom: 16 }}>
              <span style={originBadge}>
                {selected.sourceApp || 'WiseRavenShare'} → WiseRavenStream
              </span>
            </div>

            <video src={selected.videoUrl} controls style={{ width: '100%', maxWidth: 640, borderRadius: 8, marginBottom: 20, background: '#000' }} />

            {/* Rubric table */}
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>10-Point Compliance Rubric</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: 24 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  {['#', 'Point', 'Result', 'Confidence', 'Notes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rubric.map(p => (
                  <tr key={p.pointId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '5px 10px', color: '#9ca3af' }}>{p.pointId}</td>
                    <td style={{ padding: '5px 10px' }}>{p.pointName}</td>
                    <td style={{ padding: '5px 10px', fontWeight: 700, color: RESULT_COLOR[p.result] ?? '#374151' }}>{p.result}</td>
                    <td style={{ padding: '5px 10px' }}>{Math.round(p.confidence * 100)}%</td>
                    <td style={{ padding: '5px 10px', color: '#6b7280' }}>{p.notes ?? p.evidence ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Decision */}
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Decision</h3>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              placeholder="Rationale (min 10 characters, required)"
              rows={3}
              style={{ width: '100%', maxWidth: 640, border: '1px solid #d1d5db', borderRadius: 6, padding: 8, fontSize: '0.85rem', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(ACTION_STYLE).map(([action, { bg, label }]) => (
                <button
                  key={action}
                  onClick={() => handleDecision(action)}
                  disabled={busy || rationale.trim().length < 10}
                  style={{
                    background: bg,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: (busy || rationale.trim().length < 10) ? 0.5 : 1,
                    fontSize: '0.875rem',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {error && <p style={{ color: '#ef4444', marginTop: 8, fontSize: '0.85rem' }}>{error}</p>}
          </>
        )}
      </main>
    </div>
  );
}
