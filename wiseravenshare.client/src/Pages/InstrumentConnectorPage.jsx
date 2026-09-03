import React, { useState, useEffect, useRef } from 'react';
import {
  FiMic, FiMicOff, FiRefreshCw, FiLink2, FiX, FiPlay,
  FiStopCircle, FiArrowRight, FiWifi, FiVolume2
} from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
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

function InstrumentConnectorPage() {
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  
  // State
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected', 'connecting', 'connected', 'recording', 'error'
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [connectionType, setConnectionType] = useState(null); // 'usb', 'bluetooth', 'network'
  const [midiDevices, setMidiDevices] = useState([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState(null);
  
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

  // ─── Device Enumeration ────────────────────────────────────────────
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const audioDevices = await navigator.mediaDevices.enumerateDevices();
        const inputs = audioDevices.filter(d => d.kind === 'audioinput');
        setDevices(inputs);
        
        // Try to detect connection type from device label
        inputs.forEach(device => {
          const label = device.label.toLowerCase();
          if (label.includes('bluetooth') || label.includes('airpods')) {
            console.log('Detected Bluetooth device:', device.label);
          } else if (label.includes('usb') || label.includes('interface')) {
            console.log('Detected USB device:', device.label);
          }
        });

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

  // ─── Connect to Device ───────────────────────────────────────────────
  const handleConnect = async (deviceId) => {
    if (connectionStatus === 'connected' || connectionStatus === 'recording') {
      handleDisconnect();
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
        const label = device.label.toLowerCase();
        if (label.includes('bluetooth') || label.includes('airpods')) {
          setConnectionType('bluetooth');
        } else if (label.includes('usb') || label.includes('interface')) {
          setConnectionType('usb');
        } else {
          setConnectionType('usb'); // default to USB/wired
        }
      }

      setConnectionStatus('connected');
      showNotification(`Connected to: ${device?.label || 'Unknown Device'}`, 'success');

      // Start visualizer
      startWaveformVisualization();
    } catch (err) {
      console.error('Error connecting to device:', err);
      setConnectionStatus('error');
      showNotification('Failed to connect: ' + err.message, 'error');
    }
  };

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
    if (!mediaStreamRef.current) {
      showNotification('No device connected', 'error');
      return;
    }

    try {
      const mimeType = 'audio/webm;codecs=opus';
      const mediaRecorder = new MediaRecorder(mediaStreamRef.current, {
        mimeType,
        audioBitsPerSecond: 128000, // 128 kbps
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toLocaleString();
        const deviceLabel = devices.find(d => d.deviceId === selectedDeviceId)?.label || 'Unknown';

        const recording = {
          id: Date.now(),
          name: `Instrument Recording - ${deviceLabel} - ${timestamp}`,
          url,
          blob,
          duration: recordingTime,
          deviceLabel,
          connectionType,
          timestamp,
        };

        setRecordings(prev => [recording, ...prev]);
        setRecordedChunks([]);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingStartTimeRef.current = Date.now();
      setConnectionStatus('recording');

      // Update recording time every 100ms
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(t => t + 0.1);
      }, 100);

      showNotification('Recording started', 'success');
    } catch (err) {
      console.error('Error starting recording:', err);
      showNotification('Failed to start recording: ' + err.message, 'error');
    }
  };

  // ─── Stop Recording ─────────────────────────────────────────────────
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      clearInterval(recordingIntervalRef.current);
      setIsRecording(false);
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

      showNotification('Recording ready in Music Studio', 'success');

      // Navigate to Music Studio
      window.location.href = '/music-player?source=instrument';
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
          Connect USB, Bluetooth, or network audio devices to record live instruments
        </p>
      </div>

      <div className="ic-container">
        {/* Left: Device Selection & Connection */}
        <div className="ic-panel ic-devices">
          <div className="ic-section-header">
            <h2>Audio Input Devices</h2>
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

          {devices.length === 0 ? (
            <div className="ic-empty-state">
              <FiMicOff />
              <p>No audio input devices found</p>
              <small>Connect a microphone, audio interface, or Bluetooth device</small>
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
                      {device.label.toLowerCase().includes('bluetooth') && <>📱</>}
                      {device.label.toLowerCase().includes('usb') && <>🔌</>}
                      {!device.label.toLowerCase().includes('bluetooth') &&
                        !device.label.toLowerCase().includes('usb') && <FiMic />}
                    </div>
                    <div className="ic-device-details">
                      <div className="ic-device-label">{device.label}</div>
                      <div className="ic-device-id">ID: {device.deviceId.slice(0, 8)}...</div>
                    </div>
                  </div>
                  <button
                    className={`ic-btn ic-btn-connect ${
                      selectedDeviceId === device.deviceId && connectionStatus !== 'disconnected'
                        ? 'connected'
                        : ''
                    }`}
                    onClick={() => handleConnect(device.deviceId)}
                  >
                    {selectedDeviceId === device.deviceId &&
                    connectionStatus !== 'disconnected' ? (
                      <>
                        <FiX /> Disconnect
                      </>
                    ) : (
                      <>
                        <FiLink2 /> Connect
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

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

          <div className={`ic-status-box ic-status-${connectionStatus}`}>
            <div className="ic-status-indicator">
              {connectionStatus === 'disconnected' && (
                <>
                  <FiMicOff className="ic-status-icon" />
                  <div>
                    <div className="ic-status-title">Disconnected</div>
                    <small>Select a device to connect</small>
                  </div>
                </>
              )}
              {connectionStatus === 'connecting' && (
                <>
                  <FiRefreshCw className="ic-status-icon spinning" />
                  <div>
                    <div className="ic-status-title">Connecting...</div>
                    <small>Requesting access to device</small>
                  </div>
                </>
              )}
              {(connectionStatus === 'connected' || connectionStatus === 'recording') && (
                <>
                  <FiMic className="ic-status-icon" />
                  <div>
                    <div className="ic-status-title">Connected</div>
                    <small>
                      {devices.find(d => d.deviceId === selectedDeviceId)?.label ||
                        'Unknown Device'}
                    </small>
                  </div>
                </>
              )}
              {connectionStatus === 'error' && (
                <>
                  <FiMicOff className="ic-status-icon" />
                  <div>
                    <div className="ic-status-title">Connection Error</div>
                    <small>Try another device or check permissions</small>
                  </div>
                </>
              )}
            </div>

            {connectionType && (
              <div className="ic-connection-type">
                {connectionType === 'bluetooth' && (
                  <>
                    <FiBluetooth /> Bluetooth
                  </>
                )}
                {connectionType === 'usb' && (
                  <>
                    <FiUsb /> USB/Wired
                  </>
                )}
                {connectionType === 'network' && (
                  <>
                    <FiWifi /> Network
                  </>
                )}
              </div>
            )}
          </div>

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
                className="ic-btn ic-btn-primary"
                onClick={handleStartRecording}
                disabled={connectionStatus !== 'connected'}
              >
                <FiPlay /> Start Recording
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
          <h3>🔧 Future: Custom Adapter Hardware</h3>
        </div>
        <div className="ic-info-box">
          <p>
            <strong>Coming Soon:</strong> WiseRavenShare is designing a professional audio adapter
            for multi-instrument studios. This dedicated hardware will support:
          </p>
          <ul>
            <li>
              <strong>XLR/1/4" analog inputs</strong> with preamps for guitars, keyboards, and mics
            </li>
            <li>
              <strong>USB-C connectivity</strong> for direct computer/tablet integration
            </li>
            <li>
              <strong>Bluetooth pairing</strong> for wireless monitoring and control
            </li>
            <li>
              <strong>MIDI In/Out</strong> for synchronized drum machines, synths, and controllers
            </li>
            <li>
              <strong>Network streaming</strong> (WiFi 6) for multi-room recording sessions
            </li>
            <li>
              <strong>Built-in IP protection</strong> - fingerprint and timestamp each source during
              capture
            </li>
          </ul>
          <p className="ic-info-cta">
            Stay tuned for availability. Subscribe to updates in your account settings.
          </p>
        </div>
      </div>
    </div>
  );
}

export default InstrumentConnectorPage;
