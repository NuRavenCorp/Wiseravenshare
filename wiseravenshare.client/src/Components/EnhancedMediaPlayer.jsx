import React, { useState, useEffect, useRef } from 'react';
import { FiPlay, FiPause, FiSkipForward, FiSkipBack, FiVolume2, FiVolume1, FiVolume, FiVolumeX } from 'react-icons/fi';
import '../Styles/EnhancedMediaPlayer.css';

/**
 * Enhanced Media Player Component
 * Provides professional-grade playback controls with:
 * - Play/Pause/Stop controls
 * - Rewind/Fast-forward (10s)
 * - Seek bar with time display (current / total)
 * - Volume control with mute
 * - Visual feedback
 */
export const EnhancedMediaPlayer = ({ audioRef, track, onTrackEnd, isPlaying, onPlayPauseToggle }) => {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const volumeBeforeMute = useRef(0.8);

  // Update duration when metadata loads
  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio) return;

    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(audio.currentTime);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', onTrackEnd);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', onTrackEnd);
    };
  }, [audioRef, isDragging, onTrackEnd]);

  // Update audio volume
  useEffect(() => {
    if (audioRef?.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted, audioRef]);

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    if (audioRef?.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSkip = (seconds) => {
    if (audioRef?.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + seconds);
    }
  };

  const handleMute = () => {
    if (isMuted) {
      setVolume(volumeBeforeMute.current);
      setIsMuted(false);
    } else {
      volumeBeforeMute.current = volume;
      setIsMuted(true);
    }
  };

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return <FiVolumeX />;
    if (volume < 0.3) return <FiVolume />;
    if (volume < 0.7) return <FiVolume1 />;
    return <FiVolume2 />;
  };

  return (
    <div className="enhanced-media-player">
      {/* Track Info */}
      <div className="player-info">
        <h3 className="player-title">{track?.title || 'No track selected'}</h3>
        <p className="player-artist">{track?.artist || 'Unknown artist'}</p>
        {track?.album && <p className="player-album">{track.album}</p>}
      </div>

      {/* Seek Bar with Time */}
      <div className="player-seek-container">
        <span className="player-time-current">{formatTime(currentTime)}</span>
        <div
          className="player-seek-bar"
          onClick={handleSeek}
          role="slider"
          tabIndex={0}
          aria-label="Seek bar"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(currentTime)}
        >
          <div
            className="player-seek-progress"
            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          >
            <div className="player-seek-thumb" />
          </div>
        </div>
        <span className="player-time-total">{formatTime(duration)}</span>
      </div>

      {/* Transport Controls */}
      <div className="player-controls">
        {/* Rewind 10s */}
        <button
          className="player-control-btn player-control-skip"
          onClick={() => handleSkip(-10)}
          title="Rewind 10 seconds"
          aria-label="Rewind 10 seconds"
        >
          <span className="skip-text">10s</span>
          <FiSkipBack />
        </button>

        {/* Play/Pause */}
        <button
          className="player-control-btn player-control-play-pause"
          onClick={onPlayPauseToggle}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <FiPause /> : <FiPlay />}
        </button>

        {/* Fast Forward 10s */}
        <button
          className="player-control-btn player-control-skip"
          onClick={() => handleSkip(10)}
          title="Fast forward 10 seconds"
          aria-label="Fast forward 10 seconds"
        >
          <FiSkipForward />
          <span className="skip-text">10s</span>
        </button>
      </div>

      {/* Volume Control */}
      <div className="player-volume-container">
        <button
          className="player-volume-mute"
          onClick={handleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {getVolumeIcon()}
        </button>
        <div className="player-volume-slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="player-volume-slider"
            title="Volume"
            aria-label="Volume"
          />
        </div>
        <span className="player-volume-value">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
      </div>
    </div>
  );
};

export default EnhancedMediaPlayer;
