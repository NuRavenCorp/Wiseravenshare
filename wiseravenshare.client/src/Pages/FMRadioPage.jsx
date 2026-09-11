/**
 * FMRadioPage.jsx
 *
 * FM Radio + Cassette Deck with full codec support via Howler.js:
 *   MP3, MP4 (audio/video), FLAC, WAV, OGG, AAC, M4A, OPUS, WMA
 *
 * Features:
 *  - Howler.js for cross-browser codec detection + fallback
 *  - 10-band Web Audio EQ wired through Howler's AudioContext
 *  - Real-time spectrum analyser canvas
 *  - Shuffle / Repeat (off | all | one)
 *  - Queue management (add / remove / reorder / clear)
 *  - Favorites persisted to localStorage
 *  - Volume + mute, seek, track metadata from filename
 *  - Keyboard shortcuts
 *  - Fullscreen
 *  - Media-captioning tab (photo/video + music simultaneously)
 */

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { Howl, Howler } from 'howler';
import FMTunerModule from '../Components/FM/FMTunerModule';
import '../Styles/FMRadioPage.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const FM_LOW  = 88.0;
const FM_HIGH = 108.0;
const MUSIC_LIBRARY_CACHE_KEY = 'wiseMusic_library';

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
  flat:      [0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  bassBoost: [8,  6,  4,  2,  0,  0,  0,  0,  0,  0],
  treble:    [0,  0,  0,  0,  0,  0,  2,  4,  6,  8],
  vShape:    [6,  4,  2,  0, -2, -2,  0,  2,  4,  6],
  vocal:     [-2,-1,  0,  2,  4,  4,  3,  2,  0, -1],
  rock:      [5,  4,  2,  0, -1,  0,  2,  4,  5,  6],
  jazz:      [3,  2,  1,  2, -2, -2,  0,  1,  2,  3],
  classical: [4,  3,  2,  0,  0,  0,  0,  2,  3,  4],
  karaoke:   [0,  0,  0,  0, -6, -6, -4,  0,  0,  0],
};

const FALLBACK_AUDIO_CANDIDATES = [
  'https://ice6.somafm.com/groovesalad-128-mp3',
  'https://playerservices.streamtheworld.com/api/livestream-redirect/WCBSFMAAC.aac',
  'https://playerservices.streamtheworld.com/api/livestream-redirect/WBLSFMAAC.aac'
];

// Map extension → MIME so Howler picks the right codec
const EXT_MIME = {
  mp3:  'audio/mpeg',
  mp4:  'audio/mp4',
  m4a:  'audio/mp4',
  aac:  'audio/aac',
  flac: 'audio/flac',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  oga:  'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  weba: 'audio/webm',
  webm: 'audio/webm',
  wma:  'audio/x-ms-wma',
};

const mimeForFile = (filename) => {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return EXT_MIME[ext] || 'audio/mpeg';
};

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

const parseMeta = (filename) => {
  const base = filename.replace(/\.[^/.]+$/, '').trim();
  if (base.includes(' - ')) {
    const [artist, ...rest] = base.split(' - ');
    return { title: rest.join(' - ').trim(), artist: artist.trim() };
  }
  return { title: base, artist: 'Unknown' };
};

