import React, { useState, useEffect, useRef } from "react";
import ReactPlayer from "react-player";
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

export default function MusicPlayer() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [playUrl, setPlayUrl] = useState(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off");
  const [confirmingId, setConfirmingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const playerRef = useRef(null);
  const { toast } = useToast();

  const normalizeTrack = (track) => ({
    ...track,
    id: track.id,
    title: track.title || track.fileName || "Untitled track",
    file_uri: track.mediaUrl || "",
  });

  const fetchTracks = async () => {
    try {
      const res = await apiClient.ravensightMedia.listMusic();
      setTracks((res || []).map(normalizeTrack));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  const current = currentIdx >= 0 ? tracks[currentIdx] : null;

  // Fetch signed URL when track changes
  useEffect(() => {
    if (!current) {
      setPlayUrl(null);
      return;
    }
    setUrlLoading(true);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    getPlayableUrl(current.file_uri).then((url) => {
      setPlayUrl(url);
      setUrlLoading(false);
    });
  }, [current]);

  const handlePlayPause = () => {
    if (!current && tracks.length > 0) {
      setCurrentIdx(0);
      return;
    }
    setPlaying(!playing);
  };

  const handleNext = () => {
    if (tracks.length === 0) return;
    if (shuffle) {
      let next;
      do {
        next = Math.floor(Math.random() * tracks.length);
      } while (next === currentIdx && tracks.length > 1);
      setCurrentIdx(next);
    } else {
      setCurrentIdx((currentIdx + 1) % tracks.length);
    }
  };

  const handlePrev = () => {
    if (tracks.length === 0) return;
    if (progress > 3) {
      if (playerRef.current) playerRef.current.currentTime = 0;
      return;
    }
    setCurrentIdx((currentIdx - 1 + tracks.length) % tracks.length);
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (playerRef.current) playerRef.current.currentTime = time;
    setProgress(time);
  };

  const handleEnded = () => {
    if (repeat === "one") {
      playerRef.current?.seekTo(0, 'seconds');
      setPlaying(true);
    } else if (repeat === "all" || currentIdx < tracks.length - 1 || shuffle) {
      handleNext();
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
      <ReactPlayer
        ref={playerRef}
        src={playUrl || undefined}
        playing={playing}
        volume={muted ? 0 : volume}
        muted={muted}
        width="0"
        height="0"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onReady={() => setPlaying(true)}
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
              disabled={tracks.length === 0 || urlLoading}
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
          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="space-y-2">
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
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === tracks.length}
                  onChange={toggleSelectAll}
                  className="accent-primary"
                />
                Select All
              </label>
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
