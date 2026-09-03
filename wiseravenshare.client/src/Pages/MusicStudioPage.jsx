import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FiPlay, FiPause, FiSquare, FiSkipBack, FiSkipForward,
  FiRepeat, FiShuffle, FiVolume2, FiVolumeX,
  FiMusic, FiSearch, FiX, FiList, FiSliders,
  FiRadio, FiMic, FiMicOff, FiActivity
} from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import '../Styles/MusicStudio.css';

// ─── EQ Bands ────────────────────────────────────────────────────────────────
const EQ_BANDS = [
  { freq: 31,   label: '31Hz',  type: 'lowshelf'  },
  { freq: 63,   label: '63Hz',  type: 'peaking'   },
  { freq: 125,  label: '125Hz', type: 'peaking'   },
  { freq: 250,  label: '250Hz', type: 'peaking'   },
  { freq: 500,  label: '500Hz', type: 'peaking'   },
  { freq: 1000, label: '1kHz',  type: 'peaking'   },
  { freq: 2000, label: '2kHz',  type: 'peaking'   },
  { freq: 4000, label: '4kHz',  type: 'peaking'   },
  { freq: 8000, label: '8kHz',  type: 'peaking'   },
  { freq: 16000,label: '16kHz', type: 'highshelf' },
];

const EQ_PRESETS = {
  flat:      [0,0,0,0,0,0,0,0,0,0],
  bassBoost: [8,6,4,2,0,0,0,0,0,0],
  treble:    [0,0,0,0,0,0,2,4,6,8],
  vShape:    [6,4,2,0,-2,-2,0,2,4,6],
  vocalBoost:[-2,-1,0,2,4,4,3,2,0,-1],
  rock:      [5,4,2,0,-1,0,2,4,5,6],
  jazz:      [3,2,1,2,-2,-2,0,1,2,3],
  classical: [4,3,2,0,0,0,0,2,3,4],
  karaoke:   [0,0,0,0,-6,-6,-4,0,0,0],
};

