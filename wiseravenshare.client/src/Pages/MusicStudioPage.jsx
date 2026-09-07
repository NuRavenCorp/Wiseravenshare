import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FiPlay, FiPause, FiSquare, FiSkipBack, FiSkipForward, FiUpload,
  FiRepeat, FiShuffle, FiVolume2, FiVolumeX,
  FiMusic, FiSearch, FiX, FiList, FiSliders,
  FiRadio, FiMic, FiMicOff, FiActivity, FiCamera, FiLink
} from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import { apiService } from '../Services/api';
import FMTunerModule from '../Components/FM/FMTunerModule';
import FMCreatorStudio from '../Components/FM/FMCreatorStudio';
import '../Styles/MusicStudio.css';

// ─── Constants ────────────────────────────────────────────────────────────────
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
  vocalBoost: [-2,-1,  0,  2,  4,  4,  3,  2,  0, -1],
  rock:       [5,  4,  2,  0, -1,  0,  2,  4,  5,  6],
  jazz:       [3,  2,  1,  2, -2, -2,  0,  1,  2,  3],
  classical:  [4,  3,  2,  0,  0,  0,  0,  2,  3,  4],
  karaoke:    [0,  0,  0,  0, -6, -6, -4,  0,  0,  0],
};

function makeReverbIR(ctx, duration = 1.5, decay = 2.5) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const fmt = (s) => {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const toBlobStreamUrl = (relativePath = '') => {
  const normalized = String(relativePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return '';
  const encoded = normalized
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return encoded ? `/api/videostreaming/blob/${encoded}` : '';
};

const normalizePlaybackUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return raw;
    }
  }

  if (raw.startsWith('/')) {
    return raw;
  }

  if (raw.startsWith('api/')) {
    return `/${raw}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return '';
};

const normalizeTrack = (track) => {
  if (!track || typeof track !== 'object') return null;
  const fallbackRelativePath = String(
    track.relativePath
    || track.RelativePath
    || track.objectKey
    || track.ObjectKey
    || ''
  ).trim();
  const fileName = String(track.fileName || track.FileName || '').trim();

  const directMediaUrl = normalizePlaybackUrl(
    track.mediaUrl
    || track.url
    || track.fileUrl
    || track.publicUrl
    || track.MediaUrl
    || track.Url
    || track.filePath
    || track.FilePath
    || ''
  );
  const blobStreamUrl = toBlobStreamUrl(fallbackRelativePath);
  const fileNameStreamUrl = fileName
    ? `/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}`
    : '';

  // Prefer durable server-side stream routes over transient blob: URLs.
  const mediaUrl = blobStreamUrl
    || fileNameStreamUrl
    || directMediaUrl;

  return {
    id: String(track.id || track.Id || `track-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: String(track.title || track.Title || 'Untitled').trim(),
    artist: String(track.artist || track.Artist || '').trim(),
    album: String(track.album || track.Album || '').trim(),
    genre: String(track.genre || track.Genre || '').trim(),
    duration: track.duration || track.Duration || '',
    relativePath: fallbackRelativePath,
    fileName,
    contentType: String(track.contentType || track.ContentType || '').trim(),
    mediaUrl,
    url: mediaUrl
  };
};

const INSTRUMENT_OPTIONS = [
  { id: 'mic', label: 'Mic' },
  { id: 'camera', label: 'Camera' },
  { id: 'piano', label: 'Piano' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'sound-creator', label: 'Sound Creator' },
];

const RIGHTS_PLANS = [
  {
    id: 'basic',
    name: 'Basic Protection',
    monthlyPrice: '$4.99 / mo',
    annualPrice: '$49.99 / yr',
    monthlyPriceId: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_MONTHLY_PRICE_ID || '',
    annualPriceId: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_ANNUAL_PRICE_ID || '',
    features: ['Proof-of-creation timestamp', 'SHA-256 fingerprint', 'Rights registration record']
  },
  {
    id: 'standard',
    name: 'Standard Protection',
    monthlyPrice: '$14.99 / mo',
    annualPrice: '$149.99 / yr',
    monthlyPriceId: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_MONTHLY_PRICE_ID || '',
    annualPriceId: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_ANNUAL_PRICE_ID || '',
    features: ['Everything in Basic', 'Cross-platform monitoring', 'Automated takedown support']
  },
  {
    id: 'pro',
    name: 'Pro Protection',
    monthlyPrice: '$29.99 / mo',
    annualPrice: '$299.99 / yr',
    monthlyPriceId: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_MONTHLY_PRICE_ID || '',
    annualPriceId: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_ANNUAL_PRICE_ID || '',
    features: ['Everything in Standard', 'PRO registration guidance', 'Priority legal escalation']
  }
];

