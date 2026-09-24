import React, { useState } from 'react';
import { useStreamTransfer } from '../../hooks/useStreamTransfer.js';

const STATUS_ICON = {
  Pending:          { emoji: '⏳', label: 'Queued' },
  AutoScreening:    { emoji: '🔍', label: 'Screening…' },
  GatekeeperReview: { emoji: '👁️', label: 'Under review' },
  Approved:         { emoji: '✅', label: 'Approved' },
  Uploading:        { emoji: '📤', label: 'Uploading…' },
  Ready:            { emoji: '🟢', label: 'Live on Stream' },
  Failed:           { emoji: '⚠️', label: 'Failed' },
  Rejected:         { emoji: '🚫', label: 'Rejected' },
  AutoBlocked:      { emoji: '🔒', label: 'Blocked' },
  Cancelled:        { emoji: '✖️', label: 'Cancelled' },
};

/**
 * "Send to WiseRavenStream" button.
 *
 * Props:
 *   contentId   string  — source content ID in WiseRavenShare
 *   videoUrl    string  — publicly reachable blob URL
 *   title       string  — video title
 *   description string? — optional description
 *   fileSize    number? — bytes
 *   mimeType    string? — e.g. "video/mp4"
 */
export default function SendToStreamButton({
  contentId,
  videoUrl,
  title,
  description,
  fileSize = 0,
  mimeType,
}) {
  const { transfer, loading, error, start } = useStreamTransfer();
  const [confirmed, setConfirmed] = useState(false);

  const handleClick = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setConfirmed(false);
    await start({
      sourceContentId: contentId,
      videoUrl,
      title,
      description,
      fileSizeBytes: fileSize,
      mimeType,
    });
  };

  if (transfer) {
    const { emoji, label } = STATUS_ICON[transfer.status] ?? { emoji: '…', label: transfer.status };
    const isRetryable = transfer.status === 'Failed';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
        <span title={transfer.status}>{emoji} {label}</span>
        {isRetryable && (
          <button
            onClick={() => start({ sourceContentId: contentId, videoUrl, title, description, fileSizeBytes: fileSize, mimeType })}
            disabled={loading}
            style={btnStyle('#f59e0b')}
          >
            Retry
          </button>
        )}
      </span>
    );
  }

  if (error) {
    return (
      <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>
        ⚠️ {error}
      </span>
    );
  }

  if (confirmed) {
    return (
      <span style={{ display: 'inline-flex', gap: '6px' }}>
        <span style={{ fontSize: '0.8rem', alignSelf: 'center' }}>Send to Stream?</span>
        <button onClick={handleClick} disabled={loading} style={btnStyle('#22c55e')}>✓ Yes</button>
        <button onClick={() => setConfirmed(false)} style={btnStyle('#6b7280')}>✗ No</button>
      </span>
    );
  }

  return (
    <button onClick={handleClick} disabled={loading} style={btnStyle('#3b82f6')} title="Send to WiseRavenStream">
      {loading ? '📤 Sending…' : '📡 Send to Stream'}
    </button>
  );
}

function btnStyle(bg) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '3px 10px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontWeight: 600,
  };
}
