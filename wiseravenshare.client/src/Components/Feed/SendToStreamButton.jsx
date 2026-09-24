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

const SOURCE_LABEL = 'WiseRavenShare → WiseRavenStream';

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
  const { transfer, loading, error, start, retry } = useStreamTransfer({ sourceContentId: contentId });
  const [confirmed, setConfirmed] = useState(false);
  const canStart = Boolean(contentId && videoUrl && title);

  const handleClick = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setConfirmed(false);
    await start({
      sourceContentId: contentId,
      sourceApp: 'WiseRavenShare',
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', flexWrap: 'wrap' }}>
        <span title={transfer.status}>{emoji} {label}</span>
        <span style={badgeStyle('#0f766e')} title="Origin is limited to WiseRavenShare submissions">
          {transfer.sourceApp || 'WiseRavenShare'}
        </span>
        {isRetryable && (
          <button
            onClick={() => retry()}
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
      <span style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', alignSelf: 'center' }}>Send to Stream?</span>
        <span style={badgeStyle('#0f766e')} title="WiseRavenShare content only">
          {SOURCE_LABEL}
        </span>
        <button onClick={handleClick} disabled={loading || !canStart} style={btnStyle('#22c55e')}>✓ Yes</button>
        <button onClick={() => setConfirmed(false)} style={btnStyle('#6b7280')}>✗ No</button>
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || !canStart}
      style={btnStyle('#3b82f6')}
      title={canStart ? `${SOURCE_LABEL}` : 'Video URL and title are required'}
    >
      {loading ? '📤 Sending…' : (canStart ? '📡 Send to Stream' : '📡 Stream unavailable')}
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

function badgeStyle(bg) {
  return {
    background: bg,
    color: '#fff',
    borderRadius: '999px',
    padding: '2px 8px',
    fontSize: '0.7rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
  };
}
