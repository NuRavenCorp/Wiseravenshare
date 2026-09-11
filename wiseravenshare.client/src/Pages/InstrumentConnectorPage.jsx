import React, { useState, useEffect, useRef } from 'react';
import {
  FiMic, FiMicOff, FiRefreshCw, FiX, FiPlay,
  FiStopCircle, FiArrowRight
} from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import { apiService } from '../Services/api';
import ConnectionIndicator from '../Components/Common/ConnectionIndicator';
import '../Styles/InstrumentConnector.css';

/**
 * InstrumentConnectorPage
 * 
 * Connects WiseRavenShare to live instruments via:
 * - USB/wired audio interfaces (USB microphone, audio interface)
 * - Bluetooth audio devices (wireless headsets, MIDI controllers)
 * - Network streams (WebRTC peer, Zernio API stream, future custom adapter)
 * 
 * Workflow:
 * 1. Enumerate available input devices
 * 2. Select and connect to a device
 * 3. Display real-time waveform/audio level
 * 4. Record raw audio or MIDI events
 * 5. Export recording to Music Studio for processing/effects
 */

function InstrumentConnectorPage({ onNavigate }) {
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  
  // State
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected', 'connecting', 'connected', 'recording', 'error'
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [connectionType, setConnectionType] = useState(null); // 'usb', 'usb-c', 'micro-usb', 'bluetooth', 'network'
  const [connectionSignal, setConnectionSignal] = useState(false);
  const [midiDevices, setMidiDevices] = useState([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState(null);
  const [studioRigProfile, setStudioRigProfile] = useState({
    id: null,
    rigName: 'WiseRaven Capture Rig',
    analogInputChannels: 2,
    hasAnalogPreamps: true,
    hasUsbCConnectivity: true,
    hasBluetoothPairing: true,
    hasMidiInOut: true,
    hasWifi6Streaming: true,
    enableIpProtection: true,
    notes: '',
  });
  const [sourceCaptures, setSourceCaptures] = useState([]);
  const [isSavingRigProfile, setIsSavingRigProfile] = useState(false);
  const [autoOpenMusicCreator, setAutoOpenMusicCreator] = useState(() => {
    try {
      return localStorage.getItem('wr_auto_open_music_creator') !== 'false';
    } catch {
      return true;
    }
  });
  
  // Refs
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const midiAccessRef = useRef(null);
  const autoConnectInFlightRef = useRef(false);

  const resolveSupportedRecorderMimeType = () => {
    const MediaRecorderCtor = window.MediaRecorder;
    if (!MediaRecorderCtor || typeof MediaRecorderCtor.isTypeSupported !== 'function') {
      return '';
    }

    const preferredTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];

    return preferredTypes.find((type) => MediaRecorderCtor.isTypeSupported(type)) || '';
  };

  const detectConnectionType = (deviceLabel) => {
    const label = String(deviceLabel || '').toLowerCase();
    if (label.includes('bluetooth') || label.includes('airpods') || label.includes('wireless')) {
      return 'bluetooth';
    }
    if (label.includes('usb-c') || label.includes('type-c') || label.includes('usbc')) {
      return 'usb-c';
    }
    if (label.includes('micro-usb') || label.includes('microusb') || label.includes('usb micro')) {
      return 'micro-usb';
    }
    if (label.includes('network') || label.includes('stream')) {
      return 'network';
    }
    if (label.includes('usb') || label.includes('interface') || label.includes('adapter')) {
      return 'usb';
    }
    return 'wired';
  };

  const registerConnection = async ({ deviceIdentifier, deviceName, transport, hardwareAddress, metadataJson }) => {
    try {
      await apiService.upsertInstrumentConnection({
        deviceIdentifier,
        deviceName,
        transport,
        hardwareAddress,
        isPaired: true,
        isTrusted: true,
        metadataJson,
      });
    } catch (err) {
      console.warn('Failed to register instrument connection:', err?.message || err);
    }
  };

  // ─── Device Enumeration ────────────────────────────────────────────
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const audioDevices = await navigator.mediaDevices.enumerateDevices();
        const inputs = audioDevices.filter(d => d.kind === 'audioinput');
        setDevices(inputs);

        showNotification(`Found ${inputs.length} audio input devices`, 'info');
      } catch (err) {
        console.error('Error enumerating devices:', err);
        showNotification('Failed to enumerate audio devices: ' + err.message, 'error');
      }
    };

    // Request permission and enumerate on load
    enumerateDevices();

    // Re-enumerate when devices change (e.g., USB plugged in)
    const handleDeviceChange = () => {
      console.log('Audio devices changed, re-enumerating...');
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    // Try to access MIDI devices (Web MIDI API)
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess()
        .then(onMIDISuccess, onMIDIFailure)
        .catch(() => console.log('Web MIDI API not available'));
    }

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [showNotification]);

  useEffect(() => {
    try {
      localStorage.setItem('wr_auto_open_music_creator', autoOpenMusicCreator ? 'true' : 'false');
    } catch {
      // Ignore storage failures and keep runtime state only.
    }
  }, [autoOpenMusicCreator]);

  useEffect(() => {
    const loadCaptureRig = async () => {
      try {
        const [profileRes, capturesRes] = await Promise.all([
          apiService.getStudioCaptureProfile(),
          apiService.getStudioCaptureSources(8),
        ]);

        const profile = profileRes?.data;
        if (profile && typeof profile === 'object') {
          setStudioRigProfile({
            id: profile.id || null,
            rigName: profile.rigName || 'WiseRaven Capture Rig',
            analogInputChannels: Number(profile.analogInputChannels || 2),
            hasAnalogPreamps: Boolean(profile.hasAnalogPreamps),
            hasUsbCConnectivity: Boolean(profile.hasUsbCConnectivity),
            hasBluetoothPairing: Boolean(profile.hasBluetoothPairing),
            hasMidiInOut: Boolean(profile.hasMidiInOut),
            hasWifi6Streaming: Boolean(profile.hasWifi6Streaming),
            enableIpProtection: Boolean(profile.enableIpProtection),
            notes: profile.notes || '',
          });
        }

        const captures = Array.isArray(capturesRes?.data) ? capturesRes.data : [];
        setSourceCaptures(captures);
      } catch (err) {
        console.warn('Unable to load capture rig profile:', err?.message || err);
      }
    };

    loadCaptureRig();
  }, []);

  const updateRigProfileField = (field, value) => {
    setStudioRigProfile((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveRigProfile = async () => {
    setIsSavingRigProfile(true);
    try {
      const payload = {
        rigName: studioRigProfile.rigName,
        analogInputChannels: Math.max(1, Number(studioRigProfile.analogInputChannels || 1)),
        hasAnalogPreamps: Boolean(studioRigProfile.hasAnalogPreamps),
        hasUsbCConnectivity: Boolean(studioRigProfile.hasUsbCConnectivity),
        hasBluetoothPairing: Boolean(studioRigProfile.hasBluetoothPairing),
        hasMidiInOut: Boolean(studioRigProfile.hasMidiInOut),
        hasWifi6Streaming: Boolean(studioRigProfile.hasWifi6Streaming),
        enableIpProtection: Boolean(studioRigProfile.enableIpProtection),
        notes: studioRigProfile.notes || '',
      };

      const response = await apiService.upsertStudioCaptureProfile(payload);
      const profile = response?.data || payload;
      setStudioRigProfile((prev) => ({
        ...prev,
        id: profile.id || prev.id,
      }));
      showNotification('Studio capture profile saved', 'success');
    } catch (err) {
      showNotification('Failed to save studio capture profile: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setIsSavingRigProfile(false);
    }
  };

  // ─── MIDI Device Enumeration ────────────────────────────────────────
  const onMIDISuccess = (midiAccess) => {
    midiAccessRef.current = midiAccess;
    const inputs = Array.from(midiAccess.inputs.values());
    setMidiDevices(inputs);
    console.log('MIDI devices found:', inputs.length);
    
    if (inputs.length > 0) {
      showNotification(`Found ${inputs.length} MIDI device(s)`, 'info');
    }
  };

  const onMIDIFailure = (err) => {
    console.warn('MIDI access denied or not available:', err);
  };

  const handleBluetoothPairing = async () => {
    if (!navigator.bluetooth) {
      showNotification('Bluetooth pairing is not supported in this browser. Pair in your OS settings.', 'warning');
      return;
    }

    try {
      const btDevice = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      showNotification('Bluetooth device selected. Refreshing audio inputs...', 'success');
      await apiService.registerBluetoothPair({
        deviceIdentifier: String(btDevice?.id || btDevice?.name || `bt-${Date.now()}`),
        deviceName: String(btDevice?.name || 'Bluetooth Audio Device'),
        metadataJson: JSON.stringify({ source: 'web-bluetooth', pairedAt: new Date().toISOString() })
      });
      const audioDevices = await navigator.mediaDevices.enumerateDevices();
      const inputs = audioDevices.filter((d) => d.kind === 'audioinput');
      setDevices(inputs);
    } catch (err) {
      if (err?.name === 'NotFoundError') {
        showNotification('No Bluetooth device selected.', 'info');
        return;
      }
      showNotification('Bluetooth pairing failed. Pair from OS settings and retry.', 'error');
    }
  };

  // ─── Connect to Device ───────────────────────────────────────────────
  const handleConnect = async (deviceId) => {
    if (!deviceId || connectionStatus === 'connecting') {
      return;
    }

    setConnectionStatus('connecting');
    setSelectedDeviceId(deviceId);

    try {
      // Request access to the selected audio input device
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

      // Initialize Web Audio API for visualization
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      analyserRef.current = analyser;

      // Detect device type from label
      const device = devices.find(d => d.deviceId === deviceId);
      if (device) {
        const detected = detectConnectionType(device.label);
        setConnectionType(detected);
        registerConnection({
          deviceIdentifier: device.deviceId,
          deviceName: device.label || 'Unknown Device',
          transport: detected,
          metadataJson: JSON.stringify({ source: 'instrument-connector', userAgent: navigator.userAgent })
        });
      }

      setConnectionStatus('connected');
      setConnectionSignal(true);
      setTimeout(() => setConnectionSignal(false), 400);
      setTimeout(() => setConnectionSignal(true), 900);
      showNotification(`Connected to: ${device?.label || 'Unknown Device'}`, 'success');

      if (autoOpenMusicCreator && typeof onNavigate === 'function') {
        try {
          localStorage.setItem('wr_instrument_handoff', JSON.stringify({
            connectedAtUtc: new Date().toISOString(),
            sourceName: device?.label || 'Unknown Device',
            sourceType: device ? detectConnectionType(device.label) : 'analog',
            deviceIdentifier: deviceId || 'unknown-device',
            rigProfileId: studioRigProfile.id || null,
          }));
        } catch {
          // Ignore local storage failures.
        }

        setTimeout(() => {
          onNavigate('radio-creator');
        }, 300);
      }

      // Start visualizer
      startWaveformVisualization();
    } catch (err) {
      console.error('Error connecting to device:', err);
      setConnectionStatus('error');
      showNotification('Failed to connect: ' + err.message, 'error');
    }
  };

  // ─── Auto Plug-and-Play Connect ──────────────────────────────────────
  useEffect(() => {
    if (
      devices.length === 0 ||
      connectionStatus === 'connected' ||
      connectionStatus === 'recording' ||
      connectionStatus === 'connecting' ||
      autoConnectInFlightRef.current
    ) {
      return;
    }

    const preferredDeviceId = selectedDeviceId && devices.some((d) => d.deviceId === selectedDeviceId)
      ? selectedDeviceId
      : devices[0]?.deviceId;

    if (!preferredDeviceId) {
      return;
    }

    autoConnectInFlightRef.current = true;
    handleConnect(preferredDeviceId)
      .finally(() => {
        autoConnectInFlightRef.current = false;
      });
  }, [devices, selectedDeviceId, connectionStatus]);

  // ─── Disconnect from Device ─────────────────────────────────────────
  const handleDisconnect = () => {
    if (isRecording) {
      handleStopRecording();
    }

    // Stop all tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Clean up audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setConnectionStatus('disconnected');
    setAudioLevel(0);
    setSelectedDeviceId(null);
    setConnectionType(null);
    showNotification('Disconnected', 'info');
  };

  // ─── Start Recording ────────────────────────────────────────────────
  const handleStartRecording = () => {
    if (isRecording || isStartingRecording) {
      return;
    }

    const stream = mediaStreamRef.current;
    if (!stream) {
      showNotification('No device connected', 'error');
      return;
    }

    const liveAudioTracks = stream.getAudioTracks().filter((track) => track.readyState === 'live');
    if (liveAudioTracks.length === 0) {
      showNotification('Connected device has no live audio input. Reconnect and try again.', 'error');
      return;
    }

    setIsStartingRecording(true);

    try {
      const mimeType = resolveSupportedRecorderMimeType();
      const recorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000, // 128 kbps
      };

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        const reason = event?.error?.message || 'Unknown recording error';
        clearInterval(recordingIntervalRef.current);
        setIsRecording(false);
        setConnectionStatus('connected');
        showNotification('Recording error: ' + reason, 'error');
      };

      mediaRecorder.onstart = () => {
        setIsStartingRecording(false);
        setIsRecording(true);
        setRecordingTime(0);
        recordingStartTimeRef.current = Date.now();
        setConnectionStatus('recording');

        // Use elapsed clock time to avoid interval drift.
        recordingIntervalRef.current = setInterval(() => {
          const startedAt = recordingStartTimeRef.current || Date.now();
          const elapsedSeconds = (Date.now() - startedAt) / 1000;
          setRecordingTime(elapsedSeconds);
        }, 100);

        showNotification('Recording started', 'success');
      };

      mediaRecorder.onstop = async () => {
        const blobType = mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type: blobType });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toLocaleString();
        const deviceLabel = devices.find(d => d.deviceId === selectedDeviceId)?.label || 'Unknown';

        let captureFingerprint = null;
        if (studioRigProfile.enableIpProtection) {
          try {
            const captureResponse = await apiService.recordStudioCaptureSource({
              rigProfileId: studioRigProfile.id || null,
              sourceType: connectionType || 'analog',
              sourceName: deviceLabel,
              deviceIdentifier: selectedDeviceId || 'unknown-device',
              fileName: `instrument-${Date.now()}.webm`,
              durationSeconds: Number(recordingTime.toFixed(2)),
              channelCount: 2,
              capturedAtUtc: new Date().toISOString(),
              metadataJson: JSON.stringify({
                transport: connectionType || 'analog',
                audioBitsPerSecond: 128000,
                mimeType: blobType,
                userAgent: navigator.userAgent,
              }),
            });
            captureFingerprint = captureResponse?.data || null;
            if (captureFingerprint) {
              setSourceCaptures((prev) => [captureFingerprint, ...prev].slice(0, 8));
            }
          } catch (captureError) {
            showNotification('Capture fingerprint logging failed: ' + (captureError?.message || 'Unknown error'), 'warning');
          }
        }

        const recording = {
          id: Date.now(),
          name: `Instrument Recording - ${deviceLabel} - ${timestamp}`,
          url,
          blob,
          duration: recordingTime,
          deviceLabel,
          connectionType,
          timestamp,
          fingerprintHash: captureFingerprint?.fingerprintHash || null,
          fingerprintedAtUtc: captureFingerprint?.fingerprintedAtUtc || null,
        };

        setRecordings(prev => [recording, ...prev]);
        setRecordedChunks([]);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);
    } catch (err) {
      console.error('Error starting recording:', err);
      setIsStartingRecording(false);
      showNotification('Failed to start recording: ' + err.message, 'error');
    }
  };

  // ─── Stop Recording ─────────────────────────────────────────────────
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      clearInterval(recordingIntervalRef.current);
      setIsRecording(false);
      setIsStartingRecording(false);
      setConnectionStatus('connected');
      showNotification('Recording saved', 'success');
    }
  };

  // ─── Waveform Visualization ────────────────────────────────────────
  const startWaveformVisualization = () => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !analyserRef.current) return;

    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Calculate RMS level
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);
      const level = Math.min(rms / 128, 1); // Normalize to 0-1
      setAudioLevel(Math.round(level * 100));

      // Clear canvas
      ctx.fillStyle = 'rgb(20, 20, 30)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw frequency visualization
      const barWidth = canvas.width / bufferLength;
      ctx.fillStyle = 'rgb(100, 200, 255)';

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth, barHeight);
      }

      // Draw center line
      ctx.strokeStyle = 'rgb(150, 150, 150)';
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  };

  // ─── Export to Music Studio ────────────────────────────────────────
  const handleExportToStudio = async (recording) => {
    try {
      // Store recording in session/local storage for Music Studio to pick up
      const recordingData = {
        name: recording.name,
        blob: recording.blob,
        url: recording.url,
        deviceLabel: recording.deviceLabel,
        connectionType: recording.connectionType,
      };

      localStorage.setItem('instrument_recording', JSON.stringify({
        ...recordingData,
        url: undefined, // Don't store blob URL in localStorage
      }));

      // Store blob separately
      sessionStorage.setItem('instrument_recording_blob', recording.blob);

      try {
        localStorage.setItem('wr_instrument_handoff', JSON.stringify({
          connectedAtUtc: new Date().toISOString(),
          sourceName: recording.deviceLabel || 'Instrument Input',
          sourceType: recording.connectionType || 'analog',
          deviceIdentifier: selectedDeviceId || 'unknown-device',
          recordingName: recording.name,
          recordingDurationSeconds: Number(recording.duration || 0),
          recordingFingerprintHash: recording.fingerprintHash || null,
        }));
      } catch {
        // Ignore local storage failures.
      }

      showNotification('Recording ready in Music Studio', 'success');

      // Navigate within the app so Radio Creator can continue processing.
      if (typeof onNavigate === 'function') {
        onNavigate('radio-creator');
      } else {
        window.location.href = '/music-player?source=instrument';
      }
    } catch (err) {
      console.error('Error exporting:', err);
      showNotification('Failed to export: ' + err.message, 'error');
    }
  };

  // ─── Delete Recording ───────────────────────────────────────────────
  const handleDeleteRecording = (recordingId) => {
    setRecordings(prev => prev.filter(r => r.id !== recordingId));
    showNotification('Recording deleted', 'info');
  };

  // ─── Format Time ────────────────────────────────────────────────────
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="instrument-connector-page">
      <div className="ic-header">
        <div className="ic-title">
          <FiMic /> Instrument Connector
        </div>
        <p className="ic-subtitle">
          Plug in or pair your instrument input and WiseRavenShare will auto-connect
        </p>
        <p className="ic-note" style={{ marginTop: '0.35rem' }}>
          BT, USB, USB-C, and Micro-USB instrument paths are fully wired for auto-detect, connect, and recording.
        </p>
        <label className="ic-note" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.5rem' }}>
          <input
            type="checkbox"
            checked={autoOpenMusicCreator}
            onChange={(e) => setAutoOpenMusicCreator(e.target.checked)}
          />
          Auto-open Radio Creator after instrument connection
        </label>
      </div>

      <div className="ic-container">
        {/* Left: Device Selection & Connection */}
        <div className="ic-panel ic-devices">
          <div className="ic-section-header">
            <h2>Audio Input Devices</h2>
            <div className="ic-section-actions">
              <button
                className="ic-btn-icon"
                onClick={handleBluetoothPairing}
                title="Pair Bluetooth device"
              >
                📶
              </button>
              <button
                className="ic-btn-icon"
                onClick={() => {
                  navigator.mediaDevices.enumerateDevices().then(audioDevices => {
                    const inputs = audioDevices.filter(d => d.kind === 'audioinput');
                    setDevices(inputs);
                    showNotification('Device list refreshed', 'info');
                  });
                }}
                title="Refresh device list"
              >
                <FiRefreshCw />
              </button>
            </div>
          </div>

          {devices.length === 0 ? (
            <div className="ic-empty-state">
              <FiMicOff />
              <p>No audio input devices found</p>
              <small>Pair Bluetooth in system settings or plug in a wired/USB device</small>
            </div>
          ) : (
            <div className="ic-device-list">
              {devices.map(device => (
                <div
                  key={device.deviceId}
                  className={`ic-device-card ${selectedDeviceId === device.deviceId ? 'active' : ''}`}
                >
                  <div className="ic-device-info">
                    <div className="ic-device-icon">
                      {detectConnectionType(device.label) === 'bluetooth' && <>📱</>}
                      {(detectConnectionType(device.label) === 'usb' || detectConnectionType(device.label) === 'usb-c' || detectConnectionType(device.label) === 'micro-usb') && <>🔌</>}
                      {detectConnectionType(device.label) === 'network' && <>🌐</>}
                      {detectConnectionType(device.label) === 'wired' && <FiMic />}
                    </div>
                    <div className="ic-device-details">
                      <div className="ic-device-label">{device.label}</div>
                      <div className="ic-device-id">ID: {device.deviceId.slice(0, 8)}...</div>
                    </div>
                  </div>
                  <div className={`ic-auto-pill ${selectedDeviceId === device.deviceId && connectionStatus !== 'disconnected' ? 'connected' : ''}`}>
                    {selectedDeviceId === device.deviceId && connectionStatus !== 'disconnected'
                      ? 'Connected'
                      : 'Plug-and-play'}
                  </div>
                </div>
              ))}
            </div>
          )}

          <small className="ic-note">
            Plug-and-play is automatic for wired USB variants (USB, USB-C, Micro-USB). Bluetooth devices must be paired in OS or browser prompt first.
          </small>

          {/* MIDI Devices */}
          {midiDevices.length > 0 && (
            <div className="ic-midi-section">
              <h3>MIDI Devices</h3>
              <div className="ic-midi-list">
                {midiDevices.map((device, idx) => (
                  <div key={idx} className="ic-midi-card">
                    <div>{device.name}</div>
                    <small>{device.manufacturer}</small>
                  </div>
                ))}
              </div>
              <small className="ic-note">
                MIDI device support coming soon - will record note/CC data alongside audio
              </small>
            </div>
          )}
        </div>

        {/* Right: Connection Status & Recording */}
        <div className="ic-panel ic-control">
          {/* Connection Status */}
          <div className="ic-section-header">
            <h2>Connection Status</h2>
          </div>

          <ConnectionIndicator
            status={connectionStatus === 'recording' ? 'connected' : connectionStatus}
            device={devices.find(d => d.deviceId === selectedDeviceId) || null}
            connectionType={connectionType}
            signal={connectionSignal}
          />

          {/* Audio Level & Waveform */}
          {connectionStatus !== 'disconnected' && (
            <>
              <div className="ic-waveform-container">
                <canvas
                  ref={waveformCanvasRef}
                  className="ic-waveform"
                  width={300}
                  height={120}
                />
              </div>

              <div className="ic-level-display">
                <div className="ic-level-label">Audio Level</div>
                <div className="ic-level-bar">
                  <div
                    className="ic-level-fill"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
                <div className="ic-level-value">{audioLevel}%</div>
              </div>
            </>
          )}

          {/* Recording Controls */}
          <div className="ic-section-header" style={{ marginTop: '1.5rem' }}>
            <h3>Recording</h3>
          </div>

          <div className="ic-recording-controls">
            {!isRecording ? (
              <button
                className="ic-btn ic-btn-primary ic-btn-recording-start"
                onClick={handleStartRecording}
                disabled={connectionStatus !== 'connected' || isStartingRecording}
              >
                <FiPlay /> {isStartingRecording ? 'Starting...' : 'Start Recording'}
              </button>
            ) : (
              <>
                <button className="ic-btn ic-btn-secondary ic-recording-timer">
                  <FiStopCircle /> {formatTime(recordingTime)}
                </button>
                <button
                  className="ic-btn ic-btn-stop"
                  onClick={handleStopRecording}
                >
                  Stop Recording
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recordings List */}
      {recordings.length > 0 && (
        <div className="ic-recordings-section">
          <div className="ic-section-header">
            <h2>Recorded Instruments</h2>
            <span className="ic-badge">{recordings.length}</span>
          </div>

          <div className="ic-recordings-grid">
            {recordings.map(recording => (
              <div key={recording.id} className="ic-recording-card">
                <div className="ic-recording-header">
                  <div className="ic-recording-icon">
                    <FiMic />
                  </div>
                  <div className="ic-recording-meta">
                    <div className="ic-recording-name">{recording.deviceLabel}</div>
                    <small className="ic-recording-time">{recording.timestamp}</small>
                  </div>
                </div>

                <div className="ic-recording-details">
                  <div className="ic-recording-duration">
                    <strong>Duration:</strong> {formatTime(recording.duration)}
                  </div>
                  <div className="ic-recording-type">
                    <strong>Type:</strong> {recording.connectionType?.toUpperCase() || 'Audio'}
                  </div>
                </div>

                <audio className="ic-player" controls>
                  <source src={recording.url} type="audio/webm" />
                  Your browser does not support the audio element.
                </audio>

                <div className="ic-recording-actions">
                  <button
                    className="ic-btn ic-btn-export"
                    onClick={() => handleExportToStudio(recording)}
                  >
                    <FiArrowRight /> Export to Studio
                  </button>
                  <button
                    className="ic-btn ic-btn-delete"
                    onClick={() => handleDeleteRecording(recording.id)}
                  >
                    <FiX /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Future Adapter Info */}
      <div className="ic-adapter-info">
        <div className="ic-section-header">
          <h3>🔧 Studio Capture Hardware Profile</h3>
        </div>
        <div className="ic-info-box">
          <p>
            Configure your active recording rig so analog/USB/USB-C/Micro-USB/Bluetooth/MIDI/WiFi capture paths are saved and
            every recorded source can be fingerprinted and timestamped for IP protection.
          </p>
          <div className="ic-rig-form-grid">
            <label className="ic-rig-field">
              <span>Rig Name</span>
              <input
                type="text"
                value={studioRigProfile.rigName}
                onChange={(e) => updateRigProfileField('rigName', e.target.value)}
                maxLength={150}
              />
            </label>
            <label className="ic-rig-field">
              <span>Analog Input Channels (XLR/1/4")</span>
              <input
                type="number"
                min={1}
                max={32}
                value={studioRigProfile.analogInputChannels}
                onChange={(e) => updateRigProfileField('analogInputChannels', e.target.value)}
              />
            </label>
          </div>

          <div className="ic-rig-checks">
            <label><input type="checkbox" checked={studioRigProfile.hasAnalogPreamps} onChange={(e) => updateRigProfileField('hasAnalogPreamps', e.target.checked)} /> XLR/1/4" analog preamps</label>
            <label><input type="checkbox" checked={studioRigProfile.hasUsbCConnectivity} onChange={(e) => updateRigProfileField('hasUsbCConnectivity', e.target.checked)} /> USB-C connectivity</label>
            <label><input type="checkbox" checked={studioRigProfile.hasBluetoothPairing} onChange={(e) => updateRigProfileField('hasBluetoothPairing', e.target.checked)} /> Bluetooth pairing</label>
            <label><input type="checkbox" checked={studioRigProfile.hasMidiInOut} onChange={(e) => updateRigProfileField('hasMidiInOut', e.target.checked)} /> MIDI In/Out</label>
            <label><input type="checkbox" checked={studioRigProfile.hasWifi6Streaming} onChange={(e) => updateRigProfileField('hasWifi6Streaming', e.target.checked)} /> WiFi 6 network streaming</label>
            <label><input type="checkbox" checked={studioRigProfile.enableIpProtection} onChange={(e) => updateRigProfileField('enableIpProtection', e.target.checked)} /> IP fingerprint + timestamp on capture</label>
          </div>

          <label className="ic-rig-field">
            <span>Rig Notes</span>
            <textarea
              value={studioRigProfile.notes}
              onChange={(e) => updateRigProfileField('notes', e.target.value)}
              maxLength={1200}
              rows={3}
            />
          </label>

          <button className="ic-btn ic-btn-primary" onClick={saveRigProfile} disabled={isSavingRigProfile}>
            {isSavingRigProfile ? 'Saving...' : 'Save Hardware Profile'}
          </button>

          <div className="ic-capture-log">
            <h4>Recent IP Fingerprints</h4>
            {sourceCaptures.length === 0 ? (
              <p className="ic-info-cta">No fingerprinted captures yet. Start a recording to generate one.</p>
            ) : (
              <div className="ic-capture-list">
                {sourceCaptures.map((item) => (
                  <div key={item.id} className="ic-capture-item">
                    <div>
                      <strong>{item.sourceName}</strong> · {String(item.sourceType || '').toUpperCase()}
                    </div>
                    <small>{new Date(item.fingerprintedAtUtc || item.capturedAtUtc).toLocaleString()}</small>
                    <code>{String(item.fingerprintHash || '').slice(0, 18)}...</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InstrumentConnectorPage;
