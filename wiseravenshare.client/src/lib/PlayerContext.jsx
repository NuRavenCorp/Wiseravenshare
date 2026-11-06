import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";

const PlayerContext = createContext(null);

const normalizeTrack = (t) => {
  if (!t) return null;
  return {
    ...t,
    id: String(t?.id ?? t?.trackId ?? t?.TrackId ?? t?.assetId ?? ""),
    title: t?.title || t?.fileName || "Untitled",
    file_uri: t?.url || t?.file_uri || t?.mediaUrl || "",
  };
};

export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  const mountedRef = useRef(true);
  const pendingPlayRef = useRef(false);
  const blobUrlRef = useRef(null);

  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off"); // "off" | "all" | "one"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = muted;
    try { a.volume = volume; } catch { /* iOS restricts volume */ }
  }, [volume, muted]);

  const loadSrc = useCallback(async (track) => {
    if (!track) return;
    setLoading(true);
    setError("");
    try {
      if (track.id) {
        const blob = await apiClient.ravensightMedia.streamMusic(track.id);
        if (!mountedRef.current) return;
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = blobUrlRef.current;
          audioRef.current.load();
        }
      } else {
        const url = await getPlayableUrl(track.file_uri);
        if (!mountedRef.current) return;
        if (audioRef.current) {
          audioRef.current.src = url || "";
          audioRef.current.load();
        }
      }
      setLoading(false);
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        audioRef.current?.play().catch(() => {});
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setLoading(false);
      setError(err?.message || "Could not load track.");
    }
  }, []);

  const loadTrack = useCallback((track, newQueue, startPlay = true) => {
    const norm = normalizeTrack(track);
    if (!norm) return;
    const normQueue = Array.isArray(newQueue) && newQueue.length > 0
      ? newQueue.map(normalizeTrack).filter(Boolean)
      : [norm];
    const idx = normQueue.findIndex((t) => t.id && t.id === norm.id);
    setQueue(normQueue);
    setQueueIdx(idx >= 0 ? idx : 0);
    setCurrentTrack(norm);
    setProgress(0);
    setDuration(0);
    pendingPlayRef.current = startPlay;
    loadSrc(norm);
  }, [loadSrc]);

  const playPause = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) a.pause();
    else a.play().catch(() => {});
  }, [isPlaying]);

  const goToIdx = useCallback((idx, autoPlay = true) => {
    if (queue.length === 0) return;
    const i = Math.max(0, Math.min(idx, queue.length - 1));
    const track = queue[i];
    setQueueIdx(i);
    setCurrentTrack(track);
    setProgress(0);
    pendingPlayRef.current = autoPlay;
    loadSrc(track);
  }, [queue, loadSrc]);

  const next = useCallback((autoPlay = true) => {
    if (queue.length === 0) return;
    const nextIdx = shuffle
      ? (() => {
          let n;
          do { n = Math.floor(Math.random() * queue.length); }
          while (n === queueIdx && queue.length > 1);
          return n;
        })()
      : (queueIdx + 1) % queue.length;
    goToIdx(nextIdx, autoPlay);
  }, [queue, queueIdx, shuffle, goToIdx]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (progress > 3 && a) { a.currentTime = 0; return; }
    goToIdx((queueIdx - 1 + queue.length) % queue.length, true);
  }, [queueIdx, queue.length, progress, goToIdx]);

  const seek = useCallback((time) => {
    const a = audioRef.current;
    if (a) { a.currentTime = time; setProgress(time); }
  }, []);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.src = ""; }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    setCurrentTrack(null);
    setQueue([]);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    setError("");
  }, []);

  const handleEnded = useCallback(() => {
    if (repeat === "one") {
      const a = audioRef.current;
      if (a) { a.currentTime = 0; a.play().catch(() => {}); }
    } else if (repeat === "all" || queueIdx < queue.length - 1 || shuffle) {
      next(true);
    } else {
      setIsPlaying(false);
    }
  }, [repeat, queueIdx, queue.length, shuffle, next]);

  const value = useMemo(() => ({
    currentTrack,
    queue,
    queueIdx,
    isPlaying,
    progress,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    loading,
    error,
    loadTrack,
    playPause,
    next,
    prev,
    seek,
    stop,
    goToIdx,
    setVolume: (v) => setVolume(v),
    toggleMute: () => setMuted((m) => !m),
    toggleShuffle: () => setShuffle((s) => !s),
    cycleRepeat: () => setRepeat((r) => r === "off" ? "all" : r === "all" ? "one" : "off"),
  }), [
    currentTrack, queue, queueIdx, isPlaying, progress, duration,
    volume, muted, shuffle, repeat, loading, error,
    loadTrack, playPause, next, prev, seek, stop, goToIdx,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* Single persistent audio element — never unmounts */}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)}
        onLoadedMetadata={(e) =>
          setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)
        }
        onError={() => { setLoading(false); setError("Playback error. Try again."); setIsPlaying(false); }}
        className="sr-only"
      />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}
