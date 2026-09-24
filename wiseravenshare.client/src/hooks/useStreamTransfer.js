import { useState, useEffect, useCallback, useRef } from 'react';
import { initiateStreamTransfer, getStreamTransfer, retryStreamTransfer } from '../Services/streamTransferService.js';

const TERMINAL = new Set(['Ready', 'Failed', 'Rejected', 'AutoBlocked', 'Cancelled']);
const POLL_MS = 4000;
const STORAGE_KEY = 'wiseStreamTransferByContentId';

const readTransferMap = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const persistTransferId = (sourceContentId, transferId) => {
  if (!sourceContentId || !transferId) return;
  const map = readTransferMap();
  map[sourceContentId] = transferId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
};

const clearPersistedTransferId = (sourceContentId) => {
  if (!sourceContentId) return;
  const map = readTransferMap();
  if (!Object.prototype.hasOwnProperty.call(map, sourceContentId)) return;
  delete map[sourceContentId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
};

/**
 * Hook that initiates and polls a WiseRavenStream transfer.
 *
 * Usage:
 *   const { start, transfer, loading, error } = useStreamTransfer();
 *   await start({ sourceContentId, videoUrl, title, ... });
 */
export function useStreamTransfer({ sourceContentId, initialTransferId } = {}) {
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

  const restoreTransfer = useCallback(async () => {
    const persistedId = initialTransferId || readTransferMap()[sourceContentId];
    if (!persistedId) {
      return;
    }

    try {
      const t = await getStreamTransfer(persistedId);
      setTransfer(t);
      if (!TERMINAL.has(t.status)) {
        timerRef.current = setTimeout(() => poll(t.id), POLL_MS);
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        clearPersistedTransferId(sourceContentId);
      }
    }
  }, [initialTransferId, poll, sourceContentId]);

  const start = useCallback(async (req) => {
    stopPolling();
    setLoading(true);
    setError(null);
    setTransfer(null);
    try {
      const t = await initiateStreamTransfer(req);
      persistTransferId(req?.sourceContentId, t?.id);
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

  const retry = useCallback(async () => {
    if (!transfer?.id) return;
    setLoading(true);
    setError(null);
    stopPolling();
    try {
      await retryStreamTransfer(transfer.id);
      const refreshed = await getStreamTransfer(transfer.id);
      setTransfer(refreshed);
      persistTransferId(refreshed?.sourceContentId || sourceContentId, refreshed?.id);
      if (!TERMINAL.has(refreshed.status)) {
        timerRef.current = setTimeout(() => poll(refreshed.id), POLL_MS);
      }
    } catch (err) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Retry failed.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [poll, sourceContentId, transfer?.id]);

  useEffect(() => {
    stopPolling();
    setTransfer(null);
    setError(null);
    void restoreTransfer();
    return () => stopPolling();
  }, [restoreTransfer]);

  return { transfer, loading, error, start, retry };
}
