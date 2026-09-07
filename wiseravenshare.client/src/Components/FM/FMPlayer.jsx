import React, { useEffect, useRef, useState } from 'react';
import { FiPlay, FiPause, FiSkipForward, FiSkipBack, FiVolume2, FiVolumeX, FiHeart, FiBookmark, FiAlertCircle } from 'react-icons/fi';
import { buildProxyStreamUrl } from '../../Services/fmService';

// Classify the HTMLMediaError code into a user-friendly message.
const classifyMediaError = (audio, rawUrl) => {
  const err = audio?.error;
  const isHttp = String(rawUrl || '').startsWith('http://');
  const isMixed = isHttp && typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (isMixed) {
    return 'Stream is HTTP but the page is HTTPS — routed through secure proxy. Retry.';
  }

  if (!err) {
    return 'Stream could not be started. The station may be offline.';
  }

  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was cancelled.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Network error — check your connection or the station may be down.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'Audio format not supported by this browser.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Stream format or CORS policy blocked playback. Try a different station.';
    default:
      return `Stream error (code ${err.code}). Station may be offline.`;
  }
};

const FMPlayer = ({
  station,
  isPlaying,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onLike,
  onBookmark
}) => {
  const audioRef = useRef(null);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Build ordered list of candidate URLs: direct first, proxy fallback.
  const buildCandidates = (rawUrl) => {
    const direct = String(rawUrl || '').trim();
    if (!direct) return [];
    const proxy = buildProxyStreamUrl(direct);
    const candidates = [direct];
    if (proxy !== direct) candidates.push(proxy);
    return [...new Set(candidates)];
  };

  const candidatesRef = useRef([]);
  const candidateIndexRef = useRef(0);

  // Re-create Audio node when station changes. Never auto-play on mount.
  useEffect(() => {
    const rawUrl = String(station?.streamUrl || '').trim();
    setErrorMessage('');
    setIsLoading(false);

    // Tear down existing element.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    if (!rawUrl) return undefined;

    const candidates = buildCandidates(rawUrl);
    candidatesRef.current = candidates;
    candidateIndexRef.current = 0;

    const audio = new Audio();
    audio.preload = 'none';
    audio.volume = (isMuted ? 0 : volume) / 100;
    audioRef.current = audio;

    const onError = () => {
      // Try next candidate before giving up.
      const next = candidateIndexRef.current + 1;
      if (next < candidatesRef.current.length) {
        candidateIndexRef.current = next;
        audio.src = candidatesRef.current[next];
        audio.load();
        if (isPlaying) {
          audio.play().catch(() => {});
        }
        return;
      }
      setIsLoading(false);
      setErrorMessage(classifyMediaError(audio, rawUrl));
      onPause?.();
    };

    const onCanPlay = () => setIsLoading(false);

    audio.addEventListener('error', onError);
    audio.addEventListener('canplay', onCanPlay);

    // Set src but do NOT call play() — wait for explicit user gesture.
    audio.src = candidates[0];

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('error', onError);
      audio.removeEventListener('canplay', onCanPlay);
      audioRef.current = null;
    };
  }, [station?.streamUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to play / pause state changes driven by the parent.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station?.streamUrl) return;

    if (isPlaying) {
      setErrorMessage('');
      setIsLoading(true);
      // If no src is set yet (preload=none on fresh element), set it now.
      if (!audio.src || audio.src === window.location.href) {
        const candidates = buildCandidates(station.streamUrl);
        candidatesRef.current = candidates;
        candidateIndexRef.current = 0;
        audio.src = candidates[0];
      }
      audio.play()
        .then(() => setIsLoading(false))
        .catch((err) => {
          setIsLoading(false);
          const msg = err?.name === 'NotAllowedError'
            ? 'Browser blocked autoplay — tap Play again to start the stream.'
            : classifyMediaError(audio, station?.streamUrl);
          setErrorMessage(msg);
          onPause?.();
        });
    } else {
      audio.pause();
      setIsLoading(false);
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volume / mute changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = (isMuted ? 0 : volume) / 100;
  }, [isMuted, volume]);

  return (
    <div className="fm-player">
      <div className="fm-player-left">
        <div className="fm-player-logo">
          {station?.logoUrl ? <img src={station.logoUrl} alt={station?.name || 'Station'} /> : <span>📻</span>}
        </div>
        <div className="fm-player-meta">
          <strong>{station?.name || 'FM Station'}</strong>
          <small>{station?.genre || 'General'} • {station?.frequency || ''}</small>
          {isLoading && !errorMessage && <small className="fm-loading">Connecting…</small>}
          {errorMessage && (
            <small className="fm-error">
              <FiAlertCircle style={{ marginRight: 4 }} />{errorMessage}
            </small>
          )}
        </div>
      </div>

      <div className="fm-player-controls">
        <button type="button" className="fm-icon-btn" onClick={onPrevious} aria-label="Previous station"><FiSkipBack /></button>
        <button
          type="button"
          className={`fm-icon-btn play${isLoading ? ' loading' : ''}`}
          onClick={() => (isPlaying ? onPause?.() : onPlay?.())}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={isLoading}
        >
          {isPlaying ? <FiPause /> : <FiPlay />}
        </button>
        <button type="button" className="fm-icon-btn" onClick={onNext} aria-label="Next station"><FiSkipForward /></button>
      </div>

      <div className="fm-player-actions">
        <button type="button" className={`fm-icon-btn ${station?.isLiked ? 'active' : ''}`} onClick={() => station?.id && onLike?.(station.id)} aria-label="Like station">
          <FiHeart />
        </button>
        <button type="button" className={`fm-icon-btn ${station?.isBookmarked ? 'active' : ''}`} onClick={() => station?.id && onBookmark?.(station.id)} aria-label="Bookmark station">
          <FiBookmark />
        </button>
      </div>

      <div className="fm-player-volume">
        <button type="button" className="fm-icon-btn" onClick={() => setIsMuted((prev) => !prev)} aria-label="Mute toggle">
          {isMuted || volume === 0 ? <FiVolumeX /> : <FiVolume2 />}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(event) => {
            const next = Number(event.target.value);
            setVolume(next);
            if (next > 0 && isMuted) setIsMuted(false);
          }}
        />
      </div>
    </div>
  );
};

export default FMPlayer;

