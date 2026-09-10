import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import FMTunerModule from '../Components/FM/FMTunerModule';
import '../Styles/FMRadioPage.css';

const FM_LOW  = 88.0;
const FM_HIGH = 108.0;

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

const acceptedAudio = 'audio/*,.mp3,.mp4,.wav,.flac,.ogg,.aac,.m4a,.wma,.opus';
const acceptedMedia = 'image/*,video/*';

// ── Sources the existing FMPlayer uses are wired through the FM module.
// This page adds the retro cabinet shell, the cassette deck (local files),
// and the media-captioning tab on top.

const FMRadioPage = () => {
  // ── tab: 'radio' | 'cassette' | 'caption'
  const [tab, setTab] = useState('radio');

  // ── Tuner display state (visual only; actual playback is inside FMTunerModule)
  const [tunedFreq, setTunedFreq]     = useState(98.5);
  const [stationName, setStationName] = useState('WISERAVENSHARE FM');
  const [isRadioPlaying, setIsRadioPlaying] = useState(false);

  // ── VU meter
  const [vuAngle, setVuAngle] = useState(-45);

  // ── Cassette deck state
  const audioRef      = useRef(null);
  const uploadRef     = useRef(null);
  const [library, setLibrary]               = useState([]);
  const [currentTrack, setCurrentTrack]     = useState(null);
  const [isPlaying, setIsPlaying]           = useState(false);
  const [currentTime, setCurrentTime]       = useState(0);
  const [duration, setDuration]             = useState(0);
  const [volume, setVolume]                 = useState(0.85);
  const [isMuted, setIsMuted]               = useState(false);
  const [trackIndex, setTrackIndex]         = useState(0);

  // ── Caption tab state
  const captionAudioRef  = useRef(null);
  const captionMediaRef  = useRef(null);
  const [captionTrack, setCaptionTrack]     = useState(null);
  const [captionMediaFile, setCaptionMediaFile] = useState(null);
  const [captionMediaUrl, setCaptionMediaUrl]   = useState('');
  const [captionMediaType, setCaptionMediaType] = useState('');
  const [captionPlaying, setCaptionPlaying]     = useState(false);

  // ── VU meter tick
  const vuInterval = useRef(null);
  const anyPlaying = isPlaying || isRadioPlaying || captionPlaying;

  useEffect(() => {
    if (anyPlaying) {
      vuInterval.current = setInterval(() => {
        setVuAngle(-45 + Math.random() * 90);
      }, 160);
    } else {
      clearInterval(vuInterval.current);
      setVuAngle(-45);
    }
    return () => clearInterval(vuInterval.current);
  }, [anyPlaying]);

  // ── Audio element events
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onMeta  = () => setDuration(el.duration || 0);
    const onTime  = () => setCurrentTime(el.currentTime || 0);
    const onEnded = () => {
      if (library.length > 1) {
        const next = (trackIndex + 1) % library.length;
        selectTrack(library[next], next);
      } else {
        setIsPlaying(false);
      }
    };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate',     onTime);
    el.addEventListener('ended',          onEnded);
    el.addEventListener('play',           onPlay);
    el.addEventListener('pause',          onPause);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate',     onTime);
      el.removeEventListener('ended',          onEnded);
      el.removeEventListener('play',           onPlay);
      el.removeEventListener('pause',          onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, trackIndex]);

  // ── Volume / mute
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
    audioRef.current.muted  = isMuted;
  }, [volume, isMuted]);

  // ── Load track
  const selectTrack = useCallback((track, idx) => {
    const el = audioRef.current;
    if (!el || !track) return;
    setCurrentTrack(track);
    setTrackIndex(idx);
    setCurrentTime(0);
    setDuration(0);
    el.pause();
    el.src = URL.createObjectURL(track.file);
    el.load();
    el.play().catch(() => {});
  }, []);

  // ── Transport
  const play = () => {
    if (!currentTrack || !audioRef.current) return;
    audioRef.current.play().catch(() => {});
  };
  const pause = () => {
    audioRef.current?.pause();
  };
  const stop = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  };
  const rewind = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  };
  const fastForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10);
  };
  const skipPrev = () => {
    if (!library.length) return;
    if (currentTime > 3 && audioRef.current) {
      audioRef.current.currentTime = 0;
      return;
    }
    const prev = trackIndex === 0 ? library.length - 1 : trackIndex - 1;
    selectTrack(library[prev], prev);
  };
  const skipNext = () => {
    if (!library.length) return;
    const next = (trackIndex + 1) % library.length;
    selectTrack(library[next], next);
  };

  // ── Upload
  const handleUpload = (e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('audio/') || /\.(mp3|mp4|wav|flac|ogg|aac|m4a|wma|opus)$/i.test(f.name),
    );
    if (!files.length) return;
    const newTracks = files.map((f) => ({ id: `${f.name}-${f.lastModified}`, name: f.name, file: f }));
    setLibrary((prev) => {
      const updated = [...prev, ...newTracks];
      if (!currentTrack) {
        selectTrack(updated[0], 0);
      }
      return updated;
    });
    e.target.value = '';
  };

  // ── Seek
  const handleSeek = (e) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  // ── Caption tab
  const handleCaptionMediaPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (captionMediaUrl) URL.revokeObjectURL(captionMediaUrl);
    const url = URL.createObjectURL(file);
    setCaptionMediaFile(file);
    setCaptionMediaUrl(url);
    setCaptionMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    e.target.value = '';
  };

  const handleCaptionPlay = () => {
    if (!captionTrack || !captionAudioRef.current) return;
    if (!captionAudioRef.current.src) {
      captionAudioRef.current.src = URL.createObjectURL(captionTrack.file);
    }
    captionAudioRef.current.play().catch(() => {});
    setCaptionPlaying(true);
    if (captionMediaType === 'video' && captionMediaRef.current) {
      captionMediaRef.current.play().catch(() => {});
    }
  };
  const handleCaptionStop = () => {
    captionAudioRef.current?.pause();
    captionMediaRef.current?.pause();
    setCaptionPlaying(false);
  };

  // ── Frequency display needle position
  const needlePct = `${((tunedFreq - FM_LOW) / (FM_HIGH - FM_LOW)) * 100}%`;

  const activeName = currentTrack?.name || 'NO TAPE INSERTED';

  return (
    <div className="wr-shell">
      {/* Hidden audio element for cassette deck */}
      <audio ref={audioRef} preload="auto" />

      <div className="wr-cabinet">

        {/* Brand plate */}
        <div className="wr-brand">
          <h1>WISERAVENSHARE</h1>
          <div className="wr-model">MODEL WR-77  ·  FM STEREO / CASSETTE DECK  ·  HI-FI</div>
        </div>

        {/* Speaker grille */}
        <div className="wr-grille" />

        {/* VU meter — always visible */}
        <div className="wr-vu">
          <div className="wr-vu-label">VU</div>
          <div className="wr-vu-arc" />
          <div className="wr-vu-needle" style={{ transform: `translateX(-50%) rotate(${vuAngle}deg)` }} />
          <div className="wr-vu-pivot" />
        </div>

        {/* Tuner display — always shows current freq / station */}
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
          <div className="wr-station-ticker">{stationName}</div>
        </div>

        {/* Analog dial (decorative + tuneable) */}
        <div className="wr-dial-assembly">
          <div className="wr-dial-scale">
            <div className="wr-dial-ticks" />
            <div className="wr-dial-numbers">
              {[88, 92, 96, 100, 104, 108].map((n) => <span key={n}>{n}</span>)}
            </div>
            <div className="wr-dial-needle" style={{ left: needlePct }} />
            <input
              type="range"
              className="wr-dial-range"
              min={FM_LOW}
              max={FM_HIGH}
              step={0.1}
              value={tunedFreq}
              onChange={(e) => setTunedFreq(parseFloat(e.target.value))}
            />
          </div>
        </div>

        {/* Source selector */}
        <div className="wr-source-tabs">
          <button className={`wr-source-btn${tab === 'radio'    ? ' active' : ''}`} onClick={() => setTab('radio')}>📻 FM RADIO</button>
          <button className={`wr-source-btn${tab === 'cassette' ? ' active' : ''}`} onClick={() => setTab('cassette')}>📼 CASSETTE</button>
          <button className={`wr-source-btn${tab === 'caption'  ? ' active' : ''}`} onClick={() => setTab('caption')}>🎬 CAPTION</button>
        </div>

        {/* ─── FM RADIO TAB ─── */}
        {tab === 'radio' && (
          <div className="wr-fm-section">
            <FMTunerModule />
          </div>
        )}

        {/* ─── CASSETTE DECK TAB ─── */}
        {tab === 'cassette' && (
          <div className="wr-cassette-deck">
            <div className="wr-deck-label">◄◄ CASSETTE DECK  ·  DOLBY NR  ·  MP3 / WAV / FLAC / M4A  ►►</div>

            {/* Cassette door with spinning reels */}
            <div className="wr-cassette-door">
              <div className="wr-tape-visual">
                <div className={`wr-reel left${isPlaying ? ' spinning' : ''}`} />
                <div className="wr-tape-ribbon" />
                <div className={`wr-reel right${isPlaying ? ' spinning' : ''}`} />
              </div>
              <div className="wr-cassette-label">{activeName}</div>
            </div>

            {/* Seek */}
            <div className="wr-seek-row">
              <span className="wr-time">{fmt(currentTime)}</span>
              <input
                type="range"
                className="wr-seek"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                disabled={!currentTrack}
              />
              <span className="wr-time">{fmt(duration)}</span>
            </div>

            {/* Transport */}
            <div className="wr-transport">
              <button className="wr-key" title="Skip prev" onClick={skipPrev} disabled={!library.length}>⏮</button>
              <button className="wr-key" title="Rewind 10s" onClick={rewind} disabled={!currentTrack}>◀◀</button>
              <button className={`wr-key${isPlaying ? ' active' : ''}`} title="Play" onClick={play} disabled={!currentTrack}>▶</button>
              <button className="wr-key" title="Pause" onClick={pause} disabled={!isPlaying}>❚❚</button>
              <button className="wr-key" title="Stop" onClick={stop} disabled={!currentTrack}>■</button>
              <button className="wr-key" title="FF 10s" onClick={fastForward} disabled={!currentTrack}>▶▶</button>
              <button className="wr-key" title="Skip next" onClick={skipNext} disabled={!library.length}>⏭</button>
            </div>

            {/* Volume */}
            <div className="wr-vol-row">
              <span className="wr-vol-label">VOL</span>
              <button
                className="wr-key"
                style={{ width: 36, height: 30, fontSize: '.7rem', marginRight: 4 }}
                onClick={() => setIsMuted((m) => !m)}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
              <input
                type="range"
                className="wr-vol"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
              />
              <span className="wr-vol-pct">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
            </div>

            {/* Upload */}
            <input type="file" ref={uploadRef} accept={acceptedAudio} multiple style={{ display: 'none' }} onChange={handleUpload} />
            <button className="wr-insert-tape" onClick={() => uploadRef.current?.click()}>
              ⏏ INSERT CASSETTE — Load mp3 · mp4 · flac · wav · m4a
            </button>

            {/* Playlist */}
            {library.length > 0 && (
              <>
                <div className="wr-tape-rack-label">▸ TAPE RACK ({library.length})</div>
                <div className="wr-tape-rack">
                  {library.map((t, i) => (
                    <button
                      key={t.id}
                      className={`wr-tape-item${currentTrack?.id === t.id ? ' active' : ''}`}
                      onClick={() => selectTrack(t, i)}
                    >
                      <span>📼</span>
                      <span className="wr-tape-name">{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── MEDIA CAPTION TAB ─── */}
        {tab === 'caption' && (
          <div className="wr-cassette-deck">
            <div className="wr-deck-label">▸ CAPTION PHOTOS & VIDEOS WITH MUSIC</div>

            <audio ref={captionAudioRef} preload="none" />

            <div className="wr-caption-panel">
              <div className="wr-caption-label">▸ 1. SELECT MUSIC TRACK FROM CASSETTE LIBRARY</div>
              {library.length === 0 ? (
                <div className="wr-loading">▸ Load tracks in the Cassette tab first</div>
              ) : (
                <div className="wr-tape-rack" style={{ marginBottom: 12 }}>
                  {library.map((t) => (
                    <button
                      key={t.id}
                      className={`wr-tape-item${captionTrack?.id === t.id ? ' active' : ''}`}
                      onClick={() => {
                        setCaptionTrack(t);
                        if (captionAudioRef.current) {
                          captionAudioRef.current.src = '';
                        }
                        setCaptionPlaying(false);
                      }}
                    >
                      <span>📼</span>
                      <span className="wr-tape-name">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="wr-caption-label">▸ 2. SELECT PHOTO OR VIDEO</div>
              <div className="wr-caption-grid">
                <label className={`wr-caption-slot${captionMediaFile ? ' filled' : ''}`}>
                  {captionMediaFile ? `✓ ${captionMediaFile.name}` : '📁 Pick photo or video'}
                  <input type="file" accept={acceptedMedia} style={{ display: 'none' }} onChange={handleCaptionMediaPick} />
                </label>
                <div className="wr-caption-slot" style={{ cursor: 'default' }}>
                  <div style={{ fontSize: '.85rem', marginBottom: 6 }}>🎵 Track</div>
                  <div style={{ fontSize: '.72rem', opacity: .7 }}>{captionTrack ? captionTrack.name : 'None selected'}</div>
                </div>
              </div>

              {/* Preview */}
              <div className="wr-caption-preview">
                {captionMediaUrl && captionMediaType === 'image' && (
                  <img src={captionMediaUrl} alt="caption preview" />
                )}
                {captionMediaUrl && captionMediaType === 'video' && (
                  <video ref={captionMediaRef} src={captionMediaUrl} controls style={{ maxWidth: '100%' }} />
                )}
                {!captionMediaUrl && <span>▸ Preview will appear here</span>}
              </div>

              {captionTrack && (
                <div className="wr-caption-track-info">
                  🎵 {captionTrack.name}
                </div>
              )}

              {/* Caption playback controls */}
              <div className="wr-transport">
                <button
                  className={`wr-key${captionPlaying ? ' active' : ''}`}
                  onClick={handleCaptionPlay}
                  disabled={!captionTrack}
                >▶ PLAY</button>
                <button
                  className="wr-key"
                  onClick={handleCaptionStop}
                  disabled={!captionPlaying}
                >■ STOP</button>
              </div>

              <div className="wr-loading" style={{ animation: 'none', opacity: .55, marginTop: 8, fontSize: '.65rem' }}>
                TIP: Select a track + media then press PLAY to preview your caption. Video plays with music simultaneously.
              </div>
            </div>
          </div>
        )}

        {/* Status strip */}
        <div className="wr-status">
          <span>
            <span className={`wr-status-dot${anyPlaying ? ' live' : ''}`} />
            {anyPlaying ? 'PLAYING' : 'STANDBY'}
          </span>
          <span>{tab === 'radio' ? 'FM STEREO' : tab === 'cassette' ? 'TAPE DECK' : 'CAPTION'}</span>
          <span>WR-77</span>
        </div>
      </div>
    </div>
  );
};

export default FMRadioPage;