const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb; } catch { return fb; } };
const lsSet = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const normalizeLibraryTrack = (track) => {
  if (!track || typeof track !== 'object') return null;

  const normalizePlaybackUrl = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/') || raw.startsWith('api/')) {
      return raw.startsWith('/') ? raw : `/${raw}`;
    }
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('data:')) return raw;
    if (raw.startsWith('blob:')) return raw;
    return '';
  };

  const toBlobStreamUrl = (relativePath = '') => {
    const normalized = String(relativePath || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (!normalized) return '';
    const encoded = normalized
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return encoded ? `/api/videostreaming/blob/${encoded}` : '';
  };

  const fileName = String(track.name || track.fileName || track.title || 'Untitled').trim();
  const artist = String(track.artist || '').trim();
  const title = String(track.title || '').trim() || parseMeta(fileName).title;
  const relativePath = String(track.relativePath || track.RelativePath || track.objectKey || track.ObjectKey || '').trim();
  const directUrl = normalizePlaybackUrl(track.mediaUrl || track.url || track.fileUrl || track.publicUrl || track.MediaUrl || track.Url || '');
  const blobStreamUrl = toBlobStreamUrl(relativePath);
  const fileNameStreamUrl = fileName ? `/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}` : '';
  const mediaUrl = blobStreamUrl || fileNameStreamUrl || directUrl;

  return {
    id: String(track.id || `${fileName}-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: fileName,
    title,
    artist: artist || parseMeta(fileName).artist,
    fileName,
    relativePath,
    mediaUrl,
    url: mediaUrl,
    file: track.file || null,
    objectUrl: track.objectUrl || null,
  };
};

const resolveTrackSourceCandidates = (track) => {
  if (!track) return [];

  const rawDirect = String(track.mediaUrl || track.url || track.objectUrl || '').trim();
  const normalizedDirect = rawDirect.startsWith('api/') ? `/${rawDirect}` : rawDirect;
  const relativePath = String(track.relativePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const encodedRelativePath = relativePath
    ? relativePath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/')
    : '';
  const blobStream = encodedRelativePath ? `/api/videostreaming/blob/${encodedRelativePath}` : '';
  const fileName = String(track.fileName || track.name || '').trim();
  const fileNameStream = fileName ? `/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}` : '';
  const proxy = /^https?:\/\//i.test(normalizedDirect)
    ? `/api/fmtuner/stream-proxy?url=${encodeURIComponent(normalizedDirect)}`
    : '';
  const fileObjectUrl = track.file ? URL.createObjectURL(track.file) : '';

  return [...new Set([
    normalizedDirect,
    blobStream,
    fileNameStream,
    proxy,
    fileObjectUrl,
    ...FALLBACK_AUDIO_CANDIDATES
  ].filter(Boolean))];
};

// ─── Component ────────────────────────────────────────────────────────────────
const FMRadioPage = () => {
  // Tabs
  const [tab, setTab] = useState('radio');

  // FM tuner display
  const [tunedFreq,    setTunedFreq]    = useState(98.5);
  const [stationName]                   = useState('WISERAVENSHARE FM');
  const [isRadioPlaying]                = useState(false);

  // Persistent prefs
  const [volume,    setVolume]    = useState(() => lsGet('wr_vol',  0.85));
  const [isMuted,   setIsMuted]   = useState(false);
  const [repeat,    setRepeat]    = useState(() => lsGet('wr_rep',  'off')); // off|all|one
  const [shuffle,   setShuffle]   = useState(() => lsGet('wr_shuf', false));
  const [eqGains,   setEqGains]   = useState(() => lsGet('wr_eq',   EQ_PRESETS.flat.slice()));
  const [eqPreset,  setEqPreset]  = useState('flat');
  const [favorites, setFavorites] = useState(() => lsGet('wr_favs', []));
  const [theme, setTheme] = useState(() => lsGet('wr_theme', 'classic'));

  // Persist on change
  useEffect(() => { lsSet('wr_vol',  volume);    }, [volume]);
  useEffect(() => { lsSet('wr_rep',  repeat);    }, [repeat]);
  useEffect(() => { lsSet('wr_shuf', shuffle);   }, [shuffle]);
  useEffect(() => { lsSet('wr_eq',   eqGains);   }, [eqGains]);
  useEffect(() => { lsSet('wr_favs', favorites); }, [favorites]);
  useEffect(() => { lsSet('wr_theme', theme); }, [theme]);

  // Playback state
  const [library,      setLibrary]      = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [trackIndex,   setTrackIndex]   = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [loadError,    setLoadError]    = useState('');

  // UI toggles
  const [showEq,       setShowEq]       = useState(false);
  const [showQueue,    setShowQueue]    = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Caption tab
  const [captionTrack,     setCaptionTrack]     = useState(null);
  const [captionMediaUrl,  setCaptionMediaUrl]  = useState('');
  const [captionMediaType, setCaptionMediaType] = useState('');
  const [captionMediaFile, setCaptionMediaFile] = useState(null);
  const [captionPlaying,   setCaptionPlaying]   = useState(false);

  // Refs
  const howlRef         = useRef(null);   // current Howl instance
  const uploadRef       = useRef(null);
  const canvasRef       = useRef(null);   // classic viz canvas
  const modCanvasRef    = useRef(null);   // modern viz canvas
  const captionAudioRef = useRef(null);
  const captionMediaRef = useRef(null);
  const containerRef    = useRef(null);
  const vizRafRef       = useRef(null);
  const tickRef         = useRef(null);   // time-update interval

  // Web Audio nodes wired into Howler's ctx
  const eqFiltersRef  = useRef([]);
  const analyserRef   = useRef(null);
  const eqWiredRef    = useRef(false);   // built only once

  // Stable refs for event callbacks
  const libraryRef  = useRef(library);
  const idxRef      = useRef(trackIndex);
  const playingRef  = useRef(isPlaying);
  const repeatRef   = useRef(repeat);
  const shuffleRef  = useRef(shuffle);
  useEffect(() => { libraryRef.current  = library;    }, [library]);
  useEffect(() => { idxRef.current      = trackIndex; }, [trackIndex]);
  useEffect(() => { playingRef.current  = isPlaying;  }, [isPlaying]);
  useEffect(() => { repeatRef.current   = repeat;     }, [repeat]);
  useEffect(() => { shuffleRef.current  = shuffle;    }, [shuffle]);

  // Pull durable tracks that Music Player has already cached so FM cassette/radio creator
  // can reuse the original uploaded media list instead of appearing empty.
  useEffect(() => {
    const persisted = lsGet(MUSIC_LIBRARY_CACHE_KEY, []);
    if (!Array.isArray(persisted) || persisted.length === 0) return;

    const normalized = persisted
      .map(normalizeLibraryTrack)
      .filter((track) => track && (track.mediaUrl || track.file || track.objectUrl));

    if (!normalized.length) return;
    setLibrary((prev) => {
      if (Array.isArray(prev) && prev.length > 0) return prev;
      return normalized;
    });
  }, []);

  // VU meter
  const [vuAngle, setVuAngle] = useState(-45);
  const vuRef = useRef(null);
  const anyPlaying = isPlaying || isRadioPlaying || captionPlaying;
  useEffect(() => {
    if (anyPlaying) {
      vuRef.current = setInterval(() => setVuAngle(-45 + Math.random() * 90), 160);
    } else {
      clearInterval(vuRef.current);
      setVuAngle(-45);
    }
    return () => clearInterval(vuRef.current);
  }, [anyPlaying]);

  // ── Build EQ + Analyser through Howler's shared AudioContext ───────────────
  // Called once after the first Howl starts playing.
  const buildEqChain = useCallback(() => {
    if (eqWiredRef.current) return;
    const ctx = Howler.ctx;
    if (!ctx) return;

    // 10-band EQ filters
    const filters = EQ_BANDS.map((band, i) => {
      const f = ctx.createBiquadFilter();
      f.type            = band.type;
      f.frequency.value = band.freq;
      f.Q.value         = band.type === 'peaking' ? 1.0 : 0.7;
      f.gain.value      = eqGains[i] ?? 0;
      return f;
    });

    // Analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Chain: Howler masterGain → eq[0] → … → eq[9] → analyser → destination
    // Intercept Howler's master gain node output.
    let prev = Howler.masterGain;
    for (const f of filters) { prev.connect(f); prev = f; }
    prev.connect(analyser);
    analyser.connect(ctx.destination);

    // Disconnect Howler's default path (masterGain → destination) to avoid double-output.
    try { Howler.masterGain.disconnect(ctx.destination); } catch {}

    eqFiltersRef.current = filters;
    eqWiredRef.current   = true;
  }, [eqGains]);

  // Apply EQ gain changes to live filters
  useEffect(() => {
    eqFiltersRef.current.forEach((f, i) => {
      if (f) f.gain.value = eqGains[i] ?? 0;
    });
  }, [eqGains]);

  // ── Spectrum visualizer ───────────────────────────────────────────────────
  const startViz = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    // Draw to whichever canvas is currently mounted
    const getActiveCanvas = () => modCanvasRef.current || canvasRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const COLORS_CLASSIC = ['#ffb347', '#ff8c00', '#e63946', '#a855f7', '#3b82f6'];
    const COLORS_MODERN  = ['#3b82f6', '#a855f7', '#ec4899', '#a855f7', '#3b82f6'];

    const draw = () => {
      vizRafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const canvas = getActiveCanvas();
      if (!canvas) return;
      const isModern = canvas === modCanvasRef.current;
      const COLORS = isModern ? COLORS_MODERN : COLORS_CLASSIC;
      const ctx2d = canvas.getContext('2d');
      const W = canvas.offsetWidth || canvas.width;
      const H = canvas.offsetHeight || canvas.height;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      ctx2d.clearRect(0, 0, W, H);
      const bw = W / data.length;
      for (let i = 0; i < data.length; i++) {
        const bh = (data[i] / 255) * H;
        const ci = Math.floor((i / data.length) * (COLORS.length - 1));
        const g  = ctx2d.createLinearGradient(0, H, 0, H - bh);
        g.addColorStop(0, COLORS[ci]);
        g.addColorStop(1, COLORS[Math.min(ci + 1, COLORS.length - 1)]);
        ctx2d.fillStyle = g;
        if (isModern) {
          // Circular bars for modern mode
          const x = i * bw;
          ctx2d.fillRect(x, H - bh, bw - 1, bh);
        } else {
          ctx2d.fillRect(i * bw, H - bh, bw - 1, bh);
        }
      }
    };
    draw();
  }, []);

  const stopViz = useCallback(() => {
    if (vizRafRef.current) { cancelAnimationFrame(vizRafRef.current); vizRafRef.current = null; }
    [canvasRef.current, modCanvasRef.current].forEach((c) => {
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    });
  }, []);

  // ── Time ticker ───────────────────────────────────────────────────────────
  const startTicker = useCallback(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const h = howlRef.current;
      if (!h) return;
      const pos = h.seek();
      if (typeof pos === 'number') setCurrentTime(pos);
    }, 200);
  }, []);

  const stopTicker = useCallback(() => {
    clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  // ── Load + play a track via Howler ────────────────────────────────────────
  const loadTrack = useCallback((track, idx, autoPlay = false) => {
    if (!track) return;
    setLoadError('');

    // Stop + destroy previous Howl
    if (howlRef.current) {
      howlRef.current.stop();
      howlRef.current.unload();
      howlRef.current = null;
    }
    stopViz();
    stopTicker();
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    let sourceUrl = String(track.mediaUrl || track.url || track.objectUrl || '').trim();
    if (!sourceUrl && track.file) {
      sourceUrl = URL.createObjectURL(track.file);
      track.objectUrl = sourceUrl;
    }

    if (!sourceUrl) {
      setLoadError(`Cannot play "${track.name || track.title || 'track'}" because no media URL was found.`);
      return;
    }

    const trackName = track.name || track.fileName || track.title || 'track';
    const ext = String(trackName).split('.').pop().toLowerCase();
    const mime = mimeForFile(trackName);

    const howl = new Howl({
      src:    [sourceUrl],
      format: [ext],
      html5:  true,   // html5:true ensures all formats use the audio element (codec support via browser)
      volume: isMuted ? 0 : volume,
      onload: () => {
        setDuration(howl.duration());
        buildEqChain();
      },
      onplay: () => {
        setIsPlaying(true);
        buildEqChain();
        startViz();
        startTicker();
      },
      onpause: () => {
        setIsPlaying(false);
        stopViz();
        stopTicker();
      },
      onstop: () => {
        setIsPlaying(false);
        stopViz();
        stopTicker();
        setCurrentTime(0);
      },
      onend: () => {
        stopTicker();
        stopViz();
        const lib = libraryRef.current;
        const i   = idxRef.current;
        const rep = repeatRef.current;
        const shuf = shuffleRef.current;
        if (rep === 'one') { howlRef.current?.play(); return; }
        if (lib.length <= 1) { setIsPlaying(false); return; }
        let next;
        if (shuf) { do { next = Math.floor(Math.random() * lib.length); } while (next === i && lib.length > 1); }
        else if (rep === 'all' || i < lib.length - 1) { next = (i + 1) % lib.length; }
        else { setIsPlaying(false); return; }
        loadTrack(lib[next], next, true);
      },
      onloaderror: (_, err) => {
        setLoadError(`Cannot decode "${trackName}" - ${err || 'unsupported format in this browser'}`);
        setIsPlaying(false);
      },
    });

    howlRef.current  = howl;
    setCurrentTrack(track);
    setTrackIndex(idx);

    if (autoPlay) howl.play();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildEqChain, startViz, stopViz, startTicker, stopTicker, volume, isMuted]);

  // ── Transport ─────────────────────────────────────────────────────────────
  const play  = useCallback(() => howlRef.current?.play(), []);
  const pause = useCallback(() => howlRef.current?.pause(), []);
  const stop  = useCallback(() => {
    howlRef.current?.stop();
    setCurrentTime(0);
    setIsPlaying(false);
    stopViz();
    stopTicker();
  }, [stopViz, stopTicker]);

  const seek = useCallback((t) => {
    howlRef.current?.seek(t);
    setCurrentTime(t);
  }, []);

  const rewind      = useCallback(() => seek(Math.max(0, (howlRef.current?.seek() || 0) - 10)), [seek]);
  const fastForward = useCallback(() => seek(Math.min(duration, (howlRef.current?.seek() || 0) + 10)), [seek, duration]);

  const skipPrev = useCallback(() => {
    const lib = libraryRef.current;
    if (!lib.length) return;
    if ((howlRef.current?.seek() || 0) > 3) { seek(0); return; }
    const prev = idxRef.current === 0 ? lib.length - 1 : idxRef.current - 1;
    loadTrack(lib[prev], prev, playingRef.current);
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

  // ── Volume sync to Howler ─────────────────────────────────────────────────
  useEffect(() => {
    if (howlRef.current) howlRef.current.volume(isMuted ? 0 : volume);
    Howler.volume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // ── EQ ────────────────────────────────────────────────────────────────────
  const applyPreset = useCallback((name) => {
    setEqGains([...EQ_PRESETS[name]]);
    setEqPreset(name);
  }, []);

  const setEqBand = useCallback((i, val) => {
    setEqGains((prev) => { const n = [...prev]; n[i] = val; return n; });
    setEqPreset('custom');
  }, []);

  // ── Favorites ─────────────────────────────────────────────────────────────
  const isFav       = useCallback((t) => favorites.includes(t?.name), [favorites]);
  const toggleFav   = useCallback((t) => {
    if (!t) return;
    setFavorites((p) => p.includes(t.name) ? p.filter((n) => n !== t.name) : [...p, t.name]);
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = useCallback((e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('audio/') ||
      f.type.startsWith('video/') ||
      /\.(mp3|mp4|m4a|wav|flac|ogg|oga|aac|opus|weba|webm|wma)$/i.test(f.name),
    );
    if (!files.length) return;
    const tracks = files.map((f, i) => ({
      id: `${f.name}-${f.lastModified}-${i}`,
      name: f.name,
      mediaUrl: '',
      file: f,
      objectUrl: null,
      ...parseMeta(f.name),
    }));
    setLibrary((prev) => {
      const combined = [...prev, ...tracks];
      if (!currentTrack) loadTrack(combined[0], 0, false);
      return combined;
    });
    e.target.value = '';
  }, [currentTrack, loadTrack]);

  // ── Queue management ──────────────────────────────────────────────────────
  const removeTrack = useCallback((id) => {
    setLibrary((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (currentTrack?.id === id) {
        if (next.length) loadTrack(next[0], 0, false);
        else { stop(); setCurrentTrack(null); }
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
      const i  = prev.findIndex((t) => t.id === id);
      if (i < 0) return prev;
      const to = dir === 'up' ? i - 1 : i + 1;
      if (to < 0 || to >= prev.length) return prev;
      const n = [...prev]; [n[i], n[to]] = [n[to], n[i]];
      if (currentTrack?.id === id) setTrackIndex(to);
      return n;
    });
  }, [currentTrack]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      switch (e.key) {
        case ' ':           e.preventDefault(); isPlaying ? pause() : play();        break;
        case 'ArrowLeft':   e.preventDefault(); e.shiftKey ? skipPrev() : rewind();  break;
        case 'ArrowRight':  e.preventDefault(); e.shiftKey ? skipNext() : fastForward(); break;
        case 'ArrowUp':     e.preventDefault(); setVolume((v) => Math.min(1, v + 0.05)); break;
        case 'ArrowDown':   e.preventDefault(); setVolume((v) => Math.max(0, v - 0.05)); break;
        case 'e': case 'E': e.preventDefault(); setShowEq((x)    => !x);             break;
        case 'q': case 'Q': e.preventDefault(); setShowQueue((x)  => !x);            break;
        case 'm': case 'M': e.preventDefault(); setIsMuted((x)    => !x);            break;
        case 'f': case 'F':
          e.preventDefault();
          if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.().catch(() => {});
          else document.exitFullscreen?.().catch(() => {});
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlaying, play, pause, rewind, fastForward, skipPrev, skipNext]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => {
    howlRef.current?.unload();
    stopViz();
    stopTicker();
  }, [stopViz, stopTicker]);

  // ── Caption tab ───────────────────────────────────────────────────────────
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
    if (!captionTrack || !captionAudioRef.current || !captionMediaUrl) return;

    const audio = captionAudioRef.current;
    const candidates = resolveTrackSourceCandidates(captionTrack);
    if (!candidates.length) return;

    let sourceIndex = 0;
    const tryPlay = () => {
      audio.src = candidates[sourceIndex];
      audio.currentTime = 0;
      audio.play().then(() => {
        setCaptionPlaying(true);
        if (captionMediaType === 'video') {
          captionMediaRef.current?.play().catch(() => {});
        }
      }).catch(() => {
        sourceIndex += 1;
        if (sourceIndex < candidates.length) {
          tryPlay();
        }
      });
    };

    if (captionMediaType === 'video' && captionMediaRef.current) {
      captionMediaRef.current.currentTime = 0;
    }

    tryPlay();
  };
  const captionStop = () => {
    captionAudioRef.current?.pause();
    if (captionAudioRef.current) {
      captionAudioRef.current.currentTime = 0;
    }
    captionMediaRef.current?.pause();
    if (captionMediaRef.current) {
      captionMediaRef.current.currentTime = 0;
    }
    setCaptionPlaying(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const needlePct = `${((tunedFreq - FM_LOW) / (FM_HIGH - FM_LOW)) * 100}%`;
  const progress  = duration > 0 ? (currentTime / duration) * 100 : 0;
  const meta      = currentTrack
    ? {
        title: String(currentTrack.title || '').trim() || parseMeta(currentTrack.name || '').title,
        artist: String(currentTrack.artist || '').trim() || parseMeta(currentTrack.name || '').artist,
      }
    : null;

  const renderClassicTheme = () => (
    <div className="wr-cabinet">
      <div className="wr-brand">
        <h1>WISERAVENSHARE</h1>
        <div className="wr-model">WR-77 · FM · CASSETTE · 10-BAND EQ · ALL CODECS</div>
      </div>

      <div className="wr-grille" />

      <div className="wr-vu">
        <div className="wr-vu-label">VU</div>
        <div className="wr-vu-arc" />
        <div className="wr-vu-needle" style={{ transform: `translateX(-50%) rotate(${vuAngle}deg)` }} />
        <div className="wr-vu-pivot" />
      </div>

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
          {tab === 'cassette' && currentTrack ? `${meta?.title} — ${meta?.artist}` : stationName}
        </div>
      </div>

      <div className="wr-dial-assembly">
        <div className="wr-dial-scale">
          <div className="wr-dial-ticks" />
          <div className="wr-dial-numbers">
            {[88, 92, 96, 100, 104, 108].map((n) => <span key={n}>{n}</span>)}
          </div>
          <div className="wr-dial-needle" style={{ left: needlePct }} />
          <input type="range" className="wr-dial-range"
            min={FM_LOW} max={FM_HIGH} step={0.1} value={tunedFreq}
            onChange={(e) => setTunedFreq(parseFloat(e.target.value))} />
        </div>
      </div>

      <div className="wr-source-tabs">
        <button className={`wr-source-btn${tab === 'radio' ? ' active' : ''}`} onClick={() => setTab('radio')}>📻 FM RADIO</button>
        <button className={`wr-source-btn${tab === 'cassette' ? ' active' : ''}`} onClick={() => setTab('cassette')}>📼 CASSETTE</button>
        <button className={`wr-source-btn${tab === 'caption' ? ' active' : ''}`} onClick={() => setTab('caption')}>🎬 CAPTION</button>
      </div>

      {tab === 'radio' && <div className="wr-fm-section"><FMTunerModule /></div>}

      {tab === 'cassette' && (
        <div className="wr-cassette-deck">
          <div className="wr-deck-label">◄◄ CASSETTE · MP3 · MP4 · FLAC · WAV · OGG · M4A · AAC · OPUS · WMA ►►</div>

          <div className="wr-viz-wrap">
            <canvas ref={canvasRef} className="wr-canvas" width={800} height={72} />
            {!isPlaying && <div className="wr-viz-idle">▶ PRESS PLAY FOR SPECTRUM ANALYZER</div>}
          </div>

          <div className="wr-track-info">
            <div className="wr-track-art">{isFav(currentTrack) ? '⭐' : '🎵'}</div>
            <div className="wr-track-meta">
              <div className="wr-track-title">{meta?.title || 'No track loaded'}</div>
              <div className="wr-track-artist">{meta?.artist || '—'}</div>
            </div>
            <button className={`wr-fav-btn${isFav(currentTrack) ? ' active' : ''}`}
              onClick={() => toggleFav(currentTrack)} disabled={!currentTrack} title="Favorite">
              {isFav(currentTrack) ? '★' : '☆'}
            </button>
          </div>

          <div className="wr-cassette-door">
            <div className="wr-tape-visual">
              <div className={`wr-reel left${isPlaying ? ' spinning' : ''}`} />
              <div className="wr-tape-ribbon" />
              <div className={`wr-reel right${isPlaying ? ' spinning' : ''}`} />
            </div>
            <div className="wr-cassette-label">{currentTrack?.name || 'NO TAPE INSERTED'}</div>
          </div>

          {loadError && (
            <div className="wr-error">
              ⚠ {loadError}
              <button style={{ marginLeft: 10, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                onClick={() => setLoadError('')}>✕</button>
            </div>
          )}

          <div className="wr-seek-row">
            <span className="wr-time">{fmt(currentTime)}</span>
            <div className="wr-seek-wrap">
              <input type="range" className="wr-seek"
                min={0} max={duration || 0} step={0.1} value={currentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
                disabled={!currentTrack} />
              <div className="wr-seek-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="wr-time">{fmt(duration)}</span>
          </div>

          <div className="wr-transport">
            <button className="wr-key" onClick={skipPrev} disabled={!library.length} title="Prev [Shift+←]">⏮</button>
            <button className="wr-key" onClick={rewind} disabled={!currentTrack} title="Rewind [←]">◀◀</button>
            <button className={`wr-key${isPlaying ? ' active' : ''}`} onClick={play} disabled={!currentTrack} title="Play [Space]">▶</button>
            <button className="wr-key" onClick={pause} disabled={!isPlaying} title="Pause [Space]">❚❚</button>
            <button className="wr-key" onClick={stop} disabled={!currentTrack} title="Stop">■</button>
            <button className="wr-key" onClick={fastForward} disabled={!currentTrack} title="FF [→]">▶▶</button>
            <button className="wr-key" onClick={skipNext} disabled={!library.length} title="Next [Shift+→]">⏭</button>
          </div>

          <div className="wr-mode-row">
            <button className={`wr-mode-btn${shuffle ? ' active' : ''}`} onClick={() => setShuffle((s) => !s)} title="Shuffle">⇄</button>
            <button className={`wr-mode-btn${repeat !== 'off' ? ' active' : ''}`} onClick={cycleRepeat} title={`Repeat: ${repeat}`}>
              {repeat === 'one' ? '↺¹' : '↺'}
            </button>
            <button className={`wr-mode-btn${showEq ? ' active' : ''}`} onClick={() => setShowEq((x) => !x)} title="Equalizer [E]">EQ</button>
            <button className={`wr-mode-btn${showQueue ? ' active' : ''}`} onClick={() => setShowQueue((x) => !x)} title="Queue [Q]">Q</button>
            <button className="wr-mode-btn" title="Fullscreen [F]" onClick={() => {
              if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.().catch(() => {});
              else document.exitFullscreen?.().catch(() => {});
            }}>⛶</button>
          </div>

          <div className="wr-vol-row">
            <button className="wr-key" style={{ width: 34, height: 28, fontSize: '.72rem' }} onClick={() => setIsMuted((m) => !m)}>{isMuted ? '🔇' : '🔊'}</button>
            <input type="range" className="wr-vol" min={0} max={1} step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }} />
            <span className="wr-vol-pct">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
          </div>

          {showEq && (
            <div className="wr-eq-panel">
              <div className="wr-eq-header">
                <span className="wr-eq-title">10-BAND EQUALIZER</span>
                <div className="wr-eq-presets">
                  {Object.keys(EQ_PRESETS).map((p) => (
                    <button key={p} className={`wr-preset-btn${eqPreset === p ? ' active' : ''}`} onClick={() => applyPreset(p)}>{p}</button>
                  ))}
                  <button className="wr-preset-btn" onClick={() => applyPreset('flat')}>Reset</button>
                </div>
              </div>
              <div className="wr-eq-bands">
                {EQ_BANDS.map((band, i) => (
                  <div key={band.freq} className="wr-eq-band">
                    <span className="wr-eq-val">{(eqGains[i] > 0 ? '+' : '') + (eqGains[i]?.toFixed(0) ?? 0)}</span>
                    <input type="range" className="wr-eq-slider" orient="vertical"
                      min={-12} max={12} step={0.5} value={eqGains[i] ?? 0}
                      onChange={(e) => setEqBand(i, parseFloat(e.target.value))} />
                    <span className="wr-eq-label">{band.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showQueue && (
            <div className="wr-queue-panel">
              <div className="wr-queue-header">
                <span className="wr-eq-title">QUEUE ({library.length})</span>
                <button className="wr-preset-btn" onClick={clearQueue} disabled={!library.length}>Clear all</button>
              </div>
              {library.length === 0 ? (
                <div className="wr-loading" style={{ animation: 'none', opacity: .5, padding: '10px 0' }}>Queue empty — load files below</div>
              ) : (
                <div className="wr-tape-rack">
                  {library.map((t, i) => (
                    <div key={t.id} className={`wr-queue-item${currentTrack?.id === t.id ? ' active' : ''}`}>
                      <button className="wr-q-play" onClick={() => loadTrack(t, i, true)}>
                        {currentTrack?.id === t.id && isPlaying ? '▶' : '○'}
                      </button>
                      <span className="wr-tape-name" onClick={() => loadTrack(t, i, true)}>
                        {isFav(t) && '⭐ '}{t.title || t.name}
                      </span>
                      <button className="wr-q-btn" onClick={() => moveTrack(t.id, 'up')} title="Up">↑</button>
                      <button className="wr-q-btn" onClick={() => moveTrack(t.id, 'down')} title="Down">↓</button>
                      <button className={`wr-q-btn${isFav(t) ? ' fav' : ''}`} onClick={() => toggleFav(t)} title="Fav">★</button>
                      <button className="wr-q-btn rm" onClick={() => removeTrack(t.id)} title="Remove">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <input type="file" ref={uploadRef} multiple style={{ display: 'none' }}
            accept="audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.flac,.ogg,.oga,.aac,.opus,.weba,.webm,.wma"
            onChange={handleUpload} />
          <button className="wr-insert-tape" onClick={() => uploadRef.current?.click()}>
            ⏏ LOAD FILES — mp3 · mp4 · flac · wav · ogg · m4a · aac · opus · wma
          </button>

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

      {tab === 'caption' && (
        <div className="wr-cassette-deck">
          <div className="wr-deck-label">▸ CAPTION PHOTOS & VIDEOS WITH MUSIC</div>
          <div className="wr-caption-panel">
            <div className="wr-caption-label">▸ 1. ADD MUSIC TRACK SELECTOR</div>
            {library.length === 0 ? (
              <div className="wr-loading" style={{ animation: 'none', opacity: .55, padding: '6px 0' }}>Load tracks in Cassette tab first</div>
            ) : (
              <div className="wr-tape-rack" style={{ marginBottom: 12 }}>
                {library.map((t) => (
                  <button key={t.id} className={`wr-tape-item${captionTrack?.id === t.id ? ' active' : ''}`}
                    onClick={() => { setCaptionTrack(t); setCaptionPlaying(false); if (captionAudioRef.current) captionAudioRef.current.src = ''; }}>
                    <span>📼</span><span className="wr-tape-name">{t.title || t.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="wr-caption-label">▸ 2. SELECT PHOTO OR VIDEO</div>
            <div className="wr-caption-grid">
              <label className={`wr-caption-slot${captionMediaFile ? ' filled' : ''}`}>
                {captionMediaFile ? `✓ ${captionMediaFile.name}` : '📁 Pick photo or video'}
                <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleCaptionMediaPick} />
              </label>
              <div className="wr-caption-slot" style={{ cursor: 'default' }}>
                <div style={{ fontSize: '.85rem', marginBottom: 4 }}>🎵</div>
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
              <button className={`wr-key${captionPlaying ? ' active' : ''}`} onClick={captionPlay} disabled={!captionTrack || !captionMediaUrl}>▶ PLAY WITH MUSIC</button>
              <button className="wr-key" onClick={captionStop} disabled={!captionPlaying}>■ STOP</button>
            </div>
          </div>
        </div>
      )}

      <div className="wr-status">
        <span><span className={`wr-status-dot${anyPlaying ? ' live' : ''}`} />{anyPlaying ? 'PLAYING' : 'STANDBY'}</span>
        <span>{tab === 'radio' ? 'FM STEREO' : tab === 'cassette' ? `TAPE  ${repeat !== 'off' ? `REP:${repeat.toUpperCase()} ` : ''}${shuffle ? 'SHUF' : ''}` : 'CAPTION'}</span>
        <span>WR-77</span>
      </div>
    </div>
  );

  const renderModernTheme = () => (
    <div className="mod-shell">
      <div className="mod-topbar">
        <div className="mod-logo">🎧 WiseRaven</div>
        <div className="mod-tabs">
          <button className={`mod-tab${tab === 'radio' ? ' active' : ''}`} onClick={() => setTab('radio')}>FM Radio</button>
          <button className={`mod-tab${tab === 'cassette' ? ' active' : ''}`} onClick={() => setTab('cassette')}>Media Player</button>
          <button className={`mod-tab${tab === 'caption' ? ' active' : ''}`} onClick={() => setTab('caption')}>Caption</button>
        </div>
      </div>

      {tab === 'radio' && (
        <div className="mod-fm">
          <div className="mod-freq-card">
            <div className="mod-freq-display">
              <span className="mod-freq-num">{tunedFreq.toFixed(1)}</span>
              <span className="mod-freq-unit">MHz</span>
              {anyPlaying && <span className="mod-live-pill">◉ LIVE</span>}
            </div>
            <input type="range" className="mod-freq-slider"
              min={FM_LOW} max={FM_HIGH} step={0.1} value={tunedFreq}
              onChange={(e) => setTunedFreq(parseFloat(e.target.value))} />
            <div className="mod-freq-scale">
              {[88, 92, 96, 100, 104, 108].map((n) => <span key={n}>{n}</span>)}
            </div>
          </div>
          <FMTunerModule />
        </div>
      )}

      {tab === 'cassette' && (
        <div className="mod-player">
          <div className="mod-player-left">
            <div className="mod-art">
              <canvas ref={canvasRef} className="mod-viz-canvas" width={220} height={220} />
              {!isPlaying && (
                <div className="mod-art-idle" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '4rem' }}>{isFav(currentTrack) ? '⭐' : '🎵'}</span>
                  {currentTrack && <span className="mod-art-hint">Press play</span>}
                </div>
              )}
            </div>
            <div className="mod-track-info">
              <div className="mod-track-title">{meta?.title || 'No track loaded'}</div>
              <div className="mod-track-artist">{meta?.artist || '—'}</div>
            </div>

            <div className="mod-progress-wrap">
              <span className="mod-time">{fmt(currentTime)}</span>
              <div className="mod-progress-bar" onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - rect.left) / rect.width) * (duration || 0));
              }}>
                <div className="mod-progress-fill" style={{ width: `${progress}%` }} />
                <div className="mod-progress-thumb" style={{ left: `${progress}%` }} />
              </div>
              <span className="mod-time">{fmt(duration)}</span>
            </div>

            <div className="mod-transport">
              <button className={`mod-ctrl sm${shuffle ? ' on' : ''}`} onClick={() => setShuffle((s) => !s)} title="Shuffle">⇄</button>
              <button className="mod-ctrl" onClick={skipPrev} disabled={!library.length}>⏮</button>
              <button className="mod-ctrl" onClick={rewind} disabled={!currentTrack}>−10s</button>
              <button className={`mod-ctrl play${isPlaying ? ' playing' : ''}`} onClick={isPlaying ? pause : play} disabled={!currentTrack}>{isPlaying ? '⏸' : '▶'}</button>
              <button className="mod-ctrl" onClick={stop} disabled={!currentTrack}>⏹</button>
              <button className="mod-ctrl" onClick={fastForward} disabled={!currentTrack}>+10s</button>
              <button className="mod-ctrl" onClick={skipNext} disabled={!library.length}>⏭</button>
              <button className={`mod-ctrl sm${repeat !== 'off' ? ' on' : ''}`} onClick={cycleRepeat} title={`Repeat: ${repeat}`}>
                {repeat === 'one' ? '↺¹' : '↺'}
              </button>
            </div>

            <div className="mod-vol-row">
              <button className="mod-ctrl sm" onClick={() => setIsMuted((m) => !m)}>{isMuted ? '🔇' : '🔊'}</button>
              <input type="range" className="mod-vol-slider" min={0} max={1} step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }} />
              <span className="mod-vol-pct">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className={`mod-fav-btn${isFav(currentTrack) ? ' on' : ''}`} onClick={() => toggleFav(currentTrack)} disabled={!currentTrack}>
                {isFav(currentTrack) ? '★ Favorited' : '☆ Favorite'}
              </button>
            </div>
            {loadError && <div className="mod-error">⚠ {loadError} <button onClick={() => setLoadError('')}>✕</button></div>}
          </div>

          <div className="mod-player-right">
            <div className="mod-pills">
              <button className={`mod-pill${showEq ? ' on' : ''}`} onClick={() => setShowEq((x) => !x)}>EQ</button>
              <button className={`mod-pill${showQueue ? ' on' : ''}`} onClick={() => setShowQueue((x) => !x)}>Queue</button>
              <button className="mod-pill" onClick={() => {
                if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.().catch(() => {});
                else document.exitFullscreen?.().catch(() => {});
              }}>⛶</button>
            </div>

            {showEq && (
              <div className="mod-eq">
                <div className="mod-eq-presets">
                  {Object.keys(EQ_PRESETS).map((p) => (
                    <button key={p} className={`mod-eq-preset${eqPreset === p ? ' on' : ''}`} onClick={() => applyPreset(p)}>{p}</button>
                  ))}
                  <button className="mod-eq-preset" onClick={() => applyPreset('flat')}>Reset</button>
                </div>
                <div className="mod-eq-bands">
                  {EQ_BANDS.map((band, i) => (
                    <div key={band.freq} className="mod-eq-band">
                      <span className="mod-eq-val">{eqGains[i] > 0 ? '+' : ''}{(eqGains[i] || 0).toFixed(0)}</span>
                      <input type="range" orient="vertical" className="mod-eq-slider"
                        min={-12} max={12} step={0.5} value={eqGains[i] ?? 0}
                        onChange={(e) => setEqBand(i, parseFloat(e.target.value))} />
                      <span className="mod-eq-label">{band.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showQueue && (
              <div className="mod-queue">
                <div className="mod-queue-head">
                  <span>Queue ({library.length})</span>
                  <button className="mod-pill" onClick={clearQueue} disabled={!library.length}>Clear</button>
                </div>
                {library.length === 0 ? (
                  <div className="mod-queue-empty">No tracks — load files below</div>
                ) : (
                  <div className="mod-queue-list">
                    {library.map((t, i) => (
                      <div key={t.id} className={`mod-queue-item${currentTrack?.id === t.id ? ' active' : ''}`}>
                        <button className="mod-q-play" onClick={() => loadTrack(t, i, true)}>
                          {currentTrack?.id === t.id && isPlaying ? '▶' : '·'}
                        </button>
                        <span className="mod-q-name" onClick={() => loadTrack(t, i, true)}>
                          {isFav(t) && '⭐ '}{t.title || t.name}
                        </span>
                        <button className="mod-q-btn" onClick={() => moveTrack(t.id, 'up')}>↑</button>
                        <button className="mod-q-btn" onClick={() => moveTrack(t.id, 'down')}>↓</button>
                        <button className={`mod-q-btn${isFav(t) ? ' fav' : ''}`} onClick={() => toggleFav(t)}>★</button>
                        <button className="mod-q-btn rm" onClick={() => removeTrack(t.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <input type="file" ref={uploadRef} multiple style={{ display: 'none' }}
              accept="audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.flac,.ogg,.oga,.aac,.opus,.weba,.webm,.wma"
              onChange={handleUpload} />
            <button className="mod-upload-btn" onClick={() => uploadRef.current?.click()}>
              ＋ Load Files — mp3 · mp4 · flac · wav · ogg · m4a · aac · opus
            </button>

            <div className="mod-kb-hint">
              <kbd>Space</kbd>play/pause &nbsp;
              <kbd>←/→</kbd>seek &nbsp;
              <kbd>Shift+←/→</kbd>skip &nbsp;
              <kbd>E</kbd>eq &nbsp;
              <kbd>Q</kbd>queue &nbsp;
              <kbd>M</kbd>mute
            </div>
          </div>
        </div>
      )}

      {tab === 'caption' && (
        <div className="mod-caption-wrap">
          <h3 style={{ margin: '0 0 16px' }}>Caption Media with Music</h3>
          <div className="mod-caption-cols">
            <div>
              <div className="mod-section-label">1. Add Music track selector</div>
              {library.length === 0 ? (
                <div className="mod-queue-empty">Load tracks in Media Player tab first</div>
              ) : (
                <div className="mod-queue-list">
                  {library.map((t) => (
                    <div key={t.id} className={`mod-queue-item${captionTrack?.id === t.id ? ' active' : ''}`}
                      onClick={() => { setCaptionTrack(t); setCaptionPlaying(false); if (captionAudioRef.current) captionAudioRef.current.src = ''; }}>
                      <span className="mod-q-name">🎵 {t.title || t.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="mod-section-label">2. Select photo or video</div>
              <label className={`mod-media-drop${captionMediaFile ? ' filled' : ''}`}>
                {captionMediaFile ? `✓ ${captionMediaFile.name}` : '+ Drop photo or video here'}
                <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleCaptionMediaPick} />
              </label>
              {captionTrack && <div className="mod-caption-track">🎵 {captionTrack.title || captionTrack.name}</div>}
              <div className="mod-caption-preview-wrap">
                {captionMediaUrl && captionMediaType === 'image' && <img src={captionMediaUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 8 }} />}
                {captionMediaUrl && captionMediaType === 'video' && <video ref={captionMediaRef} src={captionMediaUrl} controls style={{ maxWidth: '100%', borderRadius: 8 }} />}
                {!captionMediaUrl && <div className="mod-queue-empty">Preview appears here</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="mod-upload-btn" style={{ flex: 1 }} onClick={captionPlay} disabled={!captionTrack || !captionMediaUrl}>▶ Play with music</button>
                <button className="mod-upload-btn" onClick={captionStop} disabled={!captionPlaying}>⏹ Stop</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={`wr-shell${isFullscreen ? ' wr-fullscreen' : ''}${theme === 'modern' ? ' wr-modern-shell' : ''}`}>
      <audio
        ref={captionAudioRef}
        preload="none"
        onEnded={() => setCaptionPlaying(false)}
        onError={() => setCaptionPlaying(false)}
      />

      <div className="wr-theme-toggle">
        <button className={`wr-theme-btn${theme === 'classic' ? ' active' : ''}`} onClick={() => setTheme('classic')}>
          📻 Classic
        </button>
        <button className={`wr-theme-btn${theme === 'modern' ? ' active' : ''}`} onClick={() => setTheme('modern')}>
          🎧 Modern
        </button>
      </div>

      {theme === 'classic' ? renderClassicTheme() : null}
      {theme === 'modern' ? renderModernTheme() : null}
    </div>
  );
};

export default FMRadioPage;
