import React, { useEffect, useRef, useState } from 'react';
import { FiPlay, FiPause, FiSkipForward, FiSkipBack, FiVolume2, FiVolumeX, FiHeart, FiBookmark, FiAlertCircle, FiWifi } from 'react-icons/fi';
import { buildProxyStreamUrl } from '../../Services/fmService';

const classifyMediaError = (audio, rawUrl) => {
  const err = audio?.error;
  if (!err) return 'Stream could not be started. The station may be offline.';
  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was cancelled.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Network error — station may be down. Try a different station.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'Audio format not supported by this browser.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'CORS or unsupported format. Retrying via proxy…';
    default:
      return `Stream error (code ${err.code}). Station may be offline.`;
  }
};

// Build candidate URL list: try direct first, then backend proxy.
const buildCandidates = (rawUrl) => {
  const direct = String(rawUrl || '').trim();
  if (!direct) return [];
  if (direct.startsWith('/api/fmtuner/stream-proxy')) return [direct];
  const proxy = buildProxyStreamUrl(direct);
  // Always include proxy as a fallback — CORS may block direct even for HTTPS streams.
  return direct === proxy ? [direct] : [direct, proxy];
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
  const audioRef        = useRef(null);
  const candidatesRef   = useRef([]);
  const candidateIdxRef = useRef(0);
  const playIntentRef   = useRef(false);

  const [volume, setVolume]         = useState(80);
  const [isMuted, setIsMuted]       = useState(false);
  const [errorMessage, setError]    = useState('');
  const [isLoading, setIsLoading]   = useState(false);

  // ── Build / tear down the Audio element whenever the station stream changes ──
  useEffect(() => {
    const rawUrl = String(station?.streamUrl || '').trim();
    setError('');
    setIsLoading(false);
    playIntentRef.current = false;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    if (!rawUrl) return undefined;

    const candidates = buildCandidates(rawUrl);
    candidatesRef.current   = candidates;
    candidateIdxRef.current = 0;

    const audio = new Audio();
    // crossOrigin must be set BEFORE src for CORS-gated streams.
    audio.crossOrigin = 'anonymous';
    audio.preload     = 'none';
    audio.volume      = (isMuted ? 0 : volume) / 100;
    audioRef.current  = audio;

    const tryNextCandidate = () => {
      const nextIdx = candidateIdxRef.current + 1;
      if (nextIdx < candidatesRef.current.length) {
        candidateIdxRef.current = nextIdx;
        audio.src = candidatesRef.current[nextIdx];
        audio.load();
        if (playIntentRef.current) {
          audio.play().catch(() => {});
        }
      } else {
        setIsLoading(false);
        setError(classifyMediaError(audio, rawUrl));
        onPause?.();
      }
    };

    const onError  = () => tryNextCandidate();
    const onCanPlay = () => setIsLoading(false);
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => { setIsLoading(false); setError(''); };

    audio.addEventListener('error',   onError);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);

    // Set src + load() so the browser starts buffering and fires canplay.
    audio.src = candidates[0];
    audio.load();

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('error',   onError);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audioRef.current = null;
    };
  }, [station?.streamUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── React to play / pause driven by parent ────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    playIntentRef.current = isPlaying;

    if (isPlaying) {
      setError('');
      setIsLoading(true);
      audio.play()
        .then(() => setIsLoading(false))
        .catch((err) => {
          setIsLoading(false);
          if (err?.name === 'NotAllowedError') {
            setError('Tap Play again — browser requires a user gesture to start audio.');
          } else {
            // CORS may have blocked direct play; retry with proxy.
            const nextIdx = candidateIdxRef.current + 1;
            if (nextIdx < candidatesRef.current.length) {
              candidateIdxRef.current = nextIdx;
              audio.src = candidatesRef.current[nextIdx];
              audio.load();
              audio.play().catch(() => {
                setError(classifyMediaError(audio, station?.streamUrl));
                onPause?.();
              });
            } else {
              setError(classifyMediaError(audio, station?.streamUrl));
              onPause?.();
            }
          }
        });
    } else {
      audio.pause();
      setIsLoading(false);
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Volume / mute ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = (isMuted ? 0 : volume) / 100;
  }, [isMuted, volume]);

  return (
    <div className="fm-player">
      <div className="fm-player-left">
        <div className="fm-player-logo">
          {station?.logoUrl
            ? <img src={station.logoUrl} alt={station?.name || 'Station'} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            : <span>📻</span>}
        </div>
        <div className="fm-player-meta">
          <strong>{station?.name || 'FM Station'}</strong>
          <small>{station?.genre || 'General'}{station?.frequency ? ` • ${station.frequency}` : ''}</small>
          {station?.bitrate > 0 && <small>{station.bitrate} kbps {station.codec || ''}</small>}
          {isLoading && !errorMessage && (
            <small className="fm-loading"><FiWifi style={{ marginRight: 4 }} />Connecting…</small>
          )}
          {errorMessage && (
            <small className="fm-error">
              <FiAlertCircle style={{ marginRight: 4 }} />{errorMessage}
            </small>
          )}
        </div>
      </div>

      <div className="fm-player-controls">
        <button type="button" className="fm-icon-btn" onClick={onPrevious} aria-label="Previous"><FiSkipBack /></button>
        <button
          type="button"
          className={`fm-icon-btn play${isLoading ? ' loading' : ''}`}
          onClick={() => isPlaying ? onPause?.() : onPlay?.()}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying && !isLoading ? <FiPause /> : <FiPlay />}
        </button>
        <button type="button" className="fm-icon-btn" onClick={onNext} aria-label="Next"><FiSkipForward /></button>
      </div>

      <div className="fm-player-actions">
        <button type="button" className={`fm-icon-btn ${station?.isLiked ? 'active' : ''}`} onClick={() => station?.id && onLike?.(station.id)} aria-label="Like"><FiHeart /></button>
        <button type="button" className={`fm-icon-btn ${station?.isBookmarked ? 'active' : ''}`} onClick={() => station?.id && onBookmark?.(station.id)} aria-label="Bookmark"><FiBookmark /></button>
      </div>

      <div className="fm-player-volume">
        <button type="button" className="fm-icon-btn" onClick={() => setIsMuted((p) => !p)} aria-label="Mute">
          {isMuted || volume === 0 ? <FiVolumeX /> : <FiVolume2 />}
        </button>
        <input type="range" min="0" max="100" value={volume} onChange={(e) => {
          const n = Number(e.target.value);
          setVolume(n);
          if (n > 0 && isMuted) setIsMuted(false);
        }} />
      </div>
    </div>
  );
};

export default FMPlayer;


