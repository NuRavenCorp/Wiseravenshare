import { useState, useEffect, useCallback, useRef } from 'react';
import { initiateStreamTransfer, getStreamTransfer } from '../Services/streamTransferService.js';

const TERMINAL = new Set(['Ready', 'Failed', 'Rejected', 'AutoBlocked', 'Cancelled']);
const POLL_MS = 4000;

/**
 * Hook that initiates and polls a WiseRavenStream transfer.
 *
 * Usage:
 *   const { start, transfer, loading, error } = useStreamTransfer();
 *   await start({ sourceContentId, videoUrl, title, ... });
 */
export function useStreamTransfer() {
  const [transfer, setTransfer] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const timerRef = useRef(null);

  const stopPolling = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const poll = useCallback(async (id) => {
    try {
      const t = await getStreamTransfer(id);
      setTransfer(t);
      if (!TERMINAL.has(t.status)) {
        timerRef.current = setTimeout(() => poll(id), POLL_MS);
      }
    } catch {
      // Non-fatal polling failure; retry
      timerRef.current = setTimeout(() => poll(id), POLL_MS * 2);
    }
  }, []);

  const start = useCallback(async (req) => {
    stopPolling();
    setLoading(true);
    setError(null);
    setTransfer(null);
    try {
      const t = await initiateStreamTransfer(req);
      setTransfer(t);
      if (!TERMINAL.has(t.status)) {
        timerRef.current = setTimeout(() => poll(t.id), POLL_MS);
      }
      return t;
    } catch (err) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Transfer failed.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [poll]);

  useEffect(() => () => stopPolling(), []);

  return { transfer, loading, error, start };
}
