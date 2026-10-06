import React, { useCallback, useEffect } from 'react';
import {
  FiLoader,
  FiPause,
  FiPlay,
  FiRepeat,
  FiShuffle,
  FiSkipBack,
  FiSkipForward,
  FiVolume,
  FiVolume1,
  FiVolume2,
  FiVolumeX,
} from 'react-icons/fi';
import { usePersistedAudio } from '../hooks/usePersistedAudio';
import { PlaylistPanel } from './PlaylistPanel';
import '../Styles/EnhancedMediaPlayer.css';

const SKIP_SECONDS = 10;

export const EnhancedMediaPlayer = ({
  audioRef,
  track,
  onTrackEnd,
  isPlaying,
  onPlayPauseToggle,
  onEnded,
  playlistApi,
  showPlaylist = true,
}) => {
  const endedHandler = onEnded || onTrackEnd;
  const {
    volume,
    isMuted,
    duration,
    currentTime,
    isBuffering,
    error,
    isDraggingRef,
    seek,
    skip,
    setVolume,
    toggleMute,
  } = usePersistedAudio(audioRef, track, endedHandler);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onKeyDown = (event) => {
      const tagName = event.target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA') return;

      switch (event.key) {
        case ' ': {
          event.preventDefault();
          onPlayPauseToggle?.();
          break;
        }
        case 'ArrowLeft':
          skip(-SKIP_SECONDS);
          break;
        case 'ArrowRight':
          skip(SKIP_SECONDS);
          break;
        case 'ArrowUp':
          event.preventDefault();
          setVolume(volume + 0.05);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setVolume(volume - 0.05);
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPlayPauseToggle, setVolume, skip, toggleMute, volume]);

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeekClick = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    seek(percent * duration);
  }, [duration, seek]);

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return <FiVolumeX />;
    if (volume < 0.3) return <FiVolume />;
    if (volume < 0.7) return <FiVolume1 />;
    return <FiVolume2 />;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="enhanced-media-player">
      <div className="player-info">
        <h3 className="player-title">{track?.title || 'No track selected'}</h3>
        <p className="player-artist">{track?.artist || 'Unknown artist'}</p>
        {track?.album && <p className="player-album">{track.album}</p>}
        {error && <p className="player-error" role="alert">{error}</p>}
      </div>

      <div className="player-seek-container">
        <span className="player-time-current">{formatTime(currentTime)}</span>
        <div
          className="player-seek-bar"
          onClick={handleSeekClick}
          onMouseDown={() => {
            isDraggingRef.current = true;
          }}
          onMouseUp={() => {
            isDraggingRef.current = false;
          }}
          onMouseLeave={() => {
            isDraggingRef.current = false;
          }}
          onTouchStart={() => {
            isDraggingRef.current = true;
          }}
          onTouchEnd={() => {
            isDraggingRef.current = false;
          }}
          role="slider"
          tabIndex={0}
          aria-label="Seek bar"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(currentTime)}
        >
          <div className="player-seek-progress" style={{ width: `${progressPercent}%` }}>
            <div className="player-seek-thumb" />
          </div>
        </div>
        <span className="player-time-total">{formatTime(duration)}</span>
        {isBuffering && <FiLoader className="player-buffering" aria-label="Buffering" />}
      </div>

      <div className="player-controls">
        {playlistApi && (
          <button
            className={`player-control-btn ${playlistApi.shuffle ? 'is-active' : ''}`}
            onClick={playlistApi.toggleShuffle}
            title="Shuffle"
            aria-label="Toggle shuffle"
            type="button"
          >
            <FiShuffle />
          </button>
        )}

        <button
          className="player-control-btn player-control-skip"
          onClick={() => skip(-SKIP_SECONDS)}
          title="Rewind 10 seconds"
          aria-label="Rewind 10 seconds"
          type="button"
        >
          <span className="skip-text">10s</span>
          <FiSkipBack />
        </button>

        <button
          className="player-control-btn player-control-play-pause"
          onClick={onPlayPauseToggle}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          type="button"
        >
          {isPlaying ? <FiPause /> : <FiPlay />}
        </button>

        <button
          className="player-control-btn player-control-skip"
          onClick={() => skip(SKIP_SECONDS)}
          title="Fast forward 10 seconds"
          aria-label="Fast forward 10 seconds"
          type="button"
        >
          <FiSkipForward />
          <span className="skip-text">10s</span>
        </button>

        {playlistApi && (
          <button
            className={`player-control-btn repeat-${playlistApi.repeatMode}`}
            onClick={playlistApi.cycleRepeat}
            title={`Repeat: ${playlistApi.repeatMode}`}
            aria-label="Cycle repeat mode"
            type="button"
          >
            <FiRepeat />
            {playlistApi.repeatMode === 'one' && <span className="repeat-one">1</span>}
          </button>
        )}
      </div>

      <div className="player-volume-container">
        <button
          className="player-volume-mute"
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          type="button"
        >
          {getVolumeIcon()}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={(event) => setVolume(parseFloat(event.target.value))}
          className="player-volume-slider"
          title="Volume"
          aria-label="Volume"
        />
        <span className="player-volume-value">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
      </div>

      {showPlaylist && playlistApi && (
        <PlaylistPanel
          tracks={playlistApi.tracks}
          currentIndex={playlistApi.currentIndex}
          favorites={playlistApi.favorites}
          onSelect={playlistApi.setCurrentIndex}
          onRemove={playlistApi.removeTrack}
          onToggleFavorite={playlistApi.toggleFavorite}
          onReorder={playlistApi.reorder}
          onClear={playlistApi.clearPlaylist}
        />
      )}
    </div>
  );
};

export default EnhancedMediaPlayer;
