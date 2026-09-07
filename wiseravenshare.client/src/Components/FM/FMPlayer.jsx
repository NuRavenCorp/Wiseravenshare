import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiAlertCircle, FiBookmark, FiChevronDown, FiChevronUp, FiClock, FiHeart,
  FiPause, FiPlay, FiRadio, FiRefreshCw, FiSkipBack, FiSkipForward, FiUsers,
  FiVolume2, FiVolumeX, FiWifi
} from 'react-icons/fi';
import { useRadioStream } from '../../hooks/useRadioStream';
import { fmService } from '../../Services/fmService';

const formatTime = (seconds) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

const WaveformBars = ({ data }) => {
  const bars = useMemo(
    () => Array.from(data || []).filter((_, index) => index % 2 === 0).slice(0, 48),
    [data]
  );

  if (!bars.length) return null;

  return (
    <div className="fm-waveform" aria-hidden="true">
      {bars.map((value, index) => {
        const height = Math.max(3, (value / 255) * 56);
        return <div key={index} className="fm-waveform-bar" style={{ height }} />;
      })}
    </div>
  );
};

const FMPlayer = ({
  station,
  isPlaying: parentPlaying,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onLike,
  onBookmark
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    isPlaying,
    isBuffering,
    error,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    play,
    pause,
    currentTime,
    duration,
    progress,
    seek,
    reconnect,
    nowPlaying,
    setNowPlaying,
    waveform,
    startMetaPoll,
    stopMetaPoll
  } = useRadioStream(station?.streamUrl, { enableWaveform: isExpanded });

  useEffect(() => {
    if (parentPlaying && !isPlaying) play();
    if (!parentPlaying && isPlaying) pause();
  }, [parentPlaying, isPlaying, play, pause]);

  useEffect(() => {
    if (!station?.id) {
      stopMetaPoll();
      return undefined;
    }

    const fetchMeta = async () => {
      try {
        const data = await fmService.getNowPlaying(station.id);
        if (data) setNowPlaying(data);
      } catch {
        // Metadata is best-effort.
      }
    };

    startMetaPoll(fetchMeta);
    return stopMetaPoll;
  }, [station?.id, setNowPlaying, startMetaPoll, stopMetaPoll]);

  const handleKeyDown = useCallback((event) => {
    switch (event.key) {
      case ' ':
        event.preventDefault();
        if (isPlaying) {
          pause();
          onPause?.();
        } else {
          play();
          onPlay?.();
        }
        break;
      case 'ArrowRight':
        if (duration > 0) {
          event.preventDefault();
          seek(Math.min(currentTime + 10, duration));
        }
        break;
      case 'ArrowLeft':
        if (duration > 0) {
          event.preventDefault();
          seek(Math.max(currentTime - 10, 0));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        setVolume((value) => Math.min(value + 10, 100));
        break;
      case 'ArrowDown':
        event.preventDefault();
        setVolume((value) => Math.max(value - 10, 0));
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        toggleMute();
        break;
      default:
        break;
    }
  }, [currentTime, duration, isPlaying, onPause, onPlay, pause, play, seek, setVolume, toggleMute]);

  if (!station) return null;

  const songTitle = nowPlaying?.songTitle || nowPlaying?.title || nowPlaying?.trackTitle || '';
  const artistName = nowPlaying?.artistName || nowPlaying?.artist || '';
  const albumName = nowPlaying?.album || '';

  return (
    <div className={`fm-player-wrap${isExpanded ? ' expanded' : ''}`} tabIndex={0} onKeyDown={handleKeyDown} aria-label="FM radio player">
      <div className="fm-player">
        <div className="fm-player-left">
          <div className="fm-player-logo">
            {station.logoUrl ? (
              <img
                src={station.logoUrl}
                alt={station.name}
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <FiRadio />
            )}
            {isPlaying && <span className="fm-player-live-dot" />}
          </div>
          <div className="fm-player-meta">
            <strong>{station.name}</strong>
            {songTitle ? (
              <small className="fm-now-song">{songTitle}{artistName ? ` — ${artistName}` : ''}</small>
            ) : (
              <small>{station.genre || 'Live'}{station.bitrate > 0 ? ` • ${station.bitrate} kbps` : ''}</small>
            )}
            <small>{formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : 'Live'}</small>
            {isBuffering && !error && (
              <small className="fm-loading"><FiWifi style={{ marginRight: 4 }} />Connecting…</small>
            )}
            {error && (
              <small className="fm-error">
                <FiAlertCircle style={{ marginRight: 4 }} />{error}
                {' '}<button type="button" className="fm-inline-reconnect" onClick={reconnect}>Retry</button>
              </small>
            )}
          </div>
        </div>

        <div className="fm-player-controls">
          <button type="button" className="fm-icon-btn" onClick={onPrevious} aria-label="Previous"><FiSkipBack /></button>
          <button
            type="button"
            className={`fm-icon-btn play${isBuffering ? ' loading' : ''}`}
            onClick={() => {
              if (isPlaying) {
                pause();
                onPause?.();
                return;
              }
              play();
              onPlay?.();
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isBuffering ? <FiRefreshCw className="spin" /> : isPlaying ? <FiPause /> : <FiPlay />}
          </button>
          <button type="button" className="fm-icon-btn" onClick={onNext} aria-label="Next"><FiSkipForward /></button>
        </div>

        <div className="fm-player-actions">
          <button type="button" className={`fm-icon-btn${station.isLiked ? ' active' : ''}`} onClick={() => station.id && onLike?.(station.id)} aria-label="Like"><FiHeart /></button>
          <button type="button" className={`fm-icon-btn${station.isBookmarked ? ' active' : ''}`} onClick={() => station.id && onBookmark?.(station.id)} aria-label="Bookmark"><FiBookmark /></button>
        </div>

        <div className="fm-player-volume">
          <button type="button" className="fm-icon-btn" onClick={toggleMute} aria-label="Mute">
            {isMuted || volume === 0 ? <FiVolumeX /> : <FiVolume2 />}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(event) => {
              const nextVolume = Number(event.target.value);
              setVolume(nextVolume);
              if (nextVolume > 0 && isMuted) {
                toggleMute();
              }
            }}
          />
          <span className="fm-vol-pct">{isMuted ? 0 : volume}%</span>
        </div>

        <button
          type="button"
          className="fm-icon-btn fm-expand-btn"
          onClick={() => setIsExpanded((value) => !value)}
          aria-label={isExpanded ? 'Collapse player' : 'Expand player'}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
        </button>
      </div>

      {isExpanded && (
        <div className="fm-player-expanded">
          <div className="fm-expanded-waveform">
            {isPlaying ? <WaveformBars data={waveform} /> : <div className="fm-waveform-idle">▶ Press play to see the waveform</div>}
          </div>

          <div className="fm-expanded-meta">
            {songTitle ? (
              <div className="fm-expanded-song">
                <span className="fm-expanded-label">Now playing</span>
                <span className="fm-expanded-title">{songTitle}</span>
                {artistName && <span className="fm-expanded-artist">{artistName}</span>}
                {albumName && <span className="fm-expanded-artist">{albumName}</span>}
              </div>
            ) : (
              <div className="fm-expanded-song">
                <span className="fm-expanded-label">Station info</span>
                <span className="fm-expanded-title">{station.genre || 'Live Radio'}</span>
                <span className="fm-expanded-artist">{station.country || 'Global stream'}</span>
              </div>
            )}
            <div className="fm-expanded-stats">
              {station.bitrate > 0 && <span>{station.bitrate} kbps {station.codec || ''}</span>}
              {station.country && <span>{station.country}</span>}
              {station.listeners > 0 && <span><FiUsers style={{ marginRight: 4 }} />{station.listeners.toLocaleString()}</span>}
              <span><FiClock style={{ marginRight: 4 }} />{formatTime(currentTime)}</span>
            </div>
          </div>

          <div className="fm-expanded-progress">
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(event) => {
                if (duration > 0) {
                  seek((Number(event.target.value) / 100) * duration);
                }
              }}
              aria-label="Playback progress"
            />
          </div>

          <div className="fm-expanded-keys">
            <kbd>Space</kbd> play/pause&nbsp;&nbsp;
            <kbd>←</kbd><kbd>→</kbd> seek&nbsp;&nbsp;
            <kbd>↑</kbd><kbd>↓</kbd> volume&nbsp;&nbsp;
            <kbd>M</kbd> mute
          </div>
        </div>
      )}
    </div>
  );
};

export default FMPlayer;