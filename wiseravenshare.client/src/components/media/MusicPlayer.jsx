import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import MediaUpload from "@/components/media/MediaUpload";
// EqualizerPanel requires raw AudioContext access — incompatible with ReactPlayer; disabled for now
// import EqualizerPanel from "@/components/media/EqualizerPanel";
import {
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Trash2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const formatTime = (s) => {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const EMPTY_QUEUE = Object.freeze([]);

export default function MusicPlayer({ initialTrack = null, initialQueue = EMPTY_QUEUE }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [playUrl, setPlayUrl] = useState(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [nativeControlsFallback, setNativeControlsFallback] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off");
  const [confirmingId, setConfirmingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [playbackQueueIds, setPlaybackQueueIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const playerRef = useRef(null);
  const conversionAttemptRef = useRef(null);
  const pendingAutoPlayRef = useRef(false);
  const mountedRef = useRef(false);
  const { toast } = useToast();
  const isIOS = typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const getTrackId = (track) => {
    const raw = track?.id ?? track?.trackId ?? track?.TrackId ?? track?.assetId ?? track?.AssetId ?? null;
    const normalized = String(raw || "").trim();
    return normalized || null;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const audio = playerRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (!isIOS) {
      try { audio.volume = volume; } catch { /* iOS manages playback volume through system controls. */ }
    }
  }, [volume, muted, isIOS]);

  useEffect(() => () => {
    if (playUrl?.startsWith("blob:")) URL.revokeObjectURL(playUrl);
  }, [playUrl]);

  const normalizeTrack = (track) => ({
    ...track,
    id: track.id,
    title: track.title || track.fileName || "Untitled track",
    file_uri: track.mediaUrl || track.file_uri || track.url || "",
  });

  const fetchTracks = async () => {
    try {
      const res = await apiClient.ravensightMedia.listMusic();
      const loadedTracks = (res || []).map(normalizeTrack);
      setTracks(loadedTracks);
      setLibraryError("");
      if (!initialTrack && loadedTracks.length > 0) setCurrentIdx(0);
    } catch (error) {
      setLibraryError(error?.message || "Your music library could not be loaded.");
      toast({ title: "Could not load music", description: error?.message || "Refresh the library and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  useEffect(() => {
    if (!initialTrack || tracks.length === 0) return;
    const initialTrackId = getTrackId(initialTrack);
    if (Array.isArray(initialQueue) && initialQueue.length > 1) {
      const queue = initialQueue.map(normalizeTrack);
      setTracks(queue);
      setCurrentIdx(Math.max(0, queue.findIndex((track) => {
        const queueTrackId = getTrackId(track);
        return Boolean(initialTrackId && queueTrackId && queueTrackId === initialTrackId);
      })));
      return;
    }
    const index = tracks.findIndex((track) =>
      (initialTrackId && getTrackId(track) === initialTrackId)
      || (initialTrack.url && track.file_uri === initialTrack.url)
      || (initialTrack.file_uri && track.file_uri === initialTrack.file_uri));
    if (index >= 0) {
      setCurrentIdx(index);
    } else {
      const externalTrack = normalizeTrack(initialTrack);
      setTracks((currentTracks) => [...currentTracks, externalTrack]);
      setCurrentIdx(tracks.length);
    }
  }, [initialTrack, initialQueue, tracks.length]);

  const current = currentIdx >= 0 ? tracks[currentIdx] : null;
  const queueIndices = React.useMemo(() => {
    if (tracks.length === 0) return [];
    if (!Array.isArray(playbackQueueIds) || playbackQueueIds.length === 0) {
      return tracks.map((_, idx) => idx);
    }
    const queueIdSet = new Set(playbackQueueIds);
    const indices = tracks
      .map((track, idx) => ({ id: getTrackId(track), idx }))
      .filter(({ id }) => Boolean(id && queueIdSet.has(id)))
      .map(({ idx }) => idx);
    return indices.length > 0 ? indices : tracks.map((_, idx) => idx);
  }, [tracks, playbackQueueIds]);

  const prepareBrowserCompatibleTrack = async () => {
    const trackId = getTrackId(current);
    if (!trackId) {
      setPlaybackError("This file is not in your music library, so it cannot be converted for this browser.");
      return;
    }
    if (conversionAttemptRef.current === trackId) return;
    conversionAttemptRef.current = trackId;
    setPlaybackError("This browser cannot decode the original audio. Preparing a compatible copy…");
    setPlaying(false);
    try {
      const compatible = await apiClient.podcastAudio.convertForBrowser(trackId);
      if (!mountedRef.current || getTrackId(current) !== trackId) return;
      const compatibleUrl = URL.createObjectURL(compatible);
      setPlayUrl((previous) => {
        if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
        return compatibleUrl;
      });
      const audio = playerRef.current;
      if (!audio) return;

      audio.load();
      try {
        await audio.play();
        setPlaybackError("");
      } catch (error) {
        if (error?.name === "NotAllowedError") {
          setNativeControlsFallback(true);
          setPlaybackError("Compatible audio is ready. Press play to start this track.");
        } else if (error?.name === "NotSupportedError" || error?.name === "EncodingError") {
          setPlaybackError("The converted audio is not playable in this browser. Re-upload the track or try another format.");
        } else if (error?.name !== "AbortError") {
          setPlaybackError(error?.message || "Could not start playback for the converted audio.");
        }
      }
    } catch (error) {
      if (!mountedRef.current || getTrackId(current) !== trackId) return;
      const detail = error?.data?.detail;
      const message = typeof detail === "string" ? detail : error?.data?.message || error?.message;
      setPlaybackError(message || "Could not convert this track for browser playback.");
    }
  };

  // Fetch signed URL when track changes
  useEffect(() => {
    let cancelled = false;
    if (!current) {
      setPlayUrl(null);
      return () => { cancelled = true; };
    }
    setPlayUrl(null);
    setUrlLoading(true);
    setPlaying(false);
    setPlaybackError("");
    conversionAttemptRef.current = null;
    setProgress(0);
    setDuration(0);
    const loadTrack = async () => {
      try {
        const streamTrackId = getTrackId(current);
        if (streamTrackId) {
          const blob = await apiClient.ravensightMedia.streamMusic(streamTrackId);
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          setPlayUrl((previous) => {
            if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
            return objectUrl;
          });
          setUrlLoading(false);
          const audio = playerRef.current;
          if (pendingAutoPlayRef.current && audio) {
            pendingAutoPlayRef.current = false;
            try {
              await audio.play();
            } catch (error) {
              if (error?.name === "NotAllowedError") {
                setNativeControlsFallback(true);
                setPlaybackError("Your browser blocked autoplay. Tap play to continue.");
              } else if (error?.name !== "AbortError") {
                setPlaybackError(error?.message || "This track could not be played. Check the file format or try uploading it again.");
              }
            }
          }
          return;
        }

        const url = await getPlayableUrl(current.file_uri);
        if (cancelled) return;
        if (!url) throw new Error("The media URL is unavailable.");
        setPlayUrl(url);
        setUrlLoading(false);
        const audio = playerRef.current;
        if (pendingAutoPlayRef.current && audio) {
          pendingAutoPlayRef.current = false;
          try {
            await audio.play();
          } catch (error) {
            if (error?.name === "NotAllowedError") {
              setNativeControlsFallback(true);
              setPlaybackError("Your browser blocked autoplay. Tap play to continue.");
            } else if (error?.name !== "AbortError") {
              setPlaybackError(error?.message || "This track could not be played. Check the file format or try uploading it again.");
            }
          }
        }
      } catch (primaryError) {
        if (cancelled) return;

        try {
          const fallbackUrl = await getPlayableUrl(current?.file_uri);
          if (!fallbackUrl) throw primaryError;
          setPlayUrl(fallbackUrl);
          setUrlLoading(false);
        } catch {
          setUrlLoading(false);
          setPlaybackError(primaryError?.message || "Could not prepare this track for playback.");
        }
      }
    };

    void loadTrack();
    return () => { cancelled = true; };
  }, [current]);

  const handlePlayPause = () => {
    if (!current && tracks.length > 0) {
      pendingAutoPlayRef.current = true;
      setCurrentIdx(0);
      return;
    }
    const audio = playerRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch((error) => {
      if (error?.name === "NotAllowedError") {
        setNativeControlsFallback(true);
        setPlaybackError("Your browser blocked this play request. Tap the audio controls below to start playback.");
      } else if (error?.name === "NotSupportedError" || error?.name === "EncodingError") {
        void prepareBrowserCompatibleTrack();
      } else if (error?.name !== "AbortError") {
        setPlaybackError(error?.message || "This track could not be played. Check the file format or try uploading it again.");
      }
    });
  };

  const handleNext = (autoPlay = false) => {
    if (tracks.length === 0) return;
    const activeQueue = queueIndices;
    if (activeQueue.length === 0) return;
    const queuePosition = activeQueue.indexOf(currentIdx);
    const currentQueuePosition = queuePosition >= 0 ? queuePosition : 0;
    if (autoPlay) pendingAutoPlayRef.current = true;
    if (shuffle) {
      let next;
      do {
        next = activeQueue[Math.floor(Math.random() * activeQueue.length)];
      } while (next === currentIdx && activeQueue.length > 1);
      setCurrentIdx(next);
    } else {
      const nextQueuePosition = (currentQueuePosition + 1) % activeQueue.length;
      setCurrentIdx(activeQueue[nextQueuePosition]);
    }
  };

  const handlePrev = () => {
    if (tracks.length === 0) return;
    const activeQueue = queueIndices;
    if (activeQueue.length === 0) return;
    const queuePosition = activeQueue.indexOf(currentIdx);
    const currentQueuePosition = queuePosition >= 0 ? queuePosition : 0;
    if (progress > 3) {
      if (playerRef.current) playerRef.current.currentTime = 0;
      return;
    }
    const previousQueuePosition = (currentQueuePosition - 1 + activeQueue.length) % activeQueue.length;
    setCurrentIdx(activeQueue[previousQueuePosition]);
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (playerRef.current) playerRef.current.currentTime = time;
    setProgress(time);
  };

  const handleEnded = () => {
    const activeQueue = queueIndices;
    const queuePosition = activeQueue.indexOf(currentIdx);
    const isLastInQueue = queuePosition < 0 || queuePosition === activeQueue.length - 1;
    if (repeat === "one") {
      if (playerRef.current) {
        playerRef.current.currentTime = 0;
        playerRef.current.play().catch((error) => {
          if (error?.name === "NotAllowedError") {
            setNativeControlsFallback(true);
            setPlaybackError("Your browser paused before the next play. Tap the audio controls to resume.");
          } else {
            setPlaybackError("This track could not be played.");
          }
        });
      }
    } else if (repeat === "all" || !isLastInQueue || shuffle) {
      handleNext(true);
    } else {
      setPlaying(false);
    }
  };

  const cycleRepeat = () => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  };

  const selectTrack = (i) => {
    setCurrentIdx(i);
  };

  const handleDelete = async (t) => {
    if (confirmingId !== t.id) {
      setConfirmingId(t.id);
      return;
    }
    setConfirmingId(null);
    try {
      await apiClient.ravensightMedia.deleteMusic(t.id);
      setPlaybackQueueIds((prev) => prev.filter((id) => id !== t.id));
      if (tracks[currentIdx]?.id === t.id) {
        setCurrentIdx(-1);
        setPlaying(false);
      }
      fetchTracks();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e?.message || "Could not delete this track.",
        variant: "destructive",
      });
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === tracks.length ? new Set() : new Set(tracks.map((t) => t.id))
    );
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => apiClient.ravensightMedia.deleteMusic(id)));
      setPlaybackQueueIds((prev) => prev.filter((id) => !selectedIds.has(id)));
      if (currentIdx >= 0 && selectedIds.has(tracks[currentIdx]?.id)) {
        setCurrentIdx(-1);
        setPlaying(false);
      }
      setSelectedIds(new Set());
      setConfirmingId(null);
      fetchTracks();
    } catch (e) {
      toast({
        title: "Bulk delete failed",
        description: e?.message || "Could not delete selected tracks.",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    setPlaybackQueueIds(tracks.map((track) => getTrackId(track)).filter(Boolean));
    pendingAutoPlayRef.current = true;
    setCurrentIdx(0);
    const audio = playerRef.current;
    if (audio) {
      audio.currentTime = 0;
    }
  };

  const handlePlaySelected = () => {
    if (selectedIds.size === 0 || tracks.length === 0) return;
    const queueIds = tracks
      .map((track) => getTrackId(track))
      .filter((id) => Boolean(id && selectedIds.has(id)));
    if (queueIds.length === 0) return;
    const firstIndex = tracks.findIndex((track) => queueIds.includes(getTrackId(track)));
    if (firstIndex < 0) return;
    setPlaybackQueueIds(queueIds);
    pendingAutoPlayRef.current = true;
    setCurrentIdx(firstIndex);
    const audio = playerRef.current;
    if (audio) {
      audio.currentTime = 0;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MediaUpload type="music" onUploaded={fetchTracks} />
      {/* EqualizerPanel disabled: requires raw AudioContext not available via ReactPlayer */}
      {/* <EqualizerPanel audioRef={playerRef} /> */}
      <audio
        ref={playerRef}
        src={playUrl || undefined}
        preload="metadata"
        playsInline
        controls={isIOS || nativeControlsFallback}
        muted={muted}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onError={async (event) => {
          if (!playUrl) return;
          const code = event.currentTarget.error?.code;
          if (code === 4 && current) {
            await prepareBrowserCompatibleTrack();
            return;
          }
          const detail = code === 4 ? "This audio format is not supported and conversion could not be completed." : "The audio stream could not be loaded. Check access or try uploading the track again.";
          setPlaybackError(detail);
          setPlaying(false);
        }}
        className={isIOS || nativeControlsFallback ? "mx-auto h-12 w-full rounded-md bg-secondary" : "sr-only"}
      />

      {/* Now Playing Bar */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-md bg-secondary flex items-center justify-center shrink-0">
            {urlLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : (
              <Music className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {current?.title || "No track selected"}
            </p>
            <p className="text-xs text-muted-foreground">
              {urlLoading
                ? "Loading stream..."
                : current
                ? playing
                  ? "Now playing"
                  : "Paused"
                : "Select a track below"}
            </p>
          </div>
        </div>
        {playbackError && <p role="alert" className="text-sm text-destructive">{playbackError}</p>}

        {/* Seek Bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
            {formatTime(progress)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={progress}
            onChange={handleSeek}
            disabled={!current || urlLoading}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-muted-foreground w-10 tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShuffle(!shuffle)}
              className={shuffle ? "text-primary" : ""}
            >
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              disabled={tracks.length === 0}
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              onClick={handlePlayPause}
              disabled={!current || urlLoading}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              disabled={tracks.length === 0}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleRepeat}
              className={repeat !== "off" ? "text-primary" : ""}
            >
              {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </Button>
          </div>

          {/* Volume */}
          {!isIOS && <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMuted(!muted)}
              className="h-8 w-8"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setMuted(false);
              }}
              className="w-20 accent-primary"
            />
          </div>}
        </div>
      </div>

      {/* Track List */}
      <div className="space-y-2">
        {libraryError && <p role="alert" className="text-sm text-destructive">{libraryError}</p>}
        {tracks.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Music className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No tracks yet. Upload music to start listening.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePlayAll} disabled={tracks.length === 0}>
                  Play all
                </Button>
                <Button variant="outline" size="sm" onClick={handlePlaySelected} disabled={selectedIds.size === 0}>
                  Play selected
                </Button>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === tracks.length}
                    onChange={toggleSelectAll}
                    className="accent-primary"
                  />
                  Select All
                </label>
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground">{selectedIds.size} selected</span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
                    {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete Selected
                  </Button>
                </div>
              )}
            </div>
            {tracks.map((t, i) => (
              <div
                key={t.id}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  selectedIds.has(t.id)
                    ? "border-primary bg-primary/10"
                    : currentIdx === i
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-secondary/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(t.id)}
                  onChange={() => toggleSelect(t.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 accent-primary shrink-0"
                />
                <button
                  onClick={() => selectTrack(i)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                    {currentIdx === i && playing ? (
                      <Pause className="w-3 h-3 text-primary" />
                    ) : (
                      <Play className="w-3 h-3 text-muted-foreground" />
                    )}
                  </div>
                  <span className="text-sm text-foreground truncate flex-1">{t.title}</span>
                  {t.duration ? (
                    <span className="text-xs text-muted-foreground">{formatTime(t.duration)}</span>
                  ) : null}
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className={`p-1.5 rounded transition-colors shrink-0 ${
                    confirmingId === t.id
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  }`}
                  title={confirmingId === t.id ? "Click again to confirm" : "Delete track"}
                >
                  {confirmingId === t.id ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
