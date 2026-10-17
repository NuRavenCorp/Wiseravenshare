/**
 * RadioPlayer.jsx — FM Radio + Track Deck with full codec support via Howler.js
 *   MP3, MP4 (audio/video), FLAC, WAV, OGG, AAC, M4A, OPUS, WMA
 *
 * Features:
 *  - Howler.js for cross-browser codec detection + fallback
 *  - 10-band Web Audio EQ wired through Howler's AudioContext
 *  - Real-time spectrum analyser canvas
 *  - Shuffle / Repeat (off | all | one)
 *  - Queue management (add / remove / reorder / clear)
 *  - Favorites persisted to localStorage
 *  - Volume + mute, seek
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Howl, Howler } from "howler";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Loader2, Volume2, VolumeX, Shuffle, Repeat, Repeat1, SkipBack } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import CassetteDeck from "./CassetteDeck";
import SpectrumAnalyser from "./SpectrumAnalyser";
import RadioEqualizer from "./RadioEqualizer";
import TrackQueue from "./TrackQueue";
import MediaUpload from "./MediaUpload";

const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const FAV_KEY = "radio_favorites";

const formatTime = (s) => {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export default function RadioPlayer() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off");
  const [queue, setQueue] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [eqGains, setEqGains] = useState(new Array(10).fill(0));
  const [showEQ, setShowEQ] = useState(false);
  const [showSpectrum, setShowSpectrum] = useState(true);
  const [analyserNode, setAnalyserNode] = useState(null);

  const howlRef = useRef(null);
  const { toast } = useToast();
  const eqFiltersRef = useRef([]);
  const audioChainReady = useRef(false);
  const progressRaf = useRef(null);
  const endedRef = useRef(() => {});

  // Load tracks and keep the radio queue in sync with the shared music library.
  const loadTracks = useCallback(async (selectNewest = false) => {
    try {
      const res = await apiClient.ravensightMedia.listMusic();
      const items = (res || []).map((track) => ({
          ...track,
          id: track.id,
          title: track.title || track.fileName || "Untitled track",
          file_uri: track.mediaUrl || track.media_url || track.file_uri || track.relativePath || "",
        }));
      setTracks(items);
      setQueue((previous) => {
        const retained = previous.filter((id) => items.some((track) => track.id === id));
        const added = items.map((track) => track.id).filter((id) => !retained.includes(id));
        return selectNewest ? items.map((track) => track.id) : [...retained, ...added];
      });
      if (selectNewest && items[0]) {
        if (howlRef.current) howlRef.current.unload();
        setCurrentId(items[0].id);
      }
    } catch (error) {
      toast({ title: "Could not load music", description: error?.message || "Try refreshing the library.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAV_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Setup 10-band EQ + analyser through Howler's AudioContext
  const setupAudioChain = useCallback(() => {
    if (audioChainReady.current) return;
    const ctx = Howler.ctx;
    const masterGain = Howler.masterGain;
    if (!ctx || !masterGain) return;

    const filters = EQ_FREQUENCIES.map((freq) => {
      const f = ctx.createBiquadFilter();
      f.type = "peaking";
      f.frequency.value = freq;
      f.Q.value = 1.4;
      f.gain.value = 0;
      return f;
    });

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    masterGain.disconnect();
    let node = masterGain;
    filters.forEach((f) => { node.connect(f); node = f; });
    node.connect(analyser);
    analyser.connect(ctx.destination);

    eqFiltersRef.current = filters;
    setAnalyserNode(analyser);
    audioChainReady.current = true;
  }, []);

  const current = tracks.find((t) => t.id === currentId);

  // --- Transport handlers ---
  const handleNext = () => {
    if (queue.length === 0) return;
    const idx = queue.indexOf(currentId);
    let nextIdx;
    if (shuffle) {
      do { nextIdx = Math.floor(Math.random() * queue.length); }
      while (nextIdx === idx && queue.length > 1);
    } else {
      nextIdx = idx + 1;
      if (nextIdx >= queue.length) {
        if (repeat === "off") {
          if (howlRef.current) howlRef.current.stop();
          setPlaying(false);
          return;
        }
        nextIdx = 0;
      }
    }
    setCurrentId(queue[nextIdx]);
  };

  const handlePrev = () => {
    if (queue.length === 0) return;
    if (howlRef.current && howlRef.current.seek() > 3) { howlRef.current.seek(0); return; }
    const idx = queue.indexOf(currentId);
    setCurrentId(queue[idx <= 0 ? queue.length - 1 : idx - 1]);
  };

  const handleEnded = () => {
    if (repeat === "one") {
      if (howlRef.current) { howlRef.current.seek(0); howlRef.current.play(); }
      return;
    }
    handleNext();
  };
  endedRef.current = handleEnded;

  const handlePlayPause = () => {
    if (!howlRef.current) {
      if (queue.length > 0 && !currentId) setCurrentId(queue[0]);
      return;
    }
    if (Howler.ctx?.state === "suspended") Howler.ctx.resume();
    if (playing) howlRef.current.pause();
    else howlRef.current.play();
  };

  const trackProgress = () => {
    if (progressRaf.current) cancelAnimationFrame(progressRaf.current);
    const tick = () => {
      if (howlRef.current) setProgress(howlRef.current.seek());
      progressRaf.current = requestAnimationFrame(tick);
    };
    tick();
  };

  // Load + play track when currentId changes
  useEffect(() => {
    if (!current) return;
    let cancelled = false;

    // Unload previous track immediately to prevent double audio during async URL fetch
    if (howlRef.current) { howlRef.current.unload(); howlRef.current = null; }
    if (progressRaf.current) cancelAnimationFrame(progressRaf.current);
    setProgress(0);
    setDuration(0);
    setPlaying(false);

    if (Howler.ctx?.state === "suspended") Howler.ctx.resume();

    let retried = false;
    const loadTrack = (url) => {
      if (cancelled || !url) {
        if (!cancelled) {
          toast({ title: "Track unavailable", description: current?.title || "Could not get a playback URL.", variant: "destructive" });
          setPlaying(false);
        }
        return;
      }

      // Use HTML5 Audio for cross-origin DO Spaces URLs (no CORS = Web Audio can't fetch).
      // This CDN source has CORS enabled, so Web Audio + EQ/analyser work there.
      let isCrossOrigin = false;
      try { isCrossOrigin = !url.includes('media.apiClient.com') && new URL(url).origin !== window.location.origin; } catch { isCrossOrigin = true; }
      const sound = new Howl({ src: [url], volume: muted ? 0 : volume, html5: isCrossOrigin });
      if (!isCrossOrigin) setupAudioChain();

      sound.on("load", () => !cancelled && setDuration(sound.duration()));
      sound.on("play", () => { if (!cancelled) { setPlaying(true); trackProgress(); } });
      sound.on("pause", () => !cancelled && setPlaying(false));
      sound.on("end", () => !cancelled && endedRef.current());
      sound.on("stop", () => !cancelled && setPlaying(false));
      sound.on("loaderror", async () => {
        if (cancelled) return;
        // Signed URLs expire — try refreshing once before giving up
        if (!retried) {
          retried = true;
          sound.unload();
          try {
            const fresh = await getPlayableUrl(current.file_uri);
            if (!cancelled && fresh) { loadTrack(fresh); return; }
          } catch { /* fall through to error */ }
        }
        setPlaying(false);
        toast({ title: "Track failed to load", description: current?.title || "Audio could not be loaded.", variant: "destructive" });
      });

      howlRef.current = sound;
      sound.play();
    };

    getPlayableUrl(current.file_uri).then(loadTrack).catch(() => loadTrack(null));

    return () => {
      cancelled = true;
      if (progressRaf.current) cancelAnimationFrame(progressRaf.current);
    };
  }, [currentId]);

  // Seek
  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (howlRef.current) howlRef.current.seek(time);
    setProgress(time);
  };

  // Volume
  useEffect(() => {
    if (howlRef.current) howlRef.current.volume(muted ? 0 : volume);
  }, [volume, muted]);

  // EQ gain changes
  const handleEqChange = (newGains) => {
    setEqGains(newGains);
    eqFiltersRef.current.forEach((f, i) => { if (f) f.gain.value = newGains[i] || 0; });
  };

  // Favorites (localStorage)
  const toggleFavorite = (trackId) => {
    setFavorites((prev) => {
      const next = prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Queue management
  const removeFromQueue = (trackId) => {
    setQueue((prev) => prev.filter((id) => id !== trackId));
    if (trackId === currentId) { if (howlRef.current) howlRef.current.stop(); setPlaying(false); }
  };
  const reorderQueue = (index, dir) => {
    setQueue((prev) => {
      const next = [...prev];
      const swap = index + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  };
  const clearQueue = () => {
    setQueue([]);
    if (howlRef.current) howlRef.current.stop();
    setPlaying(false);
    setCurrentId(null);
  };
  const resetQueue = () => setQueue(tracks.map((t) => t.id));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (howlRef.current) howlRef.current.unload();
      if (progressRaf.current) cancelAnimationFrame(progressRaf.current);
    };
  }, []);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  const queueTracks = queue.map((id) => tracks.find((t) => t.id === id)).filter(Boolean);
  const displayTracks = showFavOnly ? queueTracks.filter((t) => favorites.includes(t.id)) : queueTracks;
  const currentQueueIdx = queue.indexOf(currentId);

  const bands = [
    { id: "eq", label: "EQ", active: showEQ },
    { id: "fx", label: "FX", active: showSpectrum },
    { id: "fav", label: "★", active: showFavOnly },
  ];
  const handleBandToggle = (id) => {
    if (id === "eq") setShowEQ(!showEQ);
    else if (id === "fx") setShowSpectrum(!showSpectrum);
    else if (id === "fav") setShowFavOnly(!showFavOnly);
  };
  const handleQueuePlay = (id) => { if (id === currentId) handlePlayPause(); else setCurrentId(id); };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <MediaUpload type="music" label="Upload track to radio library" onUploaded={() => loadTracks(true)} />
      <CassetteDeck
        playing={playing}
        trackTitle={current?.title || "No tracks available"}
        status={playing ? "On Air" : tracks.length > 0 ? "Press play to tune in" : "Upload music to start broadcasting"}
        trackCounter={`Track ${currentQueueIdx >= 0 ? currentQueueIdx + 1 : 0} of ${queue.length}`}
        onPlayPause={handlePlayPause}
        onSkip={handleNext}
        bands={bands}
        onBandToggle={handleBandToggle}
      />

      {/* Seek bar */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">{formatTime(progress)}</span>
        <input type="range" min={0} max={duration || 0} value={progress} onChange={handleSeek} disabled={!current} className="flex-1 accent-primary" />
        <span className="text-xs text-muted-foreground w-10 tabular-nums">{formatTime(duration)}</span>
      </div>

      {/* Secondary controls: prev, shuffle, repeat, volume */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1">
          <button onClick={handlePrev} disabled={queue.length === 0} className="p-2 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30">
            <SkipBack className="w-4 h-4" />
          </button>
          <button onClick={() => setShuffle(!shuffle)} className={`p-2 rounded-lg ${shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <Shuffle className="w-4 h-4" />
          </button>
          <button onClick={() => setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off")} className={`p-2 rounded-lg ${repeat !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMuted(!muted)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground">
            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="w-20 accent-primary" />
        </div>
      </div>

      {/* Spectrum analyser */}
      {showSpectrum && <SpectrumAnalyser analyserNode={analyserNode} playing={playing} />}

      {/* 10-band EQ */}
      {showEQ && <RadioEqualizer gains={eqGains} onChange={handleEqChange} />}

      {/* Queue */}
      <TrackQueue
        tracks={displayTracks}
        currentId={currentId}
        playing={playing}
        favorites={favorites}
        onPlay={handleQueuePlay}
        onToggleFav={toggleFavorite}
        onRemove={removeFromQueue}
        onReorder={reorderQueue}
        onClear={clearQueue}
        onReset={resetQueue}
      />
    </div>
  );
}
