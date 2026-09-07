import { useState, useEffect, useRef, useCallback } from 'react';
import { buildProxyStreamUrl } from '../Services/fmService';

// ─── useRadioStream ────────────────────────────────────────────────────────────
// Centralised audio state for the FM player.
// Features merged from the HTML5 audio player reference:
//  - Direct + proxy URL candidate list (same pattern as before)
//  - Exponential-backoff auto-reconnect on stream errors
//  - Web Audio API waveform analyser (opt-in)
//  - Now-playing metadata polling (opt-in interval)
//  - Exposes all state the player UI needs
//
// The hook owns a single Audio element; it never touches the main music-studio
// audio element, so the two can coexist safely.
// ──────────────────────────────────────────────────────────────────────────────

const MAX_RECONNECTS = 6;
const WAVEFORM_FFT = 256;

const buildCandidates = (rawUrl) => {
  const direct = String(rawUrl || '').trim();
  if (!direct) return [];
  if (direct.startsWith('/api/fmtuner/stream-proxy')) return [direct];
  const proxy = buildProxyStreamUrl(direct);
  return direct === proxy ? [direct] : [direct, proxy];
};

export const useRadioStream = (streamUrl, {
  enableWaveform   = false,
  metadataInterval = 10_000,
  onNowPlaying     = null,
} = {}) => {
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [volume,      setVolume]      = useState(80);
  const [isMuted,     setIsMuted]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [error,       setError]       = useState('');
  const [nowPlaying,  setNowPlaying]  = useState(null);
  const [waveform,    setWaveform]    = useState(new Uint8Array(WAVEFORM_FFT / 2));

  const audioRef         = useRef(null);
  const audioCtxRef      = useRef(null);
  const analyserRef      = useRef(null);
  const rafRef           = useRef(null);
  const candidatesRef    = useRef([]);
  const candidateIdxRef  = useRef(0);
  const reconnectsRef    = useRef(0);
  const reconnectTimer   = useRef(null);
  const metaTimer        = useRef(null);
  const playIntentRef    = useRef(false);
  const mountedRef       = useRef(true);

  // ── Waveform animation loop ──────────────────────────────────────────────
  const startWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const tick = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      setWaveform(data);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopWaveform = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Build / attach Web Audio graph ───────────────────────────────────────
  const attachAudioGraph = useCallback((audio) => {
    if (!enableWaveform) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const analyser = ctx.createAnalyser();
      analyser.fftSize = WAVEFORM_FFT;
      analyserRef.current = analyser;

      const src = ctx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(ctx.destination);
    } catch {
      // Web Audio not available — silently skip waveform.
    }
  }, [enableWaveform]);

  // ── Exponential-backoff reconnect ────────────────────────────────────────
  const scheduleReconnect = useCallback(() => {
    if (reconnectsRef.current >= MAX_RECONNECTS) return;
    const delay = Math.min(500 * (2 ** reconnectsRef.current), 30_000);
    reconnectsRef.current += 1;
    reconnectTimer.current = setTimeout(() => {
      const audio = audioRef.current;
      if (!audio || !mountedRef.current) return;
      audio.load();
      if (playIntentRef.current) {
        audio.play().catch(() => {});
      }
    }, delay);
  }, []);

  // ── Create / tear down Audio element when stream URL changes ────────────
  useEffect(() => {
    mountedRef.current = true;
    reconnectsRef.current = 0;
    playIntentRef.current = false;
    setError('');
    setIsPlaying(false);
    setIsBuffering(false);
    stopWaveform();

    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (metaTimer.current)      clearInterval(metaTimer.current);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    const rawUrl = String(streamUrl || '').trim();
    if (!rawUrl) return undefined;

    const candidates = buildCandidates(rawUrl);
    candidatesRef.current  = candidates;
    candidateIdxRef.current = 0;

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload     = 'none';
    audio.volume      = (isMuted ? 0 : volume) / 100;
    audioRef.current  = audio;

    const tryNext = () => {
      const nextIdx = candidateIdxRef.current + 1;
      if (nextIdx < candidatesRef.current.length) {
        candidateIdxRef.current = nextIdx;
        audio.src = candidatesRef.current[nextIdx];
        audio.load();
        if (playIntentRef.current) audio.play().catch(() => {});
      } else {
        if (!mountedRef.current) return;
        setIsBuffering(false);
        setError('Stream unavailable. Reconnecting…');
        setIsPlaying(false);
        scheduleReconnect();
      }
    };

    audio.addEventListener('error',   tryNext);
    audio.addEventListener('waiting', () => mountedRef.current && setIsBuffering(true));
    audio.addEventListener('loadedmetadata', () => {
      if (!mountedRef.current) return;
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    });
    audio.addEventListener('timeupdate', () => {
      if (!mountedRef.current) return;
      setCurrentTime(audio.currentTime || 0);
    });
    audio.addEventListener('playing', () => {
      if (!mountedRef.current) return;
      setIsPlaying(true);
      setIsBuffering(false);
      setError('');
      reconnectsRef.current = 0;
      if (enableWaveform && !analyserRef.current) attachAudioGraph(audio);
      startWaveform();
    });
    audio.addEventListener('pause',   () => mountedRef.current && setIsPlaying(false));
    audio.addEventListener('canplay', () => mountedRef.current && setIsBuffering(false));

    audio.src = candidates[0];
    audio.load();

    return () => {
      mountedRef.current = false;
      stopWaveform();
      audio.pause();
      audio.src = '';
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (metaTimer.current)      clearInterval(metaTimer.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioRef.current = null;
    };
  }, [streamUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Volume / mute ────────────────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = (isMuted ? 0 : volume) / 100;
    }
  }, [volume, isMuted]);

  // ── Metadata poll (optional) ─────────────────────────────────────────────
  const startMetaPoll = useCallback((fn) => {
    if (!metadataInterval || !fn) return;
    if (metaTimer.current) clearInterval(metaTimer.current);
    fn();
    metaTimer.current = setInterval(fn, metadataInterval);
  }, [metadataInterval]);

  const stopMetaPoll = useCallback(() => {
    if (metaTimer.current) {
      clearInterval(metaTimer.current);
      metaTimer.current = null;
    }
  }, []);

  const seek = useCallback((time) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Math.max(0, Math.min(Number(time) || 0, duration || Number.MAX_SAFE_INTEGER));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [duration]);

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  // ── Public controls ──────────────────────────────────────────────────────
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    playIntentRef.current = true;
    setError('');
    setIsBuffering(true);

    if (!audio.src || audio.src === window.location.href) {
      audio.src = candidatesRef.current[0] || '';
      audio.load();
    }
    audio.play().catch((err) => {
      setIsBuffering(false);
      if (err?.name === 'NotAllowedError') {
        setError('Tap Play again — browser requires a user gesture.');
      } else {
        const nextIdx = candidateIdxRef.current + 1;
        if (nextIdx < candidatesRef.current.length) {
          candidateIdxRef.current = nextIdx;
          audio.src = candidatesRef.current[nextIdx];
          audio.load();
          audio.play().catch(() => scheduleReconnect());
        } else {
          scheduleReconnect();
        }
      }
    });
  }, [scheduleReconnect]);

  const pause = useCallback(() => {
    playIntentRef.current = false;
    audioRef.current?.pause();
    stopWaveform();
    setIsPlaying(false);
    setIsBuffering(false);
  }, [stopWaveform]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause(); else play();
  }, [isPlaying, play, pause]);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  const reconnect = useCallback(() => {
    reconnectsRef.current = 0;
    setError('');
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = candidatesRef.current[0] || '';
    audio.load();
    if (playIntentRef.current) {
      audio.play().catch(() => {});
    }
  }, []);

  return {
    isPlaying, isBuffering, error,
    volume, setVolume, isMuted, toggleMute,
    play, pause, togglePlay,
    currentTime,
    duration,
    progress,
    seek,
    reconnect,
    nowPlaying, setNowPlaying,
    waveform,
    startMetaPoll, stopMetaPoll,
  };
};
