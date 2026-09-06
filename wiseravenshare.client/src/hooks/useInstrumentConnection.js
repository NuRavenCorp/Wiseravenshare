import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useInstrumentConnection
 * 
 * Custom hook for managing plug-and-play instrument connections
 * Features:
 * - Auto-detects connected devices
 * - Auto-reconnects on device change
 * - Auto sign-out on unexpected disconnect
 * - Connection status tracking
 * - Green signal indicator animation
 */
export const useInstrumentConnection = (onConnectionChange, onDisconnectWarning) => {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected', 'connecting', 'connected', 'error'
  const [isConnected, setIsConnected] = useState(false);
  const [connectionSignal, setConnectionSignal] = useState(false); // Animates green indicator
  const [lastActiveDevice, setLastActiveDevice] = useState(null);
  const [autoReconnectAttempts, setAutoReconnectAttempts] = useState(0);

  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const deviceChangeListenerRef = useRef(null);
  const autoReconnectTimeoutRef = useRef(null);
  const connectionCheckIntervalRef = useRef(null);
  const isAutoReconnectingRef = useRef(false);

  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 2000; // 2 seconds
  const CONNECTION_CHECK_INTERVAL = 5000; // Check every 5 seconds

  // ─── Enumerate Devices ──────────────────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    try {
      const audioDevices = await navigator.mediaDevices.enumerateDevices();
      const inputs = audioDevices.filter(d => d.kind === 'audioinput');
      setDevices(inputs);
      return inputs;
    } catch (err) {
      console.error('Error enumerating devices:', err);
      return [];
    }
  }, []);

  // ─── Detect Connection Type ─────────────────────────────────────────
  const detectConnectionType = useCallback((deviceLabel) => {
    const label = String(deviceLabel || '').toLowerCase();
    if (label.includes('bluetooth') || label.includes('airpods') || label.includes('wireless')) {
      return 'bluetooth';
    } else if (label.includes('usb') || label.includes('interface') || label.includes('adapter')) {
      return 'usb';
    } else if (label.includes('network') || label.includes('stream')) {
      return 'network';
    }
    return 'wired';
  }, []);

  // ─── Connect to Device ──────────────────────────────────────────────
  const connect = useCallback(async (deviceId) => {
    if (connectionStatus === 'connecting') {
      return false; // Already connecting
    }

    setConnectionStatus('connecting');
    setSelectedDeviceId(deviceId);

    try {
      const constraints = {
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      // Initialize Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      audioContext.createMediaStreamSource(stream);

      // Store last successful device
      const device = devices.find(d => d.deviceId === deviceId);
      setLastActiveDevice({
        id: deviceId,
        label: device?.label || 'Unknown Device',
        type: detectConnectionType(device?.label),
      });

      setConnectionStatus('connected');
      setIsConnected(true);
      
      // Animate green signal
      setConnectionSignal(true);
      setTimeout(() => setConnectionSignal(false), 300);
      setTimeout(() => setConnectionSignal(true), 600);

      // Reset reconnect attempts on successful connection
      setAutoReconnectAttempts(0);
      isAutoReconnectingRef.current = false;

      // Notify callback
      onConnectionChange?.({
        status: 'connected',
        device: device?.label || 'Unknown Device',
        type: detectConnectionType(device?.label),
      });

      return true;
    } catch (err) {
      console.error('Error connecting to device:', err);
      setConnectionStatus('error');
      setIsConnected(false);

      onConnectionChange?.({
        status: 'error',
        error: err.message,
      });

      return false;
    }
  }, [connectionStatus, devices, detectConnectionType, onConnectionChange]);

  // ─── Disconnect from Device ────────────────────────────────────────
  const disconnect = useCallback(async (isAutoDisconnect = false) => {
    // Stop all tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      mediaStreamRef.current = null;
    }

    // Clean up audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.warn('Error closing audio context:', e);
      }
      audioContextRef.current = null;
    }

    setConnectionStatus('disconnected');
    setIsConnected(false);
    setConnectionSignal(false);
    setSelectedDeviceId(null);

    if (isAutoDisconnect) {
      onDisconnectWarning?.({
        type: 'auto_disconnect',
        device: lastActiveDevice,
        message: `Device "${lastActiveDevice?.label}" was disconnected unexpectedly`,
      });
    }

    onConnectionChange?.({
      status: 'disconnected',
      device: lastActiveDevice,
    });
  }, [lastActiveDevice, onConnectionChange, onDisconnectWarning]);

  // ─── Auto Reconnect ─────────────────────────────────────────────────
  const attemptAutoReconnect = useCallback(async () => {
    if (isAutoReconnectingRef.current) {
      return; // Already attempting
    }

    if (autoReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('Max reconnect attempts reached');
      await disconnect(true);
      return;
    }

    isAutoReconnectingRef.current = true;
    setAutoReconnectAttempts(prev => prev + 1);
    setConnectionStatus('connecting');

    if (autoReconnectTimeoutRef.current) {
      clearTimeout(autoReconnectTimeoutRef.current);
    }

    autoReconnectTimeoutRef.current = setTimeout(async () => {
      if (lastActiveDevice?.id) {
        const success = await connect(lastActiveDevice.id);
        if (!success) {
          isAutoReconnectingRef.current = false;
          await attemptAutoReconnect(); // Retry
        }
      } else {
        isAutoReconnectingRef.current = false;
      }
    }, RECONNECT_DELAY);
  }, [autoReconnectAttempts, lastActiveDevice, connect, disconnect]);

  // ─── Check Connection Health ────────────────────────────────────────
  const checkConnectionHealth = useCallback(async () => {
    if (connectionStatus !== 'connected' || !mediaStreamRef.current) {
      return;
    }

    // Check if all tracks are still active
    const activeTracks = mediaStreamRef.current.getTracks().filter(t => t.readyState === 'live');
    
    if (activeTracks.length === 0) {
      console.warn('Connection health check: No active tracks detected');
      await attemptAutoReconnect();
    }
  }, [connectionStatus, attemptAutoReconnect]);

  // ─── Initialize Device Enumeration & Listeners ──────────────────────
  useEffect(() => {
    enumerateDevices();

    const handleDeviceChange = async () => {
      console.log('Device change detected, re-enumerating...');
      const updated = await enumerateDevices();

      // Check if currently connected device is still available
      if (selectedDeviceId && connectionStatus === 'connected') {
        const stillAvailable = updated.some(d => d.deviceId === selectedDeviceId);
        
        if (!stillAvailable) {
          console.warn('Currently connected device no longer available');
          await disconnect(true);
          
          // Try to reconnect to last known device
          if (lastActiveDevice) {
            const alternativeDevice = updated.find(
              d => d.label === lastActiveDevice.label
            );
            if (alternativeDevice) {
              console.log('Found alternative device with same label, auto-connecting...');
              await connect(alternativeDevice.deviceId);
            }
          }
        }
      }
    };

    deviceChangeListenerRef.current = handleDeviceChange;
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerateDevices, selectedDeviceId, connectionStatus, lastActiveDevice, disconnect, connect]);

  // ─── Health Check Interval ──────────────────────────────────────────
  useEffect(() => {
    if (connectionStatus === 'connected') {
      connectionCheckIntervalRef.current = setInterval(
        checkConnectionHealth,
        CONNECTION_CHECK_INTERVAL
      );
    } else if (connectionCheckIntervalRef.current) {
      clearInterval(connectionCheckIntervalRef.current);
    }

    return () => {
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current);
      }
    };
  }, [connectionStatus, checkConnectionHealth]);

  // ─── Cleanup on Unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (autoReconnectTimeoutRef.current) {
        clearTimeout(autoReconnectTimeoutRef.current);
      }
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current);
      }
      // Don't disconnect on unmount - let it persist across page changes
    };
  }, []);

  return {
    // State
    devices,
    selectedDeviceId,
    connectionStatus,
    isConnected,
    connectionSignal,
    lastActiveDevice,
    autoReconnectAttempts,

    // Methods
    connect,
    disconnect,
    enumerateDevices,
    attemptAutoReconnect,

    // Utils
    detectConnectionType,

    // Refs
    mediaStreamRef,
    audioContextRef,
  };
};
