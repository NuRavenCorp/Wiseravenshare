import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * usePodcastSession: Multi-device, persistent session management for Podcast Studio
 *
 * This hook manages:
 * - Session creation and lifecycle
 * - Device registration and heartbeat
 * - Real-time state sync across devices
 * - Automatic token refresh without auth interruption
 *
 * Usage:
 * const session = usePodcastSession(teamId);
 * 
 * await session.createSession('team'); // or 'device-restricted' with allowedUserIds
 * const device = await session.joinDevice('my-laptop', 'web');
 * await session.syncState({ recordingActive: true });
 * // Session persists; user can rejoin from another device
 */

export interface PodcastSessionDevice {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: 'web' | 'mobile' | 'desktop';
  joinedAt: string;
  lastHeartbeatAt: string | null;
  tokenExpiresInSeconds: number;
  isActive: boolean;
}

export interface PodcastSession {
  id: string;
  teamId: string;
  status: 'active' | 'closing' | 'closed';
  accessScope: 'team' | 'device-restricted';
  createdAt: string;
  closedAt: string | null;
  sessionState: Record<string, unknown>;
  stateVersion: number;
  devices: PodcastSessionDevice[];
}

interface SessionSyncResponse {
  sessionId: string;
  sessionState: Record<string, unknown>;
  stateVersion: number;
  activeDevices: PodcastSessionDevice[];
  tokenExpiresInSeconds: number;
}

interface UsePodcastSessionReturn {
  session: PodcastSession | null;
  device: PodcastSessionDevice | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  createSession: (accessScope?: 'team' | 'device-restricted', allowedUserIds?: string) => Promise<void>;
  joinDevice: (deviceName: string, deviceType?: 'web' | 'mobile' | 'desktop') => Promise<void>;
  syncState: (localState: Record<string, unknown>) => Promise<void>;
  closeSession: () => Promise<void>;
  getAllDevices: () => PodcastSessionDevice[];
}

export const usePodcastSession = (teamId: string): UsePodcastSessionReturn => {
  const [session, setSession] = useState<PodcastSession | null>(null);
  const [device, setDevice] = useState<PodcastSessionDevice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(localStorage.getItem(`psess_${teamId}`));
  const deviceIdRef = useRef<string>(localStorage.getItem(`pdev_${teamId}`) || generateDeviceId());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tokenRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const apiBase = '/api/podcast-sessions';

  // ──────────────────────────────────────────────────────────────
  // Session Lifecycle
  // ──────────────────────────────────────────────────────────────

  const createSession = useCallback(
    async (accessScope: 'team' | 'device-restricted' = 'team', allowedUserIds?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, accessScope, allowedUserIds }),
        });

        if (!res.ok) throw new Error(`Failed to create session: ${res.statusText}`);

        const newSession: PodcastSession = await res.json();
        setSession(newSession);
        sessionIdRef.current = newSession.id;
        localStorage.setItem(`psess_${teamId}`, newSession.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [teamId]
  );

  const joinDevice = useCallback(
    async (deviceName: string, deviceType: 'web' | 'mobile' | 'desktop' = 'web') => {
      if (!sessionIdRef.current) {
        setError('No active session. Create one first.');
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/register-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            deviceId: deviceIdRef.current,
            deviceName,
            deviceType,
          }),
        });

        if (!res.ok) throw new Error(`Failed to join device: ${res.statusText}`);

        const newDevice: PodcastSessionDevice = await res.json();
        setDevice(newDevice);
        localStorage.setItem(`pdev_${teamId}`, newDevice.id);

        // Start heartbeat
        startHeartbeat();

        // Start sync loop
        startSyncLoop();

        // Schedule token refresh
        scheduleTokenRefresh(newDevice.tokenExpiresInSeconds);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [teamId]
  );

  // ──────────────────────────────────────────────────────────────
  // State Sync & Heartbeat
  // ──────────────────────────────────────────────────────────────

  const syncState = useCallback(
    async (localState: Record<string, unknown>) => {
      if (!sessionIdRef.current || !device) return;

      try {
        const res = await fetch(`${apiBase}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            deviceId: deviceIdRef.current,
            localStateJson: JSON.stringify(localState),
          }),
        });

        if (!res.ok) return;

        const syncResp: SessionSyncResponse = await res.json();
        setSession(prev => prev ? { ...prev, sessionState: syncResp.sessionState, stateVersion: syncResp.stateVersion, devices: syncResp.activeDevices } : null);
      } catch (err) {
        console.error('Sync failed:', err);
      }
    },
    [device]
  );

  const sendHeartbeat = useCallback(async () => {
    if (!sessionIdRef.current || !device) return;

    try {
      await fetch(`${apiBase}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          deviceId: deviceIdRef.current,
        }),
      });
    } catch (err) {
      console.error('Heartbeat failed:', err);
    }
  }, [device]);

  const startHeartbeat = () => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, 30000); // Every 30 seconds
  };

  const startSyncLoop = () => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = setInterval(() => {
      // Clients can optionally sync state on an interval
      // For now, manual sync is the primary pattern
    }, 10000); // Every 10 seconds
  };

  // ──────────────────────────────────────────────────────────────
  // Token Refresh (Silent, No Auth Interruption)
  // ──────────────────────────────────────────────────────────────

  const scheduleTokenRefresh = (expiresInSeconds: number) => {
    if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);

    // Refresh 5 minutes before expiry
    const refreshDelayMs = Math.max((expiresInSeconds - 300) * 1000, 0);
    tokenRefreshTimerRef.current = setTimeout(() => {
      joinDevice(device?.deviceName || 'device', device?.deviceType || 'web').catch(err => {
        console.error('Token refresh failed:', err);
      });
    }, refreshDelayMs);
  };

  // ──────────────────────────────────────────────────────────────
  // Session Closure
  // ──────────────────────────────────────────────────────────────

  const closeSession = useCallback(async () => {
    if (!sessionIdRef.current) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${sessionIdRef.current}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error(`Failed to close session: ${res.statusText}`);

      setSession(null);
      setDevice(null);
      sessionIdRef.current = null;
      localStorage.removeItem(`psess_${teamId}`);

      // Stop intervals
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  // ──────────────────────────────────────────────────────────────
  // Restore Session on Mount
  // ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const restoreSession = async () => {
      const savedSessionId = localStorage.getItem(`psess_${teamId}`);
      if (!savedSessionId) return;

      sessionIdRef.current = savedSessionId;

      try {
        const res = await fetch(`${apiBase}/team/${teamId}/active`);
        if (res.ok) {
          const activeSession: PodcastSession = await res.json();
          setSession(activeSession);

          // Rejoin device to the restored session
          if (deviceIdRef.current) {
            try {
              await joinDevice(`Device (${new Date().toLocaleTimeString()})`);
            } catch (err) {
              console.error('Failed to rejoin device:', err);
            }
          }
        } else {
          // Session no longer active
          localStorage.removeItem(`psess_${teamId}`);
          sessionIdRef.current = null;
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
      }
    };

    restoreSession();

    return () => {
      // Cleanup on unmount
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
    };
  }, [teamId]);

  return {
    session,
    device,
    isConnected: session?.status === 'active' && device?.isActive,
    isLoading,
    error,
    createSession,
    joinDevice,
    syncState,
    closeSession,
    getAllDevices: () => session?.devices || [],
  };
};

function generateDeviceId(): string {
  const stored = localStorage.getItem('_pdev_id');
  if (stored) return stored;

  const id = `dev_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('_pdev_id', id);
  return id;
}