// Synthetic impulse response for reverb
function createReverbBuffer(ctx, durationSec = 1.5, decay = 2.5) {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// ─── Component ────────────────────────────────────────────────────────────────
const MusicStudioPage = ({ onNavigate }) => {
  const { user } = useAuth();
  const { addToast } = useNotification();

  // Track library
  const [library, setLibrary]           = useState([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [currentTrack, setCurrentTrack] = useState(null);
  const [trackIndex, setTrackIndex]     = useState(0);

  // Playback state
  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]     = useState(0);
  const [volume, setVolume]         = useState(0.85);
  const [isMuted, setIsMuted]       = useState(false);
  const [repeat, setRepeat]         = useState('off'); // off | one | all
  const [shuffle, setShuffle]       = useState(false);

  // Studio panels
  const [activePanel, setActivePanel] = useState('eq'); // eq | effects | vocal

  // EQ
  const [eqGains, setEqGains]       = useState(EQ_BANDS.map(() => 0));
  const [activePreset, setActivePreset] = useState('flat');

  // Effects
  const [reverbWet, setReverbWet]     = useState(0);
  const [compThreshold, setCompThreshold] = useState(-24);
  const [compRatio, setCompRatio]     = useState(4);
  const [compAttack, setCompAttack]   = useState(0.003);
  const [compRelease, setCompRelease] = useState(0.25);
  const [stereoWidth, setStereoWidth] = useState(1);

  // Vocal processing
  const [vocalMode, setVocalMode]     = useState('normal'); // normal | instrumental | karaoke

  // Visualizer
  const [vizData, setVizData]         = useState(new Uint8Array(64));

  // Refs
  const audioRef      = useRef(null);
  const canvasRef     = useRef(null);
  const ctxRef        = useRef(null);    // AudioContext
  const nodesRef      = useRef({});      // Audio nodes
  const rafRef        = useRef(null);
  const vizRafRef     = useRef(null);

  // ── Load library ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('authToken');
        if (token) {
          const res = await fetch('/api/ravensight/media/music', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            const tracks = Array.isArray(data) ? data : [];
            setLibrary(tracks);
            if (tracks.length > 0) { setCurrentTrack(tracks[0]); setTrackIndex(0); }
          }
        } else {
          const stored = localStorage.getItem('wiseMusic_library');
          const tracks = stored ? JSON.parse(stored) : [];
          setLibrary(tracks);
          if (tracks.length > 0) { setCurrentTrack(tracks[0]); setTrackIndex(0); }
        }
      } catch (e) {
        console.error('Library load failed', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // ── Load track ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentTrack || !audioRef.current) return;
    const el = audioRef.current;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    el.src = currentTrack?.mediaUrl || currentTrack?.url || '';
    el.load();
  }, [currentTrack]);

  // ── Audio element event wiring ──────────────────────────────────────────────
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onMeta  = () => setDuration(el.duration || 0);
    const onTime  = () => setCurrentTime(el.currentTime || 0);
    const onEnded = () => handleTrackEnd();
    const onErr   = (e) => { console.error('Audio error', e); addToast('Playback error', 'error'); setIsPlaying(false); };

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onErr);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onErr);
    };
  }, [repeat, shuffle, library, trackIndex]);

  // ── Build / rebuild audio graph ─────────────────────────────────────────────
  const buildGraph = useCallback(() => {
    const el = audioRef.current;
    if (!el || !ctxRef.current) return;
    const ctx = ctxRef.current;

    // Disconnect old nodes
    try { nodesRef.current.source?.disconnect(); } catch (_) {}

    const n = {};
    n.source    = ctx.createMediaElementSource(el);
    n.splitter  = ctx.createChannelSplitter(2);
    n.merger    = ctx.createChannelMerger(2);

    // Vocal processing nodes
    n.lPass     = ctx.createGain();  // L passthrough
    n.rPass     = ctx.createGain();  // R passthrough
    n.lInv      = ctx.createGain();  // L inverted (for R-L)
    n.rInv      = ctx.createGain();  // R inverted (for L-R)

    // 10-band EQ
    n.eq = EQ_BANDS.map((band, i) => {
      const f = ctx.createBiquadFilter();
      f.type            = band.type;
      f.frequency.value = band.freq;
      f.Q.value         = band.type === 'peaking' ? 1.0 : 0.7;
      f.gain.value      = eqGains[i];
      return f;
    });

    // Dynamics compressor
    n.comp = ctx.createDynamicsCompressor();
    n.comp.threshold.value = compThreshold;
    n.comp.ratio.value     = compRatio;
    n.comp.attack.value    = compAttack;
    n.comp.release.value   = compRelease;
    n.comp.knee.value      = 10;

    // Reverb
    n.convolver  = ctx.createConvolver();
    n.convolver.buffer = createReverbBuffer(ctx);
    n.dryGain    = ctx.createGain();
    n.wetGain    = ctx.createGain();
    n.dryGain.gain.value  = 1 - reverbWet;
    n.wetGain.gain.value  = reverbWet;

    // Stereo width (M/S)
    n.widthSplitter = ctx.createChannelSplitter(2);
    n.widthMerger   = ctx.createChannelMerger(2);
    n.midGainL      = ctx.createGain();
    n.midGainR      = ctx.createGain();
    n.sideGainL     = ctx.createGain();
    n.sideGainR     = ctx.createGain();

    // Master gain + analyser
    n.master  = ctx.createGain();
    n.master.gain.value = isMuted ? 0 : volume;
    n.analyser = ctx.createAnalyser();
    n.analyser.fftSize = 128;

    // ── Wire vocal processing ──────────────────────────────────────────────
    n.source.connect(n.splitter);

    if (vocalMode === 'instrumental' || vocalMode === 'karaoke') {
      // L - R for left channel, R - L for right channel (removes center/vocals)
      n.lPass.gain.value =  1;
      n.rInv.gain.value  = -1;
      n.rPass.gain.value =  1;
      n.lInv.gain.value  = -1;

      n.splitter.connect(n.lPass, 0);
      n.splitter.connect(n.rInv, 1);
      n.splitter.connect(n.rPass, 1);
      n.splitter.connect(n.lInv, 0);

      n.lPass.connect(n.merger, 0, 0);
      n.rInv.connect(n.merger, 0, 0);
      n.rPass.connect(n.merger, 0, 1);
      n.lInv.connect(n.merger, 0, 1);
    } else {
      // Normal passthrough
      n.splitter.connect(n.merger, 0, 0);
      n.splitter.connect(n.merger, 1, 1);
    }

    // ── EQ chain ──────────────────────────────────────────────────────────
    let prev = n.merger;
    for (const filter of n.eq) {
      prev.connect(filter);
      prev = filter;
    }

    // ── Compressor ────────────────────────────────────────────────────────
    prev.connect(n.comp);

    // ── Reverb (dry/wet parallel) ──────────────────────────────────────────
    n.comp.connect(n.dryGain);
    n.comp.connect(n.convolver);
    n.convolver.connect(n.wetGain);

    // ── Stereo width ──────────────────────────────────────────────────────
    const preWidth = ctx.createChannelMerger(2);
    n.dryGain.connect(preWidth, 0, 0);
    n.dryGain.connect(preWidth, 0, 1);
    n.wetGain.connect(preWidth, 0, 0);
    n.wetGain.connect(preWidth, 0, 1);

    preWidth.connect(n.widthSplitter);
    // Mid = L+R, Side = L-R scaled by stereoWidth
    const w = stereoWidth;
    n.midGainL.gain.value  =  1;
    n.midGainR.gain.value  =  1;
    n.sideGainL.gain.value =  w;
    n.sideGainR.gain.value = -w;

    n.widthSplitter.connect(n.midGainL, 0);
    n.widthSplitter.connect(n.midGainR, 1);
    n.widthSplitter.connect(n.sideGainL, 0);
    n.widthSplitter.connect(n.sideGainR, 1);

    n.midGainL.connect(n.widthMerger, 0, 0);
    n.midGainR.connect(n.widthMerger, 0, 1);
    n.sideGainL.connect(n.widthMerger, 0, 0);
    n.sideGainR.connect(n.widthMerger, 0, 1);

    n.widthMerger.connect(n.master);
    n.master.connect(n.analyser);
    n.analyser.connect(ctx.destination);

    nodesRef.current = n;
  }, [vocalMode, eqGains, compThreshold, compRatio, compAttack, compRelease, reverbWet, stereoWidth, volume, isMuted]);

  // ── Rebuild graph when key settings change ─────────────────────────────────
  useEffect(() => {
    if (ctxRef.current) buildGraph();
  }, [vocalMode, reverbWet, stereoWidth, buildGraph]);

  // ── Live-update EQ gains without rebuild ──────────────────────────────────
  useEffect(() => {
    const n = nodesRef.current;
    if (!n.eq) return;
    n.eq.forEach((f, i) => { f.gain.value = eqGains[i]; });
  }, [eqGains]);

  // ── Live-update compressor ─────────────────────────────────────────────────
  useEffect(() => {
    const c = nodesRef.current.comp;
    if (!c) return;
    c.threshold.value = compThreshold;
    c.ratio.value     = compRatio;
    c.attack.value    = compAttack;
    c.release.value   = compRelease;
  }, [compThreshold, compRatio, compAttack, compRelease]);

  // ── Live-update volume ─────────────────────────────────────────────────────
  useEffect(() => {
    const m = nodesRef.current.master;
    if (m) m.gain.value = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // ── Visualizer loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const draw = () => {
      const analyser = nodesRef.current.analyser;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        setVizData(new Uint8Array(data));
      }
      vizRafRef.current = requestAnimationFrame(draw);
    };
    vizRafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(vizRafRef.current);
  }, []);

  // Canvas draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const W = canvas.width, H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);

    const bars = vizData.length;
    const bw   = W / bars;
    for (let i = 0; i < bars; i++) {
      const h   = (vizData[i] / 255) * H;
      const hue = 120 + (i / bars) * 120;
      const grd = ctx2d.createLinearGradient(0, H - h, 0, H);
      grd.addColorStop(0, `hsla(${hue},100%,60%,0.9)`);
      grd.addColorStop(1, `hsla(${hue},80%,30%,0.4)`);
      ctx2d.fillStyle = grd;
      ctx2d.fillRect(i * bw + 1, H - h, bw - 2, h);
    }
  }, [vizData]);

  // ── Playback control ───────────────────────────────────────────────────────
  const ensureAudioContext = () => {
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctxRef.current = new AudioCtx();
      buildGraph();
    } else if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
  };

  const handlePlay = () => {
    ensureAudioContext();
    audioRef.current?.play().catch(e => {
      console.warn('Play failed', e);
      setIsPlaying(false);
    });
    setIsPlaying(true);
  };

  const handlePause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const handleStop = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleTrackEnd = () => {
    if (repeat === 'one') {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else if (repeat === 'all' || shuffle) {
      handleNext();
    } else if (trackIndex < library.length - 1) {
      handleNext();
    } else {
      setIsPlaying(false);
    }
  };

  const handleNext = () => {
    if (!library.length) return;
    let next;
    if (shuffle) {
      next = Math.floor(Math.random() * library.length);
    } else {
      next = (trackIndex + 1) % library.length;
    }
    setTrackIndex(next);
    setCurrentTrack(library[next]);
    setTimeout(() => { if (isPlaying) handlePlay(); }, 100);
  };

  const handlePrev = () => {
    if (!library.length) return;
    if (currentTime > 3) { audioRef.current.currentTime = 0; return; }
    const prev = trackIndex === 0 ? library.length - 1 : trackIndex - 1;
    setTrackIndex(prev);
    setCurrentTrack(library[prev]);
    setTimeout(() => { if (isPlaying) handlePlay(); }, 100);
  };

  const handleSeek = (e) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const applyPreset = (name) => {
    setActivePreset(name);
    setEqGains([...EQ_PRESETS[name]]);
  };

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const filtered = library.filter(t =>
    !searchQuery ||
    t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.artist?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const track = currentTrack;

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
        <div className="studio-title">
          <FiActivity /> WiseRaven Music Studio
        </div>
        <div className="studio-track-info">
          {track ? (
            <>
              <span className="ti-title">{track.title}</span>
              <span className="ti-sep">·</span>
              <span className="ti-artist">{track.artist || 'Unknown Artist'}</span>
              {vocalMode === 'instrumental' && <span className="mode-badge instrumental">INSTRUMENTAL</span>}
              {vocalMode === 'karaoke'      && <span className="mode-badge karaoke">KARAOKE</span>}
            </>
          ) : (
            <span className="ti-empty">No track loaded — upload tracks in the Music Rights Studio</span>
          )}
        </div>
      </div>

      {/* ── Visualizer ── */}
      <div className="studio-visualizer">
        <canvas ref={canvasRef} width={900} height={120} />
      </div>

      {/* ── Transport ── */}
      <div className="studio-transport">
        <div className="transport-left">
          <button
            className={`tx-btn ${shuffle ? 'active' : ''}`}
            onClick={() => setShuffle(!shuffle)}
            title="Shuffle"
          ><FiShuffle /></button>
          <button
            className={`tx-btn ${repeat !== 'off' ? 'active' : ''}`}
            onClick={() => setRepeat(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
            title={`Repeat: ${repeat}`}
          >
            <FiRepeat />
            {repeat === 'one' && <span className="repeat-badge">1</span>}
          </button>
        </div>

        <div className="transport-main">
          <button className="tx-btn" onClick={handlePrev} title="Previous"><FiSkipBack /></button>
          {isPlaying
            ? <button className="tx-btn play-pause" onClick={handlePause}><FiPause /></button>
            : <button className="tx-btn play-pause" onClick={handlePlay}  disabled={!track}><FiPlay /></button>
          }
          <button className="tx-btn" onClick={handleStop} title="Stop"><FiSquare /></button>
          <button className="tx-btn" onClick={handleNext} title="Next"><FiSkipForward /></button>
        </div>

        <div className="transport-right">
          <button className="tx-btn" onClick={() => setIsMuted(!isMuted)} title="Mute">
            {isMuted ? <FiVolumeX /> : <FiVolume2 />}
          </button>
          <input
            type="range" min="0" max="1" step="0.01"
            value={isMuted ? 0 : volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="vol-slider"
          />
          <span className="vol-pct">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* ── Progress ── */}
      <div className="studio-progress">
        <span className="time-label">{fmt(currentTime)}</span>
        <input
          type="range" min="0" max={duration || 0} step="0.1"
          value={currentTime}
          onChange={handleSeek}
          className="seek-slider"
          disabled={!track}
        />
        <span className="time-label">{fmt(duration)}</span>
      </div>

      {/* ── Main Studio Area ── */}
      <div className="studio-main">

        {/* ── Control Panels ── */}
        <div className="studio-panels">
          <div className="panel-tabs">
            <button className={activePanel === 'eq'     ? 'active' : ''} onClick={() => setActivePanel('eq')}><FiSliders /> Equalizer</button>
            <button className={activePanel === 'effects'? 'active' : ''} onClick={() => setActivePanel('effects')}><FiRadio /> Effects</button>
            <button className={activePanel === 'vocal'  ? 'active' : ''} onClick={() => setActivePanel('vocal')}><FiMic /> Vocal</button>
          </div>

          {/* EQ Panel */}
          {activePanel === 'eq' && (
            <div className="panel eq-panel">
              <div className="preset-row">
                {Object.keys(EQ_PRESETS).map(p => (
                  <button
                    key={p}
                    className={`preset-btn ${activePreset === p ? 'active' : ''}`}
                    onClick={() => applyPreset(p)}
                  >{p}</button>
                ))}
              </div>
              <div className="eq-bands">
                {EQ_BANDS.map((band, i) => (
                  <div key={band.freq} className="eq-band">
                    <span className="eq-val">{eqGains[i] > 0 ? '+' : ''}{eqGains[i]}</span>
                    <input
                      type="range" min="-12" max="12" step="0.5"
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

          {/* Effects Panel */}
          {activePanel === 'effects' && (
            <div className="panel effects-panel">
              <div className="fx-group">
                <label>Reverb <span className="fx-val">{Math.round(reverbWet * 100)}%</span></label>
                <input type="range" min="0" max="1" step="0.01"
                  value={reverbWet}
                  onChange={e => setReverbWet(parseFloat(e.target.value))}
                  className="fx-slider" />
              </div>

              <div className="fx-group">
                <label>Stereo Width <span className="fx-val">{Math.round(stereoWidth * 100)}%</span></label>
                <input type="range" min="0" max="2" step="0.01"
                  value={stereoWidth}
                  onChange={e => setStereoWidth(parseFloat(e.target.value))}
                  className="fx-slider" />
              </div>

              <div className="fx-section-title">Compressor</div>
              <div className="fx-group">
                <label>Threshold <span className="fx-val">{compThreshold}dB</span></label>
                <input type="range" min="-60" max="0" step="1"
                  value={compThreshold}
                  onChange={e => setCompThreshold(parseFloat(e.target.value))}
                  className="fx-slider" />
              </div>
              <div className="fx-group">
                <label>Ratio <span className="fx-val">{compRatio}:1</span></label>
                <input type="range" min="1" max="20" step="0.5"
                  value={compRatio}
                  onChange={e => setCompRatio(parseFloat(e.target.value))}
                  className="fx-slider" />
              </div>
              <div className="fx-row">
                <div className="fx-group half">
                  <label>Attack <span className="fx-val">{Math.round(compAttack * 1000)}ms</span></label>
                  <input type="range" min="0" max="0.2" step="0.001"
                    value={compAttack}
                    onChange={e => setCompAttack(parseFloat(e.target.value))}
                    className="fx-slider" />
                </div>
                <div className="fx-group half">
                  <label>Release <span className="fx-val">{Math.round(compRelease * 1000)}ms</span></label>
                  <input type="range" min="0" max="1" step="0.01"
                    value={compRelease}
                    onChange={e => setCompRelease(parseFloat(e.target.value))}
                    className="fx-slider" />
                </div>
              </div>
            </div>
          )}

          {/* Vocal Panel */}
          {activePanel === 'vocal' && (
            <div className="panel vocal-panel">
              <p className="vocal-desc">
                Vocal processor uses mid-side audio separation to isolate or remove center-panned vocals.
                Works best on tracks where vocals are mixed to center.
              </p>
              <div className="vocal-modes">
                {[
                  { id: 'normal',       icon: <FiMic />,    label: 'Normal',       sub: 'Full mix, vocals included' },
                  { id: 'instrumental', icon: <FiMicOff />, label: 'Instrumental', sub: 'Vocal removal — center channel subtracted' },
                  { id: 'karaoke',      icon: <FiMusic />,  label: 'Karaoke',      sub: 'Vocal removal with karaoke display' },
                ].map(m => (
                  <button
                    key={m.id}
                    className={`vocal-mode-btn ${vocalMode === m.id ? 'active' : ''}`}
                    onClick={() => setVocalMode(m.id)}
                  >
                    <span className="vm-icon">{m.icon}</span>
                    <span className="vm-label">{m.label}</span>
                    <span className="vm-sub">{m.sub}</span>
                  </button>
                ))}
              </div>

              {vocalMode === 'karaoke' && (
                <div className="karaoke-display">
                  <div className="karaoke-lyrics">
                    <FiMic />
                    <p>Karaoke mode active — vocals removed from playback</p>
                    <p className="karaoke-hint">Sync lyrics via the Music Rights Studio to display them here</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Track Library ── */}
        <div className="studio-library">
          <div className="lib-header">
            <FiList /> Library ({library.length})
            <div className="lib-search">
              <FiSearch />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && <button onClick={() => setSearchQuery('')}><FiX /></button>}
            </div>
          </div>

          {library.length === 0 ? (
            <div className="lib-empty">
              <FiMusic size={32} />
              <p>No tracks in library</p>
              <button onClick={() => onNavigate?.('music-rights-studio')}>
                Upload in Music Rights Studio
              </button>
            </div>
          ) : (
            <div className="lib-tracks">
              {filtered.map((t, i) => (
                <div
                  key={t.id}
                  className={`lib-track ${currentTrack?.id === t.id ? 'active' : ''}`}
                  onClick={() => { setCurrentTrack(t); setTrackIndex(library.indexOf(t)); }}
                >
                  <div className="lt-num">
                    {currentTrack?.id === t.id && isPlaying
                      ? <span className="playing-dot" />
                      : <span className="track-num">{library.indexOf(t) + 1}</span>
                    }
                  </div>
                  <div className="lt-info">
                    <span className="lt-title">{t.title || 'Untitled'}</span>
                    <span className="lt-artist">{t.artist || 'Unknown'}</span>
                  </div>
                  <div className="lt-dur">{t.duration || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MusicStudioPage;
