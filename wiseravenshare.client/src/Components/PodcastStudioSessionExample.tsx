import React, { useState } from 'react';
import { usePodcastSession } from '../Hooks/usePodcastSession';

/**
 * PodcastStudioSessionExample: Demonstrates multi-device, persistent Podcast Studio sessions
 *
 * Features:
 * - Create team sessions (all team members) or device-restricted sessions
 * - Join from multiple devices without auth interruption
 * - Sync recording state, scripts, and props across devices
 * - Automatic session restoration on page reload
 * - Token refresh without user intervention
 *
 * Usage: <PodcastStudioSession teamId="team_abc123" />
 */

export const PodcastStudioSessionExample: React.FC<{ teamId: string }> = ({ teamId }) => {
  const session = usePodcastSession(teamId);
  const [accessScope, setAccessScope] = useState<'team' | 'device-restricted'>('team');
  const [deviceName, setDeviceName] = useState('John\'s Laptop');
  const [recordingActive, setRecordingActive] = useState(false);
  const [currentScript, setCurrentScript] = useState('');

  const handleCreateSession = async () => {
    await session.createSession(accessScope);
  };

  const handleJoinDevice = async () => {
    await session.joinDevice(deviceName, 'web');
  };

  const handleSyncState = async () => {
    await session.syncState({
      recordingActive,
      currentScript,
      syncedAt: new Date().toISOString(),
    });
  };

  const handleToggleRecording = async () => {
    const newState = !recordingActive;
    setRecordingActive(newState);
    await session.syncState({
      recordingActive: newState,
      currentScript,
      syncedAt: new Date().toISOString(),
    });
  };

  if (!session.session) {
    return (
      <div className="podcast-session-setup">
        <h2>Create Podcast Studio Session</h2>
        {session.error && <div className="error">{session.error}</div>}

        <div className="form-group">
          <label>
            <input
              type="radio"
              value="team"
              checked={accessScope === 'team'}
              onChange={(e) => setAccessScope('team' as const)}
            />
            Team Session (all team members can join)
          </label>
          <label>
            <input
              type="radio"
              value="device-restricted"
              checked={accessScope === 'device-restricted'}
              onChange={(e) => setAccessScope('device-restricted' as const)}
            />
            Device-Restricted (specific team members only)
          </label>
        </div>

        <button onClick={handleCreateSession} disabled={session.isLoading}>
          {session.isLoading ? 'Creating...' : 'Create Session'}
        </button>
      </div>
    );
  }

  return (
    <div className="podcast-studio-session">
      <div className="session-header">
        <h2>Podcast Studio Session Active</h2>
        <span className={`status ${session.isConnected ? 'connected' : 'disconnected'}`}>
          {session.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
      </div>

      {!session.device ? (
        <div className="join-device">
          <h3>Join This Session</h3>
          {session.error && <div className="error">{session.error}</div>}

          <div className="form-group">
            <label>Device Name</label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g., John's Laptop, Studio Room PC"
            />
          </div>

          <button onClick={handleJoinDevice} disabled={session.isLoading}>
            {session.isLoading ? 'Joining...' : 'Join Device'}
          </button>
        </div>
      ) : (
        <div className="session-active">
          <div className="device-info">
            <h3>Your Device</h3>
            <p><strong>Device:</strong> {session.device.deviceName}</p>
            <p><strong>Type:</strong> {session.device.deviceType}</p>
            <p><strong>Token Expires:</strong> {Math.round(session.device.tokenExpiresInSeconds / 60)} minutes</p>
            <p><strong>Status:</strong> {session.device.isActive ? 'Active' : 'Inactive'}</p>
          </div>

          <div className="recording-controls">
            <h3>Recording Controls</h3>
            <button
              className={`recording-btn ${recordingActive ? 'recording' : ''}`}
              onClick={handleToggleRecording}
            >
              {recordingActive ? '⏹ Stop Recording' : '⏺ Start Recording'}
            </button>

            <div className="form-group">
              <label>Current Script/Subject</label>
              <textarea
                value={currentScript}
                onChange={(e) => setCurrentScript(e.target.value)}
                placeholder="Type or paste script content here..."
                rows={6}
              />
            </div>

            <button onClick={handleSyncState} className="sync-btn">
              Sync State to All Devices
            </button>
          </div>

          <div className="session-state">
            <h3>Session State (Shared Across Devices)</h3>
            <pre>{JSON.stringify(session.session.sessionState, null, 2)}</pre>
          </div>

          <div className="active-devices">
            <h3>Active Devices ({session.getAllDevices().length})</h3>
            <ul>
              {session.getAllDevices().map((dev) => (
                <li key={dev.id}>
                  <strong>{dev.deviceName}</strong> ({dev.deviceType}) - {dev.isActive ? '✓ Active' : '✗ Inactive'}
                </li>
              ))}
            </ul>
          </div>

          <button onClick={() => session.closeSession()} className="danger">
            Close Session
          </button>
        </div>
      )}

      <style>{`
        .podcast-session-setup,
        .podcast-studio-session {
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
          max-width: 600px;
          margin: 0 auto;
        }

        .session-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .status {
          font-weight: bold;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .status.connected {
          background: #d4edda;
          color: #155724;
        }

        .status.disconnected {
          background: #f8d7da;
          color: #721c24;
        }

        .form-group {
          margin-bottom: 15px;
        }

        label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
        }

        input[type="text"],
        textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: inherit;
        }

        textarea {
          resize: vertical;
        }

        button {
          padding: 8px 16px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-right: 8px;
          margin-bottom: 8px;
        }

        button:hover {
          background: #0056b3;
        }

        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        button.recording-btn {
          padding: 12px 24px;
          font-size: 16px;
          font-weight: bold;
          background: #6c757d;
          width: 100%;
        }

        button.recording-btn.recording {
          background: #dc3545;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        button.sync-btn {
          background: #28a745;
        }

        button.sync-btn:hover {
          background: #218838;
        }

        button.danger {
          background: #dc3545;
        }

        button.danger:hover {
          background: #c82333;
        }

        .device-info,
        .recording-controls,
        .session-state,
        .active-devices {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
        }

        .session-state pre {
          background: #f5f5f5;
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
          max-height: 300px;
        }

        .active-devices ul {
          list-style: none;
          padding: 0;
        }

        .active-devices li {
          padding: 8px;
          background: #f9f9f9;
          border-left: 3px solid #007bff;
          margin-bottom: 8px;
        }

        .error {
          color: #dc3545;
          background: #f8d7da;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
        }

        .join-device {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
};

export default PodcastStudioSessionExample;
