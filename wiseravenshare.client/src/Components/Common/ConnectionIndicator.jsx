import React from 'react';
import { FiMic, FiMicOff, FiRefreshCw, FiAlertCircle, FiWifi, FiPhone } from 'react-icons/fi';
import '../../Styles/ConnectionIndicator.css';

/**
 * ConnectionIndicator Component
 * 
 * Displays real-time connection status with animated green signal indicator
 * Shows device info, connection type, and health status
 */
function ConnectionIndicator({
  status = 'disconnected', // 'disconnected', 'connecting', 'connected', 'error'
  device = null,
  connectionType = null,
  signal = false, // Animated signal trigger
  autoReconnecting = false,
  onDisconnect = null,
}) {
  const getStatusDisplay = () => {
    switch (status) {
      case 'connecting':
        return {
          icon: <FiRefreshCw className="ic-status-spinner" />,
          title: 'Connecting...',
          subtitle: 'Requesting device access',
          color: 'connecting',
        };
      case 'connected':
        return {
          icon: <FiMic className="ic-status-icon" />,
          title: 'Connected',
          subtitle: device?.label || 'Unknown Device',
          color: 'connected',
        };
      case 'error':
        return {
          icon: <FiAlertCircle className="ic-status-icon" />,
          title: 'Connection Error',
          subtitle: 'Check device and permissions',
          color: 'error',
        };
      default:
        return {
          icon: <FiMicOff className="ic-status-icon" />,
          title: 'Disconnected',
          subtitle: 'Ready to connect',
          color: 'disconnected',
        };
    }
  };

  const getConnectionTypeIcon = () => {
    switch (connectionType) {
      case 'bluetooth':
        return '📱';
      case 'usb':
        return '🔌';
      case 'network':
        return <FiWifi />;
      case 'wired':
        return '🎤';
      default:
        return null;
    }
  };

  const getConnectionTypeLabel = () => {
    switch (connectionType) {
      case 'bluetooth':
        return 'Bluetooth';
      case 'usb':
        return 'USB/Audio Interface';
      case 'network':
        return 'Network Stream';
      case 'wired':
        return 'Wired';
      default:
        return '';
    }
  };

  const display = getStatusDisplay();

  return (
    <div className={`connection-indicator connection-indicator-${display.color}`}>
      <div className="connection-indicator-content">
        {/* Left: Icon & Status */}
        <div className="connection-indicator-left">
          <div className="connection-indicator-icon">
            {display.icon}
          </div>
          <div className="connection-indicator-text">
            <div className="connection-indicator-title">
              {display.title}
              {autoReconnecting && (
                <span className="connection-indicator-reconnecting" title="Auto-reconnecting">
                  🔄
                </span>
              )}
            </div>
            <div className="connection-indicator-subtitle">
              {display.subtitle}
            </div>
          </div>
        </div>

        {/* Center: Green Signal (animated when connected) */}
        {status === 'connected' && (
          <div className={`connection-signal ${signal ? 'pulse' : ''}`}>
            <div className="connection-signal-dot"></div>
            <div className="connection-signal-pulse"></div>
          </div>
        )}

        {/* Right: Connection Type */}
        {status === 'connected' && connectionType && (
          <div className="connection-indicator-type">
            <span className="connection-type-icon">
              {getConnectionTypeIcon()}
            </span>
            <span className="connection-type-label">
              {getConnectionTypeLabel()}
            </span>
          </div>
        )}

        {/* Right: Disconnect Button */}
        {status === 'connected' && onDisconnect && (
          <button
            className="connection-indicator-close"
            onClick={onDisconnect}
            title="Disconnect device"
            aria-label="Disconnect"
          >
            ✕
          </button>
        )}
      </div>

      {/* Status Bar */}
      <div className={`connection-indicator-bar connection-bar-${display.color}`}></div>
    </div>
  );
}

export default ConnectionIndicator;
