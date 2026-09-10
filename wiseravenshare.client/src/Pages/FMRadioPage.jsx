import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import FMTunerModule from '../Components/FM/FMTunerModule';
import '../Styles/FMRadioPage.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const FM_LOW  = 88.0;
const FM_HIGH = 108.0;

const EQ_BANDS = [
  { freq: 31,    label: '31Hz',  type: 'lowshelf'  },
  { freq: 63,    label: '63Hz',  type: 'peaking'   },
  { freq: 125,   label: '125Hz', type: 'peaking'   },
  { freq: 250,   label: '250Hz', type: 'peaking'   },
  { freq: 500,   label: '500Hz', type: 'peaking'   },
  { freq: 1000,  label: '1kHz',  type: 'peaking'   },
  { freq: 2000,  label: '2kHz',  type: 'peaking'   },
  { freq: 4000,  label: '4kHz',  type: 'peaking'   },
  { freq: 8000,  label: '8kHz',  type: 'peaking'   },
  { freq: 16000, label: '16kHz', type: 'highshelf' },
];

const EQ_PRESETS = {
  flat:       [0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  bassBoost:  [8,  6,  4,  2,  0,  0,  0,  0,  0,  0],
  treble:     [0,  0,  0,  0,  0,  0,  2,  4,  6,  8],
  vShape:     [6,  4,  2,  0, -2, -2,  0,  2,  4,  6],
  vocal:      [-2,-1,  0,  2,  4,  4,  3,  2,  0, -1],
  rock:       [5,  4,  2,  0, -1,  0,  2,  4,  5,  6],
  jazz:       [3,  2,  1,  2, -2, -2,  0,  1,  2,  3],
  classical:  [4,  3,  2,  0,  0,  0,  0,  2,  3,  4],
  karaoke:    [0,  0,  0,  0, -6, -6, -4,  0,  0,  0],
};

const ACCEPT_AUDIO = 'audio/*,.mp3,.mp4,.wav,.flac,.ogg,.aac,.m4a,.wma,.opus';
const ACCEPT_MEDIA = 'image/*,video/*';
const LS_VOLUME    = 'wr_vol';
const LS_REPEAT    = 'wr_repeat';
const LS_SHUFFLE   = 'wr_shuffle';
const LS_EQ        = 'wr_eq';
const LS_FAVORITES = 'wr_favs';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (s) => {
  const v = Number(s);
  if (!Number.isFinite(v) || v <= 0) return '0:00';
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = Math.floor(v % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

const parseNameMeta = (filename) => {
  const base = filename.replace(/\.[^/.]+$/, '').trim();
  if (base.includes(' - ')) {
    const [artist, ...rest] = base.split(' - ');
    return { title: rest.join(' - ').trim(), artist: artist.trim(), album: '' };
  }
  return { title: base, artist: 'Unknown', album: '' };
};

const lsGet = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const lsSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

// ─── Main Component ────────────────────────────────────────────────────────────
const FMRadioPage = () => {
  // ── Tab state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('radio'); // 'radio' | 'cassette' | 'caption'

  // ── Tuner display ──────────────────────────────────────────────────────────
  const [tunedFreq, setTunedFreq]     = useState(98.5);
  const [stationName, setStationName] = useState('WISERAVENSHARE FM');
  const [isRadioPlaying]              = useState(false);

  // ── VU meter ───────────────────────────────────────────────────────────────
  const [vuAngle, setVuAngle] = useState(-45);

  // ── Persistent player state ────────────────────────────────────────────────
  const [volume, setVolume]   = useState(() => lsGet(LS_VOLUME, 0.85));
  const [isMuted, setIsMuted] = useState(false);
  const [repeat, setRepeat]   = useState(() => lsGet(LS_REPEAT, 'off'));  // off|all|one
  const [shuffle, setShuffle] = useState(() => lsGet(LS_SHUFFLE, false));
  const [eqGains, setEqGains] = useState(() => lsGet(LS_EQ, EQ_PRESETS.flat.slice()));
  const [eqPreset, setEqPreset] = useState('flat');
  const [favorites, setFavorites] = useState(() => lsGet(LS_FAVORITES, []));

  // ── Library / playback ─────────────────────────────────────────────────────
  const [library, setLibrary]           = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [trackIndex, setTrackIndex]     = useState(0);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);

  // ── UI toggles ─────────────────────────────────────────────────────────────
  const [showEq, setShowEq]         = useState(false);
  const [showQueue, setShowQueue]   = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Caption tab ────────────────────────────────────────────────────────────
  const [captionTrack, setCaptionTrack]       = useState(null);
  const [captionMediaUrl, setCaptionMediaUrl] = useState('');
  const [captionMediaType, setCaptionMediaType] = useState('');
  const [captionMediaFile, setCaptionMediaFile] = useState(null);
  const [captionPlaying, setCaptionPlaying]   = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const audioRef        = useRef(null);
  const uploadRef       = useRef(null);
  const canvasRef       = useRef(null);
  const captionAudioRef = useRef(null);
  const captionMediaRef = useRef(null);
  const containerRef    = useRef(null);

  // Web Audio refs
  const audioCtxRef     = useRef(null);
  const sourceNodeRef   = useRef(null);
  const analyserRef     = useRef(null);
  const eqFiltersRef    = useRef([]);
  const vizRafRef       = useRef(null);

  // Stable refs for stale-closure-safe callbacks
  const libraryRef  = useRef(library);
  const idxRef      = useRef(trackIndex);
  const playingRef  = useRef(isPlaying);
  const repeatRef   = useRef(repeat);
  const shuffleRef  = useRef(shuffle);
  useEffect(() => { libraryRef.current = library;     }, [library]);
  useEffect(() => { idxRef.current     = trackIndex;  }, [trackIndex]);
  useEffect(() => { playingRef.current = isPlaying;   }, [isPlaying]);
  useEffect(() => { repeatRef.current  = repeat;      }, [repeat]);
  useEffect(() => { shuffleRef.current = shuffle;     }, [shuffle]);

  // ── Persist preferences ────────────────────────────────────────────────────
  useEffect(() => { lsSet(LS_VOLUME,  volume);   }, [volume]);
  useEffect(() => { lsSet(LS_REPEAT,  repeat);   }, [repeat]);
  useEffect(() => { lsSet(LS_SHUFFLE, shuffle);  }, [shuffle]);
  useEffect(() => { lsSet(LS_EQ,      eqGains);  }, [eqGains]);
  useEffect(() => { lsSet(LS_FAVORITES, favorites); }, [favorites]);

  // ── Build / resume Web Audio graph ─────────────────────────────────────────
  const ensureGraph = useCallback(() => {
    const el = audioRef.current;
    if (!el || audioCtxRef.current) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;

    const src = ctx.createMediaElementSource(el);
    sourceNodeRef.current = src;

    // 10-band EQ
    const filters = EQ_BANDS.map((band, i) => {
      const f = ctx.createBiquadFilter();
      f.type            = band.type;
      f.frequency.value = band.freq;
      f.Q.value         = band.type === 'peaking' ? 1.0 : 0.7;
      f.gain.value      = eqGains[i] ?? 0;
      return f;
    });
    eqFiltersRef.current = filters;

    // Chain: source → eq[0] → … → eq[9] → analyser → destination
    let prev = src;
    for (const f of filters) { prev.connect(f); prev = f; }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    prev.connect(analyser);
    analyser.connect(ctx.destination);
  }, [eqGains]);

  // ── Apply EQ gains to live filters ────────────────────────────────────────
  useEffect(() => {
    eqFiltersRef.current.forEach((f, i) => {
      if (f) f.gain.value = eqGains[i] ?? 0;
    });
  }, [eqGains]);

  // ── Volume / mute ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
    audioRef.current.muted  = isMuted;
  }, [volume, isMuted]);

  // ── Spectrum visualizer ───────────────────────────────────────────────────
  const startViz = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas   = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx   = canvas.getContext('2d');
    const data  = new Uint8Array(analyser.frequencyBinCount);
    const GRAD  = ['#ffb347', '#ff8c00', '#e63946', '#a855f7', '#3b82f6'];

    const draw = () => {
      vizRafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const { width: W, height: H } = canvas;
      ctx.clearRect(0, 0, W, H);
      const barW = W / data.length;
      for (let i = 0; i < data.length; i++) {
        const barH = (data[i] / 255) * H;
        const grd  = ctx.createLinearGradient(0, H, 0, H - barH);
        const ci   = Math.floor((i / data.length) * (GRAD.length - 1));
        grd.addColorStop(0, GRAD[ci]);
        grd.addColorStop(1, GRAD[Math.min(ci + 1, GRAD.length - 1)]);
        ctx.fillStyle = grd;
        ctx.fillRect(i * barW, H - barH, barW - 1, barH);
      }
    };
    draw();
  }, []);

  const stopViz = useCallback(() => {
    if (vizRafRef.current) {
      cancelAnimationFrame(vizRafRef.current);
      vizRafRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // ── VU meter (simulated) ──────────────────────────────────────────────────
  const vuInterval = useRef(null);
  const anyPlaying = isPlaying || isRadioPlaying || captionPlaying;
  useEffect(() => {
    if (anyPlaying) {
      vuInterval.current = setInterval(() => setVuAngle(-45 + Math.random() * 90), 160);
    } else {
      clearInterval(vuInterval.current);
      setVuAngle(-45);
    }
    return () => clearInterval(vuInterval.current);
  }, [anyPlaying]);

  // ── Wire audio element events ─────────────────────────────────────────────
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onMeta  = () => setDuration(el.duration || 0);
    const onTime  = () => setCurrentTime(el.currentTime || 0);
    const onPlay  = () => { setIsPlaying(true);  startViz(); };
    const onPause = () => { setIsPlaying(false); stopViz();  };
    const onEnded = () => {
      const lib = libraryRef.current;
      const idx = idxRef.current;
      const rep = repeatRef.current;
      const shuf = shuffleRef.current;
      if (rep === 'one') { el.currentTime = 0; el.play().catch(() => {}); return; }
      if (lib.length <= 1) { setIsPlaying(false); stopViz(); return; }
      let next;
      if (shuf) {
        do { next = Math.floor(Math.random() * lib.length); } while (next === idx && lib.length > 1);
      } else if (rep === 'all' || idx < lib.length - 1) {
        next = (idx + 1) % lib.length;
      } else {
        setIsPlaying(false); stopViz(); return;
      }
      loadTrack(lib[next], next, true);
    };

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate',     onTime);
    el.addEventListener('play',           onPlay);
    el.addEventListener('pause',          onPause);
    el.addEventListener('ended',          onEnded);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate',     onTime);
      el.removeEventListener('play',           onPlay);
      el.removeEventListener('pause',          onPause);
      el.removeEventListener('ended',          onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startViz, stopViz]);

  // ── Load + optionally autoplay a track ────────────────────────────────────
  const loadTrack = useCallback((track, idx, autoPlay = false) => {
    const el = audioRef.current;
    if (!el || !track) return;
    setCurrentTrack(track);
    setTrackIndex(idx);
    setCurrentTime(0);
    setDuration(0);
    stopViz();
    el.pause();
    if (track.objectUrl) {
      el.src = track.objectUrl;
    } else {
      track.objectUrl = URL.createObjectURL(track.file);
      el.src = track.objectUrl;
    }
    el.load();
    if (autoPlay) {
      ensureGraph();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
      el.play().catch(() => {});
    }
  }, [ensureGraph, stopViz]);

  // ── Transport controls ─────────────────────────────────────────────────────
  const play = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    ensureGraph();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
    el.play().catch(() => {});
  }, [ensureGraph]);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    stopViz();
  }, [stopViz]);

  const seek = useCallback((t) => {
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);

  const rewind     = useCallback(() => seek(Math.max(0, (audioRef.current?.currentTime || 0) - 10)), [seek]);
  const fastForward = useCallback(() => seek(Math.min(duration, (audioRef.current?.currentTime || 0) + 10)), [seek, duration]);

  const skipPrev = useCallback(() => {
    if (!libraryRef.current.length) return;
    if ((audioRef.current?.currentTime || 0) > 3) { seek(0); return; }
    const prev = idxRef.current === 0 ? libraryRef.current.length - 1 : idxRef.current - 1;
    loadTrack(libraryRef.current[prev], prev, playingRef.current);
  }, [loadTrack, seek]);

  const skipNext = useCallback(() => {
    const lib = libraryRef.current;
    if (!lib.length) return;
    let next;
    if (shuffleRef.current) {
      do { next = Math.floor(Math.random() * lib.length); } while (next === idxRef.current && lib.length > 1);
    } else {
      next = (idxRef.current + 1) % lib.length;
    }
    loadTrack(lib[next], next, playingRef.current);
  }, [loadTrack]);

  const cycleRepeat = useCallback(() =>
    setRepeat((r) => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'), []);

  // ── EQ helpers ─────────────────────────────────────────────────────────────
  const applyPreset = useCallback((name) => {
    setEqGains([...EQ_PRESETS[name]]);
    setEqPreset(name);
  }, []);

  const setEqBand = useCallback((i, val) => {
    setEqGains((prev) => { const n = [...prev]; n[i] = val; return n; });
    setEqPreset('custom');
  }, []);

  // ── Favorites ──────────────────────────────────────────────────────────────
  const isFavorite = useCallback((track) => favorites.includes(track?.name), [favorites]);
  const toggleFavorite = useCallback((track) => {
    if (!track) return;
    setFavorites((prev) =>
      prev.includes(track.name) ? prev.filter((n) => n !== track.name) : [...prev, track.name],
    );
  }, []);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = useCallback((e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('audio/') || /\.(mp3|mp4|wav|flac|ogg|aac|m4a|wma|opus)$/i.test(f.name),
    );
    if (!files.length) return;
    const tracks = files.map((f, i) => ({
      id:   `${f.name}-${f.lastModified}-${i}`,
      name: f.name,
      file: f,
      ...parseNameMeta(f.name),
      objectUrl: null,
    }));
    setLibrary((prev) => {
      const combined = [...prev, ...tracks];
      if (!currentTrack) loadTrack(combined[0], 0, false);
      return combined;
    });
    e.target.value = '';
  }, [currentTrack, loadTrack]);

  // ── Queue management ───────────────────────────────────────────────────────
  const removeTrack = useCallback((id) => {
    setLibrary((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (currentTrack?.id === id) {
        if (next.length) loadTrack(next[0], 0, false);
        else { setCurrentTrack(null); stop(); }
      }
      return next;
    });
  }, [currentTrack, loadTrack, stop]);

  const clearQueue = useCallback(() => {
    setLibrary([]);
    setCurrentTrack(null);
    stop();
  }, [stop]);

  const moveTrack = useCallback((id, dir) => {
    setLibrary((prev) => {
      const i = prev.findIndex((t) => t.id === id);
      if (i < 0) return prev;
      const next = [...prev];
      const to = dir === 'up' ? i - 1 : i + 1;
      if (to < 0 || to >= next.length) return prev;
      [next[i], next[to]] = [next[to], next[i]];
      if (currentTrack?.id === id) setTrackIndex(to);
      return next;
    });
  }, [currentTrack]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      switch (e.key) {
        case ' ':           e.preventDefault(); isPlaying ? pause() : play(); break;
        case 'ArrowLeft':   e.preventDefault(); e.shiftKey ? skipPrev() : rewind();       break;
        case 'ArrowRight':  e.preventDefault(); e.shiftKey ? skipNext() : fastForward();  break;
        case 'ArrowUp':     e.preventDefault(); setVolume((v) => Math.min(1, v + 0.05));  break;
        case 'ArrowDown':   e.preventDefault(); setVolume((v) => Math.max(0, v - 0.05));  break;
        case 'e': case 'E': e.preventDefault(); setShowEq((x) => !x);   break;
        case 'q': case 'Q': e.preventDefault(); setShowQueue((x) => !x); break;
        case 'm': case 'M': e.preventDefault(); setIsMuted((x) => !x);   break;
        case 'f': case 'F':
          e.preventDefault();
          if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.().catch(() => {});
          }
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlaying, play, pause, rewind, fastForward, skipPrev, skipNext]);

  // ── Fullscreen change ──────────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Caption tab ────────────────────────────────────────────────────────────
  const handleCaptionMediaPick = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (captionMediaUrl) URL.revokeObjectURL(captionMediaUrl);
    const url = URL.createObjectURL(file);
    setCaptionMediaFile(file);
    setCaptionMediaUrl(url);
    setCaptionMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    e.target.value = '';
  };
  const captionPlay = () => {
    if (!captionTrack || !captionAudioRef.current) return;
    if (!captionAudioRef.current.src) captionAudioRef.current.src = URL.createObjectURL(captionTrack.file);
    captionAudioRef.current.play().catch(() => {});
    setCaptionPlaying(true);
    if (captionMediaType === 'video') captionMediaRef.current?.play().catch(() => {});
  };
  const captionStop = () => {
    captionAudioRef.current?.pause();
    captionMediaRef.current?.pause();
    setCaptionPlaying(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const needlePct  = `${((tunedFreq - FM_LOW) / (FM_HIGH - FM_LOW)) * 100}%`;
  const progress   = duration > 0 ? (currentTime / duration) * 100 : 0;
  const trackMeta  = currentTrack ? parseNameMeta(currentTrack.name) : null;

  return (
    <div ref={containerRef} className={`wr-shell${isFullscreen ? ' wr-fullscreen' : ''}`}>
      <audio ref={audioRef} preload="auto" />
      <audio ref={captionAudioRef} preload="none" />

      <div className="wr-cabinet">

        {/* Brand */}
        <div className="wr-brand">
          <h1>WISERAVENSHARE</h1>
          <div className="wr-model">WR-77  ·  FM / CASSETTE  ·  10-BAND EQ  ·  HI-FI</div>
        </div>

        <div className="wr-grille" />

        {/* VU meter */}
        <div className="wr-vu">
          <div className="wr-vu-label">VU</div>
          <div className="wr-vu-arc" />
          <div className="wr-vu-needle" style={{ transform: `translateX(-50%) rotate(${vuAngle}deg)` }} />
          <div className="wr-vu-pivot" />
        </div>

        {/* Tuner display */}
        <div className="wr-tuner-display">
          <div className="wr-freq-row">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="wr-freq-val">{tunedFreq.toFixed(1)}</span>
              <span className="wr-freq-unit">MHz</span>
            </div>
            <div className="wr-stereo-led">
              <div className={`wr-led${anyPlaying ? ' on' : ''}`} />
              STEREO
            </div>
          </div>
          <div className="wr-station-ticker">
            {tab === 'cassette' && currentTrack ? currentTrack.name : stationName}
          </div>
        </div>

        {/* Analog dial */}
        <div className="wr-dial-assembly">
          <div className="wr-dial-scale">
            <div className="wr-dial-ticks" />
            <div className="wr-dial-numbers">
              {[88, 92, 96, 100, 104, 108].map((n) => <span key={n}>{n}</span>)}
            </div>
            <div className="wr-dial-needle" style={{ left: needlePct }} />
            <input type="range" className="wr-dial-range"
              min={FM_LOW} max={FM_HIGH} step={0.1} value={tunedFreq}
              onChange={(e) => setTunedFreq(parseFloat(e.target.value))}
            />
          </div>
        </div>

        {/* Source tabs */}
        <div className="wr-source-tabs">
          <button className={`wr-source-btn${tab === 'radio'    ? ' active' : ''}`} onClick={() => setTab('radio')}>📻 FM RADIO</button>
          <button className={`wr-source-btn${tab === 'cassette' ? ' active' : ''}`} onClick={() => setTab('cassette')}>📼 CASSETTE</button>
          <button className={`wr-source-btn${tab === 'caption'  ? ' active' : ''}`} onClick={() => setTab('caption')}>🎬 CAPTION</button>
        </div>

        {/* ─── FM RADIO ─── */}
        {tab === 'radio' && (
          <div className="wr-fm-section"><FMTunerModule /></div>
        )}

        {/* ─── CASSETTE DECK ─── */}
        {tab === 'cassette' && (
          <div className="wr-cassette-deck">
            <div className="wr-deck-label">◄◄ CASSETTE DECK · 10-BAND EQ · MP3/WAV/FLAC/M4A/OGG ►►</div>

            {/* Spectrum visualizer */}
            <div className="wr-viz-wrap">
              <canvas ref={canvasRef} className="wr-canvas" width={800} height={72} />
              {!isPlaying && <div className="wr-viz-idle">▶ PRESS PLAY FOR SPECTRUM ANALYZER</div>}
            </div>

            {/* Track info */}
            <div className="wr-track-info">
              <div className="wr-track-art">
                {isFavorite(currentTrack) ? '⭐' : '🎵'}
              </div>
              <div className="wr-track-meta">
                <div className="wr-track-title">{trackMeta?.title || 'No track loaded'}</div>
                <div className="wr-track-artist">{trackMeta?.artist || '—'}</div>
                {trackMeta?.album && <div className="wr-track-album">{trackMeta.album}</div>}
              </div>
              <button
                className={`wr-fav-btn${isFavorite(currentTrack) ? ' active' : ''}`}
                onClick={() => toggleFavorite(currentTrack)}
                title="Toggle favorite"
                disabled={!currentTrack}
              >
                {isFavorite(currentTrack) ? '★' : '☆'}
              </button>
            </div>

            {/* Cassette door with spinning reels */}
            <div className="wr-cassette-door">
              <div className="wr-tape-visual">
                <div className={`wr-reel left${isPlaying ? ' spinning' : ''}`} />
                <div className="wr-tape-ribbon" />
                <div className={`wr-reel right${isPlaying ? ' spinning' : ''}`} />
              </div>
              <div className="wr-cassette-label">{currentTrack?.name || 'NO TAPE INSERTED'}</div>
            </div>

            {/* Progress bar */}
            <div className="wr-seek-row">
              <span className="wr-time">{fmt(currentTime)}</span>
              <div className="wr-seek-wrap">
                <input type="range" className="wr-seek"
                  min={0} max={duration || 0} step={0.1} value={currentTime}
                  onChange={(e) => seek(parseFloat(e.target.value))}
                  disabled={!currentTrack}
                />
                <div className="wr-seek-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="wr-time">{fmt(duration)}</span>
            </div>

            {/* Transport */}
            <div className="wr-transport">
              <button className="wr-key" title="Previous [Shift+←]" onClick={skipPrev}   disabled={!library.length}>⏮</button>
              <button className="wr-key" title="Rewind 10s [←]"    onClick={rewind}     disabled={!currentTrack}>◀◀</button>
              <button className={`wr-key${isPlaying ? ' active' : ''}`} title="Play [Space]" onClick={play} disabled={!currentTrack}>▶</button>
              <button className="wr-key" title="Pause [Space]"     onClick={pause}      disabled={!isPlaying}>❚❚</button>
              <button className="wr-key" title="Stop"              onClick={stop}       disabled={!currentTrack}>■</button>
              <button className="wr-key" title="FF 10s [→]"        onClick={fastForward} disabled={!currentTrack}>▶▶</button>
              <button className="wr-key" title="Next [Shift+→]"    onClick={skipNext}   disabled={!library.length}>⏭</button>
            </div>

            {/* Mode row: shuffle / repeat / eq / queue / fullscreen */}
            <div className="wr-mode-row">
              <button className={`wr-mode-btn${shuffle ? ' active' : ''}`} onClick={() => setShuffle((s) => !s)} title="Shuffle">⇄</button>
              <button className={`wr-mode-btn${repeat !== 'off' ? ' active' : ''}`} onClick={cycleRepeat} title={`Repeat: ${repeat}`}>
                {repeat === 'one' ? '↺¹' : '↺'}
              </button>
              <button className={`wr-mode-btn${showEq ? ' active' : ''}`} onClick={() => setShowEq((x) => !x)} title="Equalizer [E]">EQ</button>
              <button className={`wr-mode-btn${showQueue ? ' active' : ''}`} onClick={() => setShowQueue((x) => !x)} title="Queue [Q]">Q</button>
              <button className="wr-mode-btn" onClick={() => {
                if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.().catch(() => {});
                else document.exitFullscreen?.().catch(() => {});
              }} title="Fullscreen [F]">{isFullscreen ? '⛶' : '⛶'}</button>
            </div>

            {/* Volume */}
            <div className="wr-vol-row">
              <button className="wr-key" style={{ width: 34, height: 28, fontSize: '.72rem' }}
                onClick={() => setIsMuted((m) => !m)}>
                {isMuted ? '🔇' : '🔊'}
              </button>
              <input type="range" className="wr-vol" min={0} max={1} step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
              />
              <span className="wr-vol-pct">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
            </div>

            {/* ── 10-Band EQ ── */}
            {showEq && (
              <div className="wr-eq-panel">
                <div className="wr-eq-header">
                  <span className="wr-eq-title">10-BAND EQUALIZER</span>
                  <div className="wr-eq-presets">
                    {Object.keys(EQ_PRESETS).map((p) => (
                      <button key={p} className={`wr-preset-btn${eqPreset === p ? ' active' : ''}`}
                        onClick={() => applyPreset(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="wr-eq-bands">
                  {EQ_BANDS.map((band, i) => (
                    <div key={band.freq} className="wr-eq-band">
                      <span className="wr-eq-val">{eqGains[i] > 0 ? '+' : ''}{eqGains[i]?.toFixed(0) ?? 0}</span>
                      <input type="range" className="wr-eq-slider" orient="vertical"
                        min={-12} max={12} step={0.5}
                        value={eqGains[i] ?? 0}
                        onChange={(e) => setEqBand(i, parseFloat(e.target.value))}
                      />
                      <span className="wr-eq-label">{band.label}</span>
                    </div>
                  ))}
                </div>
                <button className="wr-preset-btn" onClick={() => applyPreset('flat')} style={{ marginTop: 8 }}>Reset</button>
              </div>
            )}

            {/* ── Queue / playlist ── */}
            {showQueue && (
              <div className="wr-queue-panel">
                <div className="wr-queue-header">
                  <span className="wr-eq-title">QUEUE ({library.length})</span>
                  <button className="wr-preset-btn" onClick={clearQueue} disabled={!library.length}>Clear</button>
                </div>
                {library.length === 0 ? (
                  <div className="wr-loading" style={{ animation: 'none', opacity: .5, padding: 12 }}>Queue is empty — load files below</div>
                ) : (
                  <div className="wr-tape-rack">
                    {library.map((t, i) => (
                      <div key={t.id} className={`wr-queue-item${currentTrack?.id === t.id ? ' active' : ''}`}>
                        <button className="wr-q-play" onClick={() => loadTrack(t, i, true)} title="Play">
                          {currentTrack?.id === t.id && isPlaying ? '▶' : '○'}
                        </button>
                        <span className="wr-tape-name" onClick={() => loadTrack(t, i, true)}>
                          {isFavorite(t) && '⭐ '}{t.title || t.name}
                        </span>
                        <button className="wr-q-btn" onClick={() => moveTrack(t.id, 'up')}  title="Move up">↑</button>
                        <button className="wr-q-btn" onClick={() => moveTrack(t.id, 'down')} title="Move down">↓</button>
                        <button className={`wr-q-btn${isFavorite(t) ? ' fav' : ''}`} onClick={() => toggleFavorite(t)} title="Favorite">★</button>
                        <button className="wr-q-btn rm" onClick={() => removeTrack(t.id)} title="Remove">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Upload */}
            <input type="file" ref={uploadRef} accept={ACCEPT_AUDIO} multiple style={{ display: 'none' }} onChange={handleUpload} />
            <button className="wr-insert-tape" onClick={() => uploadRef.current?.click()}>
              ⏏ LOAD FILES — mp3 · wav · flac · m4a · ogg · aac · opus
            </button>

            {/* Keyboard help */}
            <div className="wr-kb-help">
              <kbd>Space</kbd>play/pause &nbsp;
              <kbd>←</kbd><kbd>→</kbd>seek &nbsp;
              <kbd>Shift+←</kbd><kbd>Shift+→</kbd>skip &nbsp;
              <kbd>↑↓</kbd>vol &nbsp;
              <kbd>E</kbd>eq &nbsp;
              <kbd>Q</kbd>queue &nbsp;
              <kbd>M</kbd>mute &nbsp;
              <kbd>F</kbd>fullscreen
            </div>
          </div>
        )}

        {/* ─── CAPTION TAB ─── */}
        {tab === 'caption' && (
          <div className="wr-cassette-deck">
            <div className="wr-deck-label">▸ CAPTION PHOTOS & VIDEOS WITH MUSIC</div>
            <div className="wr-caption-panel">
              <div className="wr-caption-label">▸ 1. SELECT MUSIC TRACK FROM QUEUE</div>
              {library.length === 0 ? (
                <div className="wr-loading" style={{ animation: 'none', opacity: .55, padding: '8px 0' }}>
                  Load tracks in the Cassette tab first
                </div>
              ) : (
                <div className="wr-tape-rack" style={{ marginBottom: 12 }}>
                  {library.map((t) => (
                    <button key={t.id} className={`wr-tape-item${captionTrack?.id === t.id ? ' active' : ''}`}
                      onClick={() => { setCaptionTrack(t); setCaptionPlaying(false); if (captionAudioRef.current) captionAudioRef.current.src = ''; }}>
                      <span>📼</span>
                      <span className="wr-tape-name">{t.title || t.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="wr-caption-label">▸ 2. SELECT PHOTO OR VIDEO</div>
              <div className="wr-caption-grid">
                <label className={`wr-caption-slot${captionMediaFile ? ' filled' : ''}`}>
                  {captionMediaFile ? `✓ ${captionMediaFile.name}` : '📁 Pick photo or video'}
                  <input type="file" accept={ACCEPT_MEDIA} style={{ display: 'none' }} onChange={handleCaptionMediaPick} />
                </label>
                <div className="wr-caption-slot" style={{ cursor: 'default' }}>
                  <div style={{ fontSize: '.85rem', marginBottom: 4 }}>🎵 Track</div>
                  <div style={{ fontSize: '.7rem', opacity: .7 }}>{captionTrack ? (captionTrack.title || captionTrack.name) : 'None selected'}</div>
                </div>
              </div>

              <div className="wr-caption-preview">
                {captionMediaUrl && captionMediaType === 'image' && <img src={captionMediaUrl} alt="preview" />}
                {captionMediaUrl && captionMediaType === 'video' && (
                  <video ref={captionMediaRef} src={captionMediaUrl} controls style={{ maxWidth: '100%' }} />
                )}
                {!captionMediaUrl && <span>▸ Preview appears here</span>}
              </div>

              {captionTrack && <div className="wr-caption-track-info">🎵 {captionTrack.title || captionTrack.name}</div>}

              <div className="wr-transport">
                <button className={`wr-key${captionPlaying ? ' active' : ''}`} onClick={captionPlay} disabled={!captionTrack}>▶ PLAY</button>
                <button className="wr-key" onClick={captionStop} disabled={!captionPlaying}>■ STOP</button>
              </div>

              <div style={{ marginTop: 8, fontSize: '.65rem', color: 'rgba(255,179,71,.45)', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '.1em' }}>
                TIP: Select a track + media then press PLAY — music and video play simultaneously.
              </div>
            </div>
          </div>
        )}

        {/* Status strip */}
        <div className="wr-status">
          <span><span className={`wr-status-dot${anyPlaying ? ' live' : ''}`} />{anyPlaying ? 'PLAYING' : 'STANDBY'}</span>
          <span>{tab === 'radio' ? 'FM STEREO' : tab === 'cassette' ? `TAPE  REP:${repeat.toUpperCase()}  ${shuffle ? 'SHUF' : ''}` : 'CAPTION'}</span>
          <span>WR-77</span>
        </div>
      </div>
    </div>
  );
};

export default FMRadioPage;