// ─── Component ────────────────────────────────────────────────────────────────
const MusicStudioPage = ({ onNavigate, initialPanel = 'eq' }) => {
  const { user } = useAuth();
  const { addToast } = useNotification();

  // Library
  const [library,       setLibrary]      = useState([]);
  const [isLoading,     setIsLoading]    = useState(true);
  const [searchQuery,   setSearchQuery]  = useState('');
  const [currentTrack,  setCurrentTrack] = useState(null);
  const [trackIndex,    setTrackIndex]   = useState(0);

  // Transport
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [currentTime,setCurrentTime]= useState(0);
  const [duration,   setDuration]   = useState(0);
  const [volume,     setVolume]     = useState(0.85);
  const [isMuted,    setIsMuted]    = useState(false);
  const [repeat,     setRepeat]     = useState('off');  // off | one | all
  const [shuffle,    setShuffle]    = useState(false);

  // Studio
  const [activePanel,   setActivePanel]   = useState('eq');
  const [eqGains,       setEqGains]       = useState(EQ_BANDS.map(() => 0));
  const [activePreset,  setActivePreset]  = useState('flat');
  const [reverbWet,     setReverbWet]     = useState(0);
  const [compThreshold, setCompThreshold] = useState(-24);
  const [compRatio,     setCompRatio]     = useState(4);
  const [compAttack,    setCompAttack]    = useState(0.003);
  const [compRelease,   setCompRelease]   = useState(0.25);
  const [stereoWidth,   setStereoWidth]   = useState(1);
  const [vocalMode,     setVocalMode]     = useState('normal');
  const [vizData,       setVizData]       = useState(new Uint8Array(64));
  const [uploadFile,    setUploadFile]    = useState(null);
  const [uploadTitle,   setUploadTitle]   = useState('');
  const [uploadArtist,  setUploadArtist]  = useState('');
  const [uploadAlbum,   setUploadAlbum]   = useState('');
  const [uploadGenre,   setUploadGenre]   = useState('');
  const [isUploading,   setIsUploading]   = useState(false);
  const [inputDevices,  setInputDevices]  = useState([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('');
  const [inputStatus, setInputStatus] = useState('disconnected');
  const [inputLevel, setInputLevel] = useState(0);
  const [inputConnectionType, setInputConnectionType] = useState('wired');
  const [isInputRecording, setIsInputRecording] = useState(false);
  const [inputRecordingTime, setInputRecordingTime] = useState(0);
  const [isSavingInputRecording, setIsSavingInputRecording] = useState(false);
  const [monitorInputEnabled, setMonitorInputEnabled] = useState(false);
  const [monitorInputLevel, setMonitorInputLevel] = useState(0.8);
  const [inputRecordingTitle, setInputRecordingTitle] = useState('');
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState('');
  const [cameraStatus, setCameraStatus] = useState('disconnected');
  const [manualInstrumentLinks, setManualInstrumentLinks] = useState({
    mic: false,
    camera: false,
    piano: false,
    keyboard: false,
    guitar: false,
    'sound-creator': false,
  });
  const [rightsCheckoutKey, setRightsCheckoutKey] = useState('');

  useEffect(() => {
    const allowedPanels = new Set(['eq', 'effects', 'vocal', 'input', 'rights', 'fm', 'radio-creator']);
    if (allowedPanels.has(String(initialPanel || '').trim())) {
      setActivePanel(String(initialPanel).trim());
    }
  }, [initialPanel]);

  // DOM / Audio refs
  const audioRef   = useRef(null);
  const uploadInputRef = useRef(null);
  const canvasRef  = useRef(null);
  const nodesRef   = useRef(null);   // null = graph not yet built
  const vizRafRef  = useRef(null);
  const inputStreamRef = useRef(null);
  const inputAudioContextRef = useRef(null);
  const inputAnalyserRef = useRef(null);
  const inputMonitorGainRef = useRef(null);
  const inputMeterRafRef = useRef(null);
  const inputRecorderRef = useRef(null);
  const inputChunksRef = useRef([]);
  const inputTimerRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const playRequestedRef = useRef(false);

  // ── 1. Library load ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const res = await apiService.getMusicLibrary();
        const normalizedTracks = (Array.isArray(res?.data) ? res.data : [])
          .map(normalizeTrack)
          .filter(Boolean);
        const tracks = normalizedTracks.filter((track) => Boolean(track.mediaUrl || track.relativePath || track.fileName));
        const skippedCount = normalizedTracks.length - tracks.length;
        setLibrary(tracks);
        try {
          localStorage.setItem('wiseMusic_library', JSON.stringify(tracks));
        } catch {
          /* ignore storage errors */
        }
        if (skippedCount > 0) {
          addToast(`${skippedCount} track(s) were skipped because they have no playable source.`, 'warning');
        }
        if (tracks.length) { setCurrentTrack(tracks[0]); setTrackIndex(0); }
      } catch (e) {
        try {
          const stored = localStorage.getItem('wiseMusic_library');
          const normalizedTracks = (stored ? JSON.parse(stored) : [])
            .map(normalizeTrack)
            .filter(Boolean);
          const tracks = normalizedTracks.filter((track) => Boolean(track.mediaUrl || track.relativePath || track.fileName));
          const skippedCount = normalizedTracks.length - tracks.length;
          setLibrary(tracks);
          if (skippedCount > 0) {
            addToast(`${skippedCount} local track(s) were skipped because they have no playable source.`, 'warning');
          }
          if (tracks.length) { setCurrentTrack(tracks[0]); setTrackIndex(0); }
        } catch {
          setLibrary([]);
        }
        console.error('Library load failed', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── 2. Wire audio element events (stable — never re-registers) ───────────────
  //    handleTrackEnd reads state via refs so it's never stale.
  const repeatRef  = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const libRef     = useRef(library);
  const idxRef     = useRef(trackIndex);
  const playingRef = useRef(isPlaying);
  const sourceCandidatesRef = useRef([]);
  const sourceIndexRef = useRef(0);
  useEffect(() => { repeatRef.current  = repeat;     }, [repeat]);
  useEffect(() => { shuffleRef.current = shuffle;    }, [shuffle]);
  useEffect(() => { libRef.current     = library;    }, [library]);
  useEffect(() => { idxRef.current     = trackIndex; }, [trackIndex]);
  useEffect(() => { playingRef.current = isPlaying;  }, [isPlaying]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onMeta  = () => setDuration(el.duration || 0);
    const onTime  = () => setCurrentTime(el.currentTime || 0);
    const onErr = () => {
      const candidates = sourceCandidatesRef.current;
      const nextIndex = sourceIndexRef.current + 1;
      if (nextIndex < candidates.length) {
        const nextUrl = candidates[nextIndex];
        sourceIndexRef.current = nextIndex;
        el.src = nextUrl;
        el.load();
        if (playingRef.current) {
          el.play().catch(() => {});
        }
        addToast('Primary source failed. Trying backup source...', 'warning');
        return;
      }

      addToast('Playback error: this track has no supported source.', 'error');
      const lib = libRef.current;
      const idx = idxRef.current;
      if (Array.isArray(lib) && lib.length > 1) {
        const next = (idx + 1) % lib.length;
        if (next !== idx) {
          setTrackIndex(next);
          setCurrentTrack(lib[next]);
          addToast('Skipping to the next track.', 'info');
          return;
        }
      }
      setIsPlaying(false);
    };
    const onEnded = () => {
      const r = repeatRef.current;
      const lib = libRef.current;
      const idx = idxRef.current;
      if (r === 'one') {
        el.currentTime = 0;
        el.play().catch(() => {});
        return;
      }
      let next;
      if (shuffleRef.current) {
        next = Math.floor(Math.random() * lib.length);
      } else if (r === 'all' || idx < lib.length - 1) {
        next = (idx + 1) % lib.length;
      } else {
        setIsPlaying(false);
        return;
      }
      setTrackIndex(next);
      setCurrentTrack(lib[next]);
    };

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate',     onTime);
    el.addEventListener('ended',          onEnded);
    el.addEventListener('error',          onErr);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate',     onTime);
      el.removeEventListener('ended',          onEnded);
      el.removeEventListener('error',          onErr);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← runs once; stale state handled via refs above

  const buildTrackSources = (track) => {
    if (!track || typeof track !== 'object') return [];

    const sources = [
      normalizePlaybackUrl(track.mediaUrl || track.url || ''),
      toBlobStreamUrl(track.relativePath || ''),
      track.fileName ? `/api/videostreaming/stream?fileName=${encodeURIComponent(track.fileName)}` : ''
    ];

    return [...new Set(sources.filter(Boolean))];
  };

  // ── 3. Load new track into <audio> ──────────────────────────────────────────
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !currentTrack) return;
    const shouldAutoplay = playingRef.current || playRequestedRef.current;
    const autoplayToken = Date.now();
    let cancelled = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    const candidates = buildTrackSources(currentTrack);
    sourceCandidatesRef.current = candidates;
    sourceIndexRef.current = 0;

    const sourceUrl = String(candidates[0] || '').trim();
    if (!sourceUrl) {
      playRequestedRef.current = false;
      el.pause();
      addToast('This track has no playable media URL yet.', 'warning');
      return;
    }
    el.pause();
    el.currentTime = 0;
    el.src = sourceUrl;
    el.load();

    // Resume/start playback after load when playback was active or user pressed/touched a track.
    if (shouldAutoplay) {
      playRequestedRef.current = false;
      const handleCanPlay = () => {
        if (cancelled) {
          return;
        }
        ensureGraph();
        const ctx = nodesRef.current?.ctx;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        el.play()
          .then(() => setIsPlaying(true))
          .catch((error) => {
            setIsPlaying(false);
            playRequestedRef.current = false;
            addToast(error?.message || 'Playback failed to start.', 'error');
          });
      };

      el.addEventListener('canplay', handleCanPlay, { once: true });
      return () => {
        cancelled = true;
        el.removeEventListener('canplay', handleCanPlay);
        if (playRequestedRef.current && autoplayToken) {
          playRequestedRef.current = false;
        }
      };
    }
  }, [currentTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Build the audio graph ONCE on first user interaction ─────────────────
  //    createMediaElementSource can only be called once per element.
  //    All subsequent changes go through live param updates, never rebuild.
  const ensureGraph = () => {
    const el = audioRef.current;
    if (!el) return;
    if (nodesRef.current) {
      // Already built — just resume context if suspended
      nodesRef.current.ctx.state === 'suspended' && nodesRef.current.ctx.resume();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const n = {};
    n.ctx = ctx;

    // Source — created exactly once
    n.source = ctx.createMediaElementSource(el);

    // ── Vocal processor (always wired; mode toggled via gain values) ──────
    // Normal path: L→mergeL (gain 1), R→mergeR (gain 1)
    // Side  path: (L–R)→mergeL (gain 0 or 1), (R–L)→mergeR (gain 0 or 1)
    n.vSplit   = ctx.createChannelSplitter(2);
    n.vMerge   = ctx.createChannelMerger(2);

    n.normL    = ctx.createGain();   // L direct to L output
    n.normR    = ctx.createGain();   // R direct to R output
    n.lForL    = ctx.createGain();   // L positive  (for side-L = L−R)
    n.rInvL    = ctx.createGain();   // R inverted  (for side-L)
    n.rForR    = ctx.createGain();   // R positive  (for side-R = R−L)
    n.lInvR    = ctx.createGain();   // L inverted  (for side-R)
    n.sideEnL  = ctx.createGain();   // side-L enable gate (0 or 1)
    n.sideEnR  = ctx.createGain();   // side-R enable gate (0 or 1)

    n.source.connect(n.vSplit);

    // Normal passthrough
    n.vSplit.connect(n.normL, 0);
    n.vSplit.connect(n.normR, 1);
    n.normL.connect(n.vMerge, 0, 0);
    n.normR.connect(n.vMerge, 0, 1);

    // Side (vocal-removed) path
    n.lForL.gain.value  =  1;
    n.rInvL.gain.value  = -1;
    n.rForR.gain.value  =  1;
    n.lInvR.gain.value  = -1;
    n.vSplit.connect(n.lForL, 0);
    n.vSplit.connect(n.rInvL, 1);
    n.vSplit.connect(n.rForR, 1);
    n.vSplit.connect(n.lInvR, 0);
    n.lForL.connect(n.sideEnL);
    n.rInvL.connect(n.sideEnL);
    n.rForR.connect(n.sideEnR);
    n.lInvR.connect(n.sideEnR);
    n.sideEnL.connect(n.vMerge, 0, 0);
    n.sideEnR.connect(n.vMerge, 0, 1);

    // Initial vocal mode = normal
    n.normL.gain.value   = 1;  n.normR.gain.value   = 1;
    n.sideEnL.gain.value = 0;  n.sideEnR.gain.value = 0;

    // ── 10-band EQ (always wired; update gains live) ──────────────────────
    n.eq = EQ_BANDS.map((band, i) => {
      const f = ctx.createBiquadFilter();
      f.type            = band.type;
      f.frequency.value = band.freq;
      f.Q.value         = band.type === 'peaking' ? 1.0 : 0.7;
      f.gain.value      = 0;
      return f;
    });
    let prev = n.vMerge;
    for (const f of n.eq) { prev.connect(f); prev = f; }

    // ── Compressor ────────────────────────────────────────────────────────
    n.comp = ctx.createDynamicsCompressor();
    n.comp.threshold.value = -24;
    n.comp.ratio.value     = 4;
    n.comp.attack.value    = 0.003;
    n.comp.release.value   = 0.25;
    n.comp.knee.value      = 10;
    prev.connect(n.comp);

    // ── Reverb (parallel dry/wet) ─────────────────────────────────────────
    n.dryGain  = ctx.createGain();
    n.wetGain  = ctx.createGain();
    n.convolver= ctx.createConvolver();
    n.convolver.buffer = makeReverbIR(ctx);
    n.dryGain.gain.value = 1;
    n.wetGain.gain.value = 0;
    n.comp.connect(n.dryGain);
    n.comp.connect(n.convolver);
    n.convolver.connect(n.wetGain);

    // ── Stereo width via M/S ──────────────────────────────────────────────
    n.wSplit  = ctx.createChannelSplitter(2);
    n.wMerge  = ctx.createChannelMerger(2);
    n.midL    = ctx.createGain();  n.midL.gain.value   = 1;
    n.midR    = ctx.createGain();  n.midR.gain.value   = 1;
    n.sideWL  = ctx.createGain();  n.sideWL.gain.value = 1;   // width factor
    n.sideWR  = ctx.createGain();  n.sideWR.gain.value = -1;

    // Sum dry+wet before width splitter
    const mixMerge = ctx.createChannelMerger(2);
    n.dryGain.connect(mixMerge, 0, 0);
    n.dryGain.connect(mixMerge, 0, 1);
    n.wetGain.connect(mixMerge, 0, 0);
    n.wetGain.connect(mixMerge, 0, 1);

    mixMerge.connect(n.wSplit);
    n.wSplit.connect(n.midL,  0);
    n.wSplit.connect(n.midR,  1);
    n.wSplit.connect(n.sideWL,0);
    n.wSplit.connect(n.sideWR,1);
    n.midL.connect(n.wMerge,  0, 0);
    n.midR.connect(n.wMerge,  0, 1);
    n.sideWL.connect(n.wMerge,0, 0);
    n.sideWR.connect(n.wMerge,0, 1);

    // ── Master gain + analyser ────────────────────────────────────────────
    n.master  = ctx.createGain();
    n.master.gain.value = 0.85;
    n.analyser= ctx.createAnalyser();
    n.analyser.fftSize = 128;

    n.wMerge.connect(n.master);
    n.master.connect(n.analyser);
    n.analyser.connect(ctx.destination);

    nodesRef.current = n;
  };

  // ── 5. Apply vocal mode (live toggle — no graph rebuild) ─────────────────────
  useEffect(() => {
    const n = nodesRef.current;
    if (!n) return;
    const isVocal = vocalMode === 'instrumental' || vocalMode === 'karaoke';
    n.normL.gain.value   = isVocal ? 0 : 1;
    n.normR.gain.value   = isVocal ? 0 : 1;
    n.sideEnL.gain.value = isVocal ? 1 : 0;
    n.sideEnR.gain.value = isVocal ? 1 : 0;
  }, [vocalMode]);

  // ── 6. Live EQ updates ───────────────────────────────────────────────────────
  useEffect(() => {
    const n = nodesRef.current;
    if (!n?.eq) return;
    n.eq.forEach((f, i) => { f.gain.value = eqGains[i]; });
  }, [eqGains]);

  // ── 7. Live compressor updates ────────────────────────────────────────────────
  useEffect(() => {
    const c = nodesRef.current?.comp;
    if (!c) return;
    c.threshold.value = compThreshold;
    c.ratio.value     = compRatio;
    c.attack.value    = compAttack;
    c.release.value   = compRelease;
  }, [compThreshold, compRatio, compAttack, compRelease]);

  // ── 8. Live reverb / width / volume updates ──────────────────────────────────
  useEffect(() => {
    const n = nodesRef.current;
    if (!n) return;
    n.dryGain.gain.value  = 1 - reverbWet;
    n.wetGain.gain.value  = reverbWet;
  }, [reverbWet]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n) return;
    n.sideWL.gain.value = stereoWidth;
    n.sideWR.gain.value = -stereoWidth;
  }, [stereoWidth]);

  useEffect(() => {
    const n = nodesRef.current;
    if (!n) return;
    n.master.gain.value = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // ── 9. Visualizer RAF loop ────────────────────────────────────────────────────
  useEffect(() => {
    let raf;
    const tick = () => {
      const a = nodesRef.current?.analyser;
      if (a) {
        const buf = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(buf);
        setVizData(new Uint8Array(buf));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── 10. Draw canvas ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext('2d');
    if (!c) return;
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    const bw = W / vizData.length;
    for (let i = 0; i < vizData.length; i++) {
      const h   = (vizData[i] / 255) * H;
      const hue = 120 + (i / vizData.length) * 120;
      const grd = c.createLinearGradient(0, H - h, 0, H);
      grd.addColorStop(0, `hsla(${hue},100%,60%,.9)`);
      grd.addColorStop(1, `hsla(${hue},80%,30%,.35)`);
      c.fillStyle = grd;
      c.fillRect(i * bw + 1, H - h, bw - 2, h);
    }
  }, [vizData]);

  const detectInputConnectionType = (label = '') => {
    const normalized = String(label || '').toLowerCase();
    if (normalized.includes('bluetooth') || normalized.includes('airpods') || normalized.includes('buds') || normalized.includes('wireless')) {
      return 'bluetooth';
    }
    if (normalized.includes('network') || normalized.includes('remote') || normalized.includes('ip')) {
      return 'network';
    }
    return 'wired';
  };

  const stopInputMeter = () => {
    if (inputMeterRafRef.current) {
      cancelAnimationFrame(inputMeterRafRef.current);
      inputMeterRafRef.current = null;
    }
  };

  const disconnectInputDevice = () => {
    if (inputTimerRef.current) {
      clearInterval(inputTimerRef.current);
      inputTimerRef.current = null;
    }
    if (inputRecorderRef.current && inputRecorderRef.current.state !== 'inactive') {
      inputRecorderRef.current.stop();
    }
    stopInputMeter();
    if (inputStreamRef.current) {
      inputStreamRef.current.getTracks().forEach((track) => track.stop());
      inputStreamRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }
    inputAnalyserRef.current = null;
    inputMonitorGainRef.current = null;
    inputRecorderRef.current = null;
    inputChunksRef.current = [];
    setInputStatus('disconnected');
    setInputLevel(0);
    setIsInputRecording(false);
    setInputRecordingTime(0);
    setMonitorInputEnabled(false);
  };

  const disconnectCameraDevice = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setCameraStatus('disconnected');
  };

  const refreshInputDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      setInputDevices(inputs);
      if (!selectedInputDeviceId && inputs.length > 0) {
        setSelectedInputDeviceId(inputs[0].deviceId);
      }
    } catch (error) {
      addToast(error?.message || 'Unable to load audio input devices.', 'error');
    }
  };

  const refreshCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === 'videoinput');
      setCameraDevices(cameras);
      if (!selectedCameraDeviceId && cameras.length > 0) {
        setSelectedCameraDeviceId(cameras[0].deviceId);
      }
    } catch (error) {
      addToast(error?.message || 'Unable to load camera devices.', 'error');
    }
  };

  const startInputMeter = () => {
    const analyser = inputAnalyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 255;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setInputLevel(Math.min(100, Math.round(rms * 160)));
      inputMeterRafRef.current = requestAnimationFrame(draw);
    };

    stopInputMeter();
    inputMeterRafRef.current = requestAnimationFrame(draw);
  };

  const connectInputDevice = async () => {
    const targetId = selectedInputDeviceId || inputDevices[0]?.deviceId;
    if (!targetId) {
      addToast('No input device selected.', 'warning');
      return;
    }

    if (inputStatus === 'connected' || inputStatus === 'recording') {
      disconnectInputDevice();
      return;
    }

    setInputStatus('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: targetId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = 0;

      source.connect(analyser);
      source.connect(monitorGain);
      monitorGain.connect(ctx.destination);

      inputStreamRef.current = stream;
      inputAudioContextRef.current = ctx;
      inputAnalyserRef.current = analyser;
      inputMonitorGainRef.current = monitorGain;

      const selectedDevice = inputDevices.find((device) => device.deviceId === targetId);
      const type = detectInputConnectionType(selectedDevice?.label || '');
      setInputConnectionType(type);
      setInputStatus('connected');
      startInputMeter();
      addToast(`${selectedDevice?.label || 'Audio input'} connected.`, 'success');
    } catch (error) {
      setInputStatus('error');
      addToast(error?.message || 'Failed to connect selected audio input.', 'error');
    }
  };

  const connectCameraDevice = async () => {
    const targetId = selectedCameraDeviceId || cameraDevices[0]?.deviceId;
    if (!targetId) {
      addToast('No camera selected.', 'warning');
      return;
    }

    if (cameraStatus === 'connected') {
      disconnectCameraDevice();
      return;
    }

    setCameraStatus('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: targetId } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraStatus('connected');
      const selectedCamera = cameraDevices.find((device) => device.deviceId === targetId);
      addToast(`${selectedCamera?.label || 'Camera'} connected.`, 'success');
    } catch (error) {
      setCameraStatus('error');
      addToast(error?.message || 'Failed to connect selected camera.', 'error');
    }
  };

  const detectInstrumentHints = (...labels) => {
    const text = labels.join(' ').toLowerCase();
    const hints = [];
    if (/mic|microphone|headset|interface/.test(text)) hints.push('mic');
    if (/camera|webcam|usb video/.test(text)) hints.push('camera');
    if (/piano|keys|keylab/.test(text)) hints.push('piano');
    if (/keyboard|midi|controller|synth/.test(text)) hints.push('keyboard');
    if (/guitar|line\s*in|amp|pickup/.test(text)) hints.push('guitar');
    if (/creator|beat|drum\s*pad|sampler|groovebox/.test(text)) hints.push('sound-creator');
    return Array.from(new Set(hints));
  };

  const toggleInstrumentLink = (instrumentId) => {
    setManualInstrumentLinks((prev) => ({
      ...prev,
      [instrumentId]: !prev[instrumentId],
    }));
  };

  const handleRightsCheckout = async (plan, interval = 'monthly') => {
    if (!user) {
      addToast('Please sign in to activate a Music Rights plan.', 'warning');
      return;
    }

    const selectedPriceId = interval === 'annual' ? plan.annualPriceId : plan.monthlyPriceId;
    if (!selectedPriceId || !String(selectedPriceId).startsWith('price_')) {
      addToast(`Billing is not configured yet for ${plan.name} ${interval}.`, 'info');
      return;
    }

    const checkoutKey = `${plan.id}-${interval}`;
    setRightsCheckoutKey(checkoutKey);
    try {
      const origin = window.location.origin;
      const response = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: JSON.stringify({
          priceId: selectedPriceId,
          successUrl: `${origin}/?subscription=success`,
          cancelUrl: `${origin}/?subscription=cancelled`
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        addToast(payload?.message || payload?.error || 'Unable to start checkout right now.', 'error');
        return;
      }

      const payload = await response.json();
      if (payload?.url) {
        window.location.assign(payload.url);
        return;
      }

      addToast('Checkout session was created but no redirect URL was returned.', 'error');
    } catch (error) {
      addToast(error?.message || 'Unable to open checkout right now.', 'error');
    } finally {
      setRightsCheckoutKey('');
    }
  };

  const uploadRecordedInput = async (blob) => {
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fallbackName = `live-input-${stamp}.${ext}`;
    const title = inputRecordingTitle.trim() || `Live Input ${new Date().toLocaleString()}`;
    const deviceLabel = inputDevices.find((d) => d.deviceId === selectedInputDeviceId)?.label || 'External Input';
    const file = new File([blob], fallbackName, { type: blob.type || 'audio/webm' });

    setIsSavingInputRecording(true);
    try {
      const response = await apiService.uploadMusicTrack(file, {
        title,
        artist: `${deviceLabel} (${inputConnectionType})`,
        album: 'Live Input',
        genre: inputConnectionType === 'bluetooth' ? 'Bluetooth Live' : 'Live Capture',
        destinationFolder: '/wiseravenshare/ravensight/music'
      });

      const uploadedTrack = normalizeTrack(response?.data?.track || response?.data?.file || response?.data || null);
      if (uploadedTrack) {
        setLibrary((prev) => {
          const next = [uploadedTrack, ...prev];
          try {
            localStorage.setItem('wiseMusic_library', JSON.stringify(next));
          } catch {
            /* ignore storage errors */
          }
          return next;
        });
        setCurrentTrack(uploadedTrack);
        setTrackIndex(0);
      }
      addToast('Recorded input saved to your music library.', 'success');
    } catch (error) {
      addToast(error?.message || 'Failed to save recorded input.', 'error');
    } finally {
      setIsSavingInputRecording(false);
    }
  };

  const startInputRecording = () => {
    if (!inputStreamRef.current) {
      addToast('Connect an input device first.', 'warning');
      return;
    }
    if (isInputRecording) {
      return;
    }

    try {
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = candidates.find((item) => MediaRecorder.isTypeSupported(item)) || '';
      const recorder = mimeType
        ? new MediaRecorder(inputStreamRef.current, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(inputStreamRef.current);

      inputChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          inputChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        const finalType = mimeType || recorder.mimeType || 'audio/webm';
        const blob = new Blob(inputChunksRef.current, { type: finalType });
        inputChunksRef.current = [];
        if (blob.size > 0) {
          await uploadRecordedInput(blob);
        }
      };

      recorder.start(300);
      inputRecorderRef.current = recorder;
      setIsInputRecording(true);
      setInputStatus('recording');
      setInputRecordingTime(0);
      if (inputTimerRef.current) {
        clearInterval(inputTimerRef.current);
      }
      inputTimerRef.current = setInterval(() => {
        setInputRecordingTime((prev) => prev + 1);
      }, 1000);
      addToast('Input recording started.', 'success');
    } catch (error) {
      addToast(error?.message || 'Unable to start recording.', 'error');
    }
  };

  const stopInputRecording = () => {
    if (!inputRecorderRef.current || inputRecorderRef.current.state === 'inactive') {
      return;
    }
    inputRecorderRef.current.stop();
    setIsInputRecording(false);
    setInputStatus('connected');
    if (inputTimerRef.current) {
      clearInterval(inputTimerRef.current);
      inputTimerRef.current = null;
    }
  };

  useEffect(() => {
    refreshInputDevices();
    refreshCameraDevices();
    const onDeviceChange = () => {
      refreshInputDevices();
      refreshCameraDevices();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      disconnectInputDevice();
      disconnectCameraDevice();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedInputLabel = useMemo(
    () => inputDevices.find((d) => d.deviceId === selectedInputDeviceId)?.label || '',
    [inputDevices, selectedInputDeviceId]
  );

  const selectedCameraLabel = useMemo(
    () => cameraDevices.find((d) => d.deviceId === selectedCameraDeviceId)?.label || '',
    [cameraDevices, selectedCameraDeviceId]
  );

  const autoInstrumentHints = useMemo(
    () => detectInstrumentHints(selectedInputLabel, selectedCameraLabel),
    [selectedInputLabel, selectedCameraLabel]
  );

  const linkedInstruments = useMemo(
    () => INSTRUMENT_OPTIONS.map((opt) => {
      const isLinkedByDevice = autoInstrumentHints.includes(opt.id);
      const isLiveConnected = (opt.id === 'mic' && (inputStatus === 'connected' || inputStatus === 'recording'))
        || (opt.id === 'camera' && cameraStatus === 'connected');
      return {
        ...opt,
        connected: Boolean(manualInstrumentLinks[opt.id] || isLinkedByDevice || isLiveConnected),
      };
    }),
    [autoInstrumentHints, manualInstrumentLinks, inputStatus, cameraStatus]
  );

  useEffect(() => {
    if (!inputMonitorGainRef.current) return;
    inputMonitorGainRef.current.gain.value = monitorInputEnabled ? monitorInputLevel : 0;
  }, [monitorInputEnabled, monitorInputLevel]);

  // ── Transport handlers ────────────────────────────────────────────────────────
  const play = async () => {
    const el = audioRef.current;
    if (!currentTrack && library.length > 0) {
      setCurrentTrack(library[0]);
      setTrackIndex(0);
      return;
    }

    if (!el || !currentTrack) {
      addToast('Select or upload a track first.', 'warning');
      return;
    }

    if (!el.src) {
      const candidates = buildTrackSources(currentTrack);
      const sourceUrl = String(candidates[0] || '').trim();
      if (sourceUrl) {
        sourceCandidatesRef.current = candidates;
        sourceIndexRef.current = 0;
        el.pause();
        el.currentTime = 0;
        el.src = sourceUrl;
        el.load();
      }
    }

    if (!el.src) {
      addToast('This track has no playable media URL yet.', 'warning');
      return;
    }

    ensureGraph();
    // Resume AudioContext if suspended (browser autoplay policy requirement)
    const ctx = nodesRef.current?.ctx;
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext:', e);
      }
    }
    try {
      await el.play();
      setIsPlaying(true);
    } catch (e) {
      console.warn('Play failed:', e.message);
      addToast('Playback failed: ' + (e.message || 'Unknown error'), 'error');
    }
  };

  const pause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const stop = () => {
    const el = audioRef.current;
    if (el) { el.pause(); el.currentTime = 0; }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const seek = (e) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const handleUploadTrack = async (e) => {
    e?.preventDefault();
    const queuedFile = uploadFile || uploadInputRef.current?.files?.[0] || null;
    if (!queuedFile) {
      addToast('Choose a music file first.', 'warning');
      return;
    }

    setIsUploading(true);
    try {
      const response = await apiService.uploadMusicTrack(queuedFile, {
        title: uploadTitle || queuedFile.name.replace(/\.[^/.]+$/, ''),
        artist: uploadArtist,
        album: uploadAlbum,
        genre: uploadGenre,
        destinationFolder: '/wiseravenshare/ravensight/music'
      });

      const uploadedTrack = normalizeTrack(response?.data?.track || response?.data?.file || response?.data || null);
      if (uploadedTrack) {
        setLibrary((prev) => {
          const next = [uploadedTrack, ...prev];
          try {
            localStorage.setItem('wiseMusic_library', JSON.stringify(next));
          } catch {
            /* ignore storage errors */
          }
          return next;
        });
        setCurrentTrack(uploadedTrack);
        setTrackIndex(0);
      }

      setUploadFile(null);
      setUploadTitle('');
      setUploadArtist('');
      setUploadAlbum('');
      setUploadGenre('');
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
      addToast('Track uploaded to your music library.', 'success');
    } catch (error) {
      addToast(error?.message || 'Music upload failed.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const selectTrack = (track, idx, shouldPlay = true) => {
    playRequestedRef.current = shouldPlay;
    setCurrentTrack(track);
    setTrackIndex(idx);
  };

  const skipNext = () => {
    if (!library.length) return;
    const next = shuffle
      ? Math.floor(Math.random() * library.length)
      : (trackIndex + 1) % library.length;
    selectTrack(library[next], next);
  };

  const skipPrev = () => {
    if (!library.length) return;
    if (currentTime > 3) { audioRef.current.currentTime = 0; return; }
    const prev = trackIndex === 0 ? library.length - 1 : trackIndex - 1;
    selectTrack(library[prev], prev);
  };

  const applyPreset = (name) => {
    setActivePreset(name);
    setEqGains([...EQ_PRESETS[name]]);
  };

  const cycleRepeat = () =>
    setRepeat(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off');

  const filtered = library.filter(t =>
    !searchQuery ||
    (t.title  || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.artist || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="studio-loading">
        <div className="spinner" />
        <p>Loading studio…</p>
      </div>
    );
  }

  return (
    <div className="music-studio">
      <audio ref={audioRef} />

      {/* ── Header ── */}
      <div className="studio-header">
        <div className="studio-title"><FiActivity /> WiseRaven Music Studio</div>
        <div className="studio-track-info">
          {currentTrack ? (
            <>
              <span className="ti-title">{currentTrack.title}</span>
              <span className="ti-sep">·</span>
              <span className="ti-artist">{currentTrack.artist || 'Unknown Artist'}</span>
              {vocalMode !== 'normal' && (
                <span className={`mode-badge ${vocalMode}`}>
                  {vocalMode === 'instrumental' ? 'INSTRUMENTAL' : 'KARAOKE'}
                </span>
              )}
            </>
          ) : (
            <span className="ti-empty">Upload tracks in the Music Rights Studio to get started</span>
          )}
        </div>
      </div>

      {/* ── Visualizer ── */}
      <div className="studio-visualizer">
        <canvas ref={canvasRef} width={900} height={90} />
      </div>

      {/* ── Transport ── */}
      <div className="studio-transport">
        <div className="transport-side">
          <button className={`tx-btn ${shuffle ? 'active' : ''}`} onClick={() => setShuffle(s => !s)} title="Shuffle">
            <FiShuffle />
          </button>
          <button className={`tx-btn ${repeat !== 'off' ? 'active' : ''}`} onClick={cycleRepeat} title={`Repeat: ${repeat}`}>
            <FiRepeat />
            {repeat === 'one' && <span className="repeat-badge">1</span>}
          </button>
        </div>

        <div className="transport-main">
          <button className="tx-btn" onClick={skipPrev}><FiSkipBack /></button>
          {isPlaying
            ? <button className="tx-btn play-pause" onClick={pause}><FiPause /></button>
            : <button className="tx-btn play-pause" onClick={play} disabled={!currentTrack && library.length === 0}><FiPlay /></button>
          }
          <button className="tx-btn" onClick={stop}><FiSquare /></button>
          <button className="tx-btn" onClick={skipNext}><FiSkipForward /></button>
        </div>

        <div className="transport-side right">
          <button className="tx-btn" onClick={() => setIsMuted(m => !m)}>
            {isMuted ? <FiVolumeX /> : <FiVolume2 />}
          </button>
          <input type="range" min="0" max="1" step="0.01"
            value={isMuted ? 0 : volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="vol-slider"
          />
          <span className="vol-pct">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* ── Seek bar ── */}
      <div className="studio-progress">
        <span className="time-label">{fmt(currentTime)}</span>
        <input type="range" min="0" max={duration || 0} step="0.1"
          value={currentTime} onChange={seek}
          className="seek-slider" disabled={!currentTrack}
        />
        <span className="time-label">{fmt(duration)}</span>
      </div>

      {/* ── Main: Library ← | → Studio Controls ── */}
      <div className="studio-main">

        {/* Library panel (left) */}
        <div className="studio-library">
          <div className="lib-header">
            <span><FiList /> Library ({library.length})</span>
            <div className="lib-search">
              <FiSearch />
              <input type="text" placeholder="Search…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && <button onClick={() => setSearchQuery('')}><FiX /></button>}
            </div>
          </div>

          <form className="lib-upload" onSubmit={handleUploadTrack}>
            <div className="lib-upload-title"><FiUpload /> Upload music to your library</div>
            <input
              type="file"
              ref={uploadInputRef}
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setUploadFile(file);
                if (file && !uploadTitle) {
                  setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
                }
              }}
            />
            {uploadFile && (
              <small className="upload-queue-hint">Queued: {uploadFile.name}</small>
            )}
            <div className="lib-upload-grid">
              <input
                type="text"
                placeholder="Title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
              />
              <input
                type="text"
                placeholder="Artist"
                value={uploadArtist}
                onChange={(e) => setUploadArtist(e.target.value)}
              />
              <input
                type="text"
                placeholder="Album"
                value={uploadAlbum}
                onChange={(e) => setUploadAlbum(e.target.value)}
              />
              <input
                type="text"
                placeholder="Genre"
                value={uploadGenre}
                onChange={(e) => setUploadGenre(e.target.value)}
              />
            </div>
            <button className="upload-btn" type="submit" disabled={isUploading || !uploadFile}>
              {isUploading ? 'Uploading…' : 'Save to Bucket Library'}
            </button>
          </form>

          {library.length === 0 ? (
            <div className="lib-empty">
              <FiMusic size={32} />
              <p>No tracks uploaded yet</p>
              <button onClick={() => onNavigate?.('music-rights-studio')}>
                Go to Music Rights Studio
              </button>
            </div>
          ) : (
            <div className="lib-tracks">
              {filtered.map((t) => {
                const i = library.indexOf(t);
                const active = currentTrack?.id === t.id;
                return (
                  <div key={t.id}
                    className={`lib-track ${active ? 'active' : ''}`}
                    onClick={() => selectTrack(t, i, true)}
                    onTouchEnd={(event) => {
                      event.preventDefault();
                      selectTrack(t, i, true);
                    }}
                  >
                    <div className="lt-num">
                      {active && isPlaying
                        ? <span className="playing-dot" />
                        : <span className="track-num">{i + 1}</span>}
                    </div>
                    <div className="lt-info">
                      <span className="lt-title">{t.title || 'Untitled'}</span>
                      <span className="lt-artist">{t.artist || 'Unknown'}</span>
                    </div>
                    <span className="lt-dur">{t.duration || '—'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Studio controls (right) */}
        <div className="studio-panels">
          <div className="panel-tabs">
            <button className={activePanel === 'eq'      ? 'active' : ''} onClick={() => setActivePanel('eq')}>
              <FiSliders /> Equalizer
            </button>
            <button className={activePanel === 'effects' ? 'active' : ''} onClick={() => setActivePanel('effects')}>
              <FiRadio /> Effects
            </button>
            <button className={activePanel === 'vocal'   ? 'active' : ''} onClick={() => setActivePanel('vocal')}>
              <FiMic /> Vocal
            </button>
            <button className={activePanel === 'input'   ? 'active' : ''} onClick={() => setActivePanel('input')}>
              <FiRadio /> Input
            </button>
            <button className={activePanel === 'rights' ? 'active' : ''} onClick={() => setActivePanel('rights')}>
              <FiLink /> Rights
            </button>
            <button className={activePanel === 'fm'      ? 'active' : ''} onClick={() => setActivePanel('fm')}>
              <FiActivity /> FM Tuner
            </button>
            <button className={activePanel === 'radio-creator' ? 'active' : ''} onClick={() => setActivePanel('radio-creator')}>
              <FiRadio /> Radio Creator
            </button>
          </div>

          {/* ── EQ panel ── */}
          {activePanel === 'eq' && (
            <div className="panel eq-panel">
              <div className="preset-row">
                {Object.keys(EQ_PRESETS).map(p => (
                  <button key={p}
                    className={`preset-btn ${activePreset === p ? 'active' : ''}`}
                    onClick={() => applyPreset(p)}
                  >{p}</button>
                ))}
              </div>

              <div className="eq-bands">
                {EQ_BANDS.map((band, i) => (
                  <div key={band.freq} className="eq-band">
                    <span className="eq-val">{eqGains[i] > 0 ? '+' : ''}{eqGains[i]}</span>
                    <input type="range" min="-12" max="12" step="0.5"
                      value={eqGains[i]}
                      onChange={e => {
                        const g = [...eqGains];
                        g[i] = parseFloat(e.target.value);
                        setEqGains(g);
                        setActivePreset('custom');
                      }}
                      className="eq-slider vertical"
                      orient="vertical"
                    />
                    <span className="eq-label">{band.label}</span>
                  </div>
                ))}
              </div>

              <button className="reset-btn" onClick={() => applyPreset('flat')}>Reset EQ</button>
            </div>
          )}

          {/* ── Effects panel ── */}
          {activePanel === 'effects' && (
            <div className="panel effects-panel">
              <div className="fx-group">
                <label>Reverb <span className="fx-val">{Math.round(reverbWet * 100)}%</span></label>
                <input type="range" min="0" max="0.9" step="0.01"
                  value={reverbWet} onChange={e => setReverbWet(parseFloat(e.target.value))}
                  className="fx-slider" />
              </div>

              <div className="fx-group">
                <label>Stereo Width
                  <span className="fx-val">{stereoWidth === 1 ? 'Normal' : stereoWidth < 1 ? `${Math.round(stereoWidth * 100)}% (narrowing)` : `${Math.round(stereoWidth * 100)}% (wide)`}</span>
                </label>
                <input type="range" min="0" max="2" step="0.01"
                  value={stereoWidth} onChange={e => setStereoWidth(parseFloat(e.target.value))}
                  className="fx-slider" />
              </div>

              <div className="fx-divider">Dynamics Compressor</div>

              <div className="fx-group">
                <label>Threshold <span className="fx-val">{compThreshold} dB</span></label>
                <input type="range" min="-60" max="0" step="1"
                  value={compThreshold} onChange={e => setCompThreshold(parseFloat(e.target.value))}
                  className="fx-slider" />
              </div>
              <div className="fx-group">
                <label>Ratio <span className="fx-val">{compRatio}:1</span></label>
                <input type="range" min="1" max="20" step="0.5"
                  value={compRatio} onChange={e => setCompRatio(parseFloat(e.target.value))}
                  className="fx-slider" />
              </div>
              <div className="fx-row">
                <div className="fx-group half">
                  <label>Attack <span className="fx-val">{Math.round(compAttack * 1000)}ms</span></label>
                  <input type="range" min="0" max="0.2" step="0.001"
                    value={compAttack} onChange={e => setCompAttack(parseFloat(e.target.value))}
                    className="fx-slider" />
                </div>
                <div className="fx-group half">
                  <label>Release <span className="fx-val">{Math.round(compRelease * 1000)}ms</span></label>
                  <input type="range" min="0" max="1" step="0.01"
                    value={compRelease} onChange={e => setCompRelease(parseFloat(e.target.value))}
                    className="fx-slider" />
                </div>
              </div>
            </div>
          )}

          {/* ── Vocal panel ── */}
          {activePanel === 'vocal' && (
            <div className="panel vocal-panel">
              <p className="vocal-desc">
                Mid-side audio separation removes center-panned vocals in real time.
                Works best on professionally mixed tracks where lead vocals are centered.
              </p>

              {[
                { id: 'normal',       icon: <FiMic />,    label: 'Normal',        sub: 'Full original mix — vocals included' },
                { id: 'instrumental', icon: <FiMicOff />, label: 'Instrumental',  sub: 'Center channel removed — good for sampling and remixing' },
                { id: 'karaoke',      icon: <FiMusic />,  label: 'Karaoke',       sub: 'Same vocal removal with karaoke display mode' },
              ].map(m => (
                <button key={m.id}
                  className={`vocal-mode-btn ${vocalMode === m.id ? 'active' : ''}`}
                  onClick={() => setVocalMode(m.id)}
                >
                  <span className="vm-icon">{m.icon}</span>
                  <div className="vm-text">
                    <span className="vm-label">{m.label}</span>
                    <span className="vm-sub">{m.sub}</span>
                  </div>
                </button>
              ))}

              {vocalMode === 'karaoke' && (
                <div className="karaoke-display">
                  <FiMic size={24} />
                  <p>Karaoke mode — vocals removed</p>
                  <p className="karaoke-hint">
                    Sync lyrics from the Music Rights Studio to display them here
                  </p>
                </div>
              )}
            </div>
          )}

          {activePanel === 'input' && (
            <div className="panel input-panel">
              <p className="input-desc">
                Connect mic and camera devices, then map instrument connectors for piano, keyboard, guitar, and sound creators.
                Keep devices paired and enabled in your OS settings.
              </p>

              <div className="input-device-row">
                <select
                  className="input-select"
                  value={selectedInputDeviceId}
                  onChange={(e) => setSelectedInputDeviceId(e.target.value)}
                >
                  {inputDevices.length === 0 && (
                    <option value="">No input devices detected</option>
                  )}
                  {inputDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Input ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <button className="input-btn" onClick={refreshInputDevices}>
                  Refresh
                </button>
                <button
                  className={`input-btn ${inputStatus === 'connected' || inputStatus === 'recording' ? 'danger' : 'primary'}`}
                  onClick={connectInputDevice}
                >
                  {inputStatus === 'connected' || inputStatus === 'recording' ? 'Disconnect' : 'Connect'}
                </button>
              </div>

              <div className="input-status-line">
                <span className={`input-status-badge ${inputStatus}`}>{inputStatus.toUpperCase()}</span>
                <span className="input-type">Type: {inputConnectionType}</span>
                {isInputRecording && (
                  <span className="input-rec-time">● REC {fmt(inputRecordingTime)}</span>
                )}
              </div>

              <div className="input-device-row compact-row">
                <select
                  className="input-select compact"
                  value={selectedCameraDeviceId}
                  onChange={(e) => setSelectedCameraDeviceId(e.target.value)}
                >
                  {cameraDevices.length === 0 && (
                    <option value="">No camera devices detected</option>
                  )}
                  {cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <button className="input-btn compact" onClick={refreshCameraDevices}>
                  Camera Refresh
                </button>
                <button
                  className={`input-btn compact ${cameraStatus === 'connected' ? 'danger' : 'primary'}`}
                  onClick={connectCameraDevice}
                >
                  {cameraStatus === 'connected' ? 'Camera Disconnect' : 'Camera Connect'}
                </button>
              </div>

              <div className="input-status-line compact-status">
                <span className={`input-status-badge ${cameraStatus}`}>{cameraStatus.toUpperCase()}</span>
                <span className="input-type">Camera</span>
                <span className="input-type">{selectedCameraLabel || 'No camera label yet'}</span>
              </div>

              <div className="connector-wrap">
                <div className="connector-title">Instrument connectors</div>
                <div className="connector-grid">
                  {linkedInstruments.map((instrument) => (
                    <button
                      key={instrument.id}
                      type="button"
                      className={`connector-chip ${instrument.connected ? 'connected' : ''}`}
                      onClick={() => toggleInstrumentLink(instrument.id)}
                    >
                      {instrument.label} · {instrument.connected ? 'linked' : 'idle'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-meter-wrap">
                <div className="input-meter-label">
                  Live input level <span>{inputLevel}%</span>
                </div>
                <div className="input-meter">
                  <div className="input-meter-fill" style={{ width: `${inputLevel}%` }} />
                </div>
              </div>

              <div className="input-monitor-row">
                <label>
                  <input
                    type="checkbox"
                    checked={monitorInputEnabled}
                    onChange={(e) => setMonitorInputEnabled(e.target.checked)}
                  />
                  Monitor input to speakers/headphones
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={monitorInputLevel}
                  onChange={(e) => setMonitorInputLevel(parseFloat(e.target.value))}
                  disabled={!monitorInputEnabled}
                />
              </div>

              <div className="input-record-row">
                <input
                  type="text"
                  className="input-title"
                  value={inputRecordingTitle}
                  onChange={(e) => setInputRecordingTitle(e.target.value)}
                  placeholder="Recording title (optional)"
                />
                {!isInputRecording ? (
                  <button
                    className="input-btn primary"
                    onClick={startInputRecording}
                    disabled={inputStatus !== 'connected'}
                  >
                    Start Recording
                  </button>
                ) : (
                  <button className="input-btn danger" onClick={stopInputRecording}>
                    Stop Recording
                  </button>
                )}
              </div>

              {isSavingInputRecording && (
                <div className="input-saving-note">Saving recorded input to your music library…</div>
              )}
            </div>
          )}

          {activePanel === 'rights' && (
            <div className="panel rights-panel">
              <div className="rights-sticky-banner">
                <div className="rights-banner-title">Music Rights Access</div>
                <div className="rights-banner-sub">
                  All users can create music in this studio. Rights protection, registration records, and legal support are unlocked via plan access.
                </div>
                <div className="rights-banner-actions">
                  <button className="input-btn" onClick={() => setActivePanel('radio-creator')}>
                    Create New Music
                  </button>
                  <button className="input-btn" onClick={() => setActivePanel('input')}>
                    Capture Live Instrument
                  </button>
                  <button className="input-btn primary" onClick={() => onNavigate?.('music-rights-studio')}>
                    Open Full Rights Studio
                  </button>
                </div>
              </div>

              <div className="rights-plan-grid">
                {RIGHTS_PLANS.map((plan) => (
                  <div key={plan.id} className="rights-plan-card">
                    <div className="rights-plan-name">{plan.name}</div>
                    <div className="rights-plan-price">{plan.monthlyPrice}</div>
                    <div className="rights-plan-price-muted">or {plan.annualPrice}</div>
                    <ul className="rights-plan-features">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <div className="rights-plan-actions">
                      <button
                        className="input-btn primary"
                        disabled={rightsCheckoutKey.length > 0}
                        onClick={() => handleRightsCheckout(plan, 'monthly')}
                      >
                        {rightsCheckoutKey === `${plan.id}-monthly` ? 'Opening...' : 'Unlock Monthly'}
                      </button>
                      <button
                        className="input-btn"
                        disabled={rightsCheckoutKey.length > 0}
                        onClick={() => handleRightsCheckout(plan, 'annual')}
                      >
                        {rightsCheckoutKey === `${plan.id}-annual` ? 'Opening...' : 'Unlock Annual'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePanel === 'fm' && (
            <div className="panel fm-panel">
              <FMTunerModule />
            </div>
          )}

          {activePanel === 'radio-creator' && (
            <div className="panel fm-panel">
              <FMCreatorStudio />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MusicStudioPage;
