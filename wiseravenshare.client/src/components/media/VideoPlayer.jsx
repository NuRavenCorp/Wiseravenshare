import React, { useState, useEffect, useRef } from "react";
import ReactPlayer from "react-player";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import MediaUpload from "@/components/media/MediaUpload";
import StillGallery from "@/components/media/StillGallery";
import {
  Loader2,
  Play,
  Pause,
  Video,
  Camera,
  Maximize,
  Volume2,
  VolumeX,
  Gauge,
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

const getFormatLabel = (w, h) => {
  if (!w || !h) return null;
  const ratio = w / h;
  if (ratio > 1.7) return "Landscape";
  if (ratio < 0.6) return "Portrait";
  if (Math.abs(ratio - 1) < 0.15) return "Square";
  return "Wide";
};

export default function VideoPlayer() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(null);
  const [playUrl, setPlayUrl] = useState(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [nativeControlsFallback, setNativeControlsFallback] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const { toast } = useToast();

  const normalizeVideo = (video) => ({
    ...video,
    id: video.id,
    title: video.title || "Untitled video",
    file_uri: video.videoUrl || video.mediaUrl || "",
  });

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const res = await apiClient.ravensightMedia.listVideos();
      setVideos((res || []).map(normalizeVideo));
    } catch (error) {
      toast({ title: "Could not load videos", description: error?.message || "Try refreshing the library.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!playerRef.current) return;
    playerRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    if (!playerRef.current) return;
    try { playerRef.current.playbackRate = speed; } catch { /* Ignore unsupported rates. */ }
  }, [speed]);

  // Fetch signed URL when current changes
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
    setNativeControlsFallback(false);
    setProgress(0);
    setDuration(0);
    setVideoSize({ w: 0, h: 0 });
    getPlayableUrl(current.file_uri).then((url) => {
      if (cancelled) return;
      if (!url) throw new Error("The video URL is unavailable.");
      setPlayUrl(url);
      setUrlLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      setPlaybackError(error?.message || "Could not prepare this video for playback.");
      setUrlLoading(false);
    });
    return () => { cancelled = true; };
  }, [current]);

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (playerRef.current) playerRef.current.currentTime = time;
    setProgress(time);
  };

  const togglePlayback = async () => {
    const video = playerRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    setPlaybackError("");
    try {
      await video.play();
    } catch (error) {
      setNativeControlsFallback(true);
      setPlaybackError(error?.name === "NotAllowedError"
        ? "Your browser blocked playback. Press play in the video controls to start."
        : error?.message || "This video could not be played. Check the file or try uploading it again.");
    }
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    }
  };

  const captureStill = async () => {
    const video = playerRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Could not capture a frame from this video.");
      const file = new File([blob], `${current.title}-still-${Date.now()}.png`, {
        type: "image/png",
      });
      await apiClient.ravensightMedia.uploadPhoto(file, {
        caption: `video-still:${current.title}`,
      });
      toast({ title: "Still captured", description: "The frame was saved to your photo library." });
    } catch (e) {
      toast({ title: "Still capture failed", description: e?.message || "Could not save a frame from this video.", variant: "destructive" });
    } finally {
      setCapturing(false);
    }
  };

  const handleDelete = async (v) => {
    if (confirmingId !== v.id) {
      setConfirmingId(v.id);
      return;
    }
    setConfirmingId(null);
    try {
      await apiClient.ravensightMedia.deleteVideo(v.id);
      if (current?.id === v.id) setCurrent(null);
      fetchVideos();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e?.message || "Could not delete this video.",
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
      prev.size === videos.length ? new Set() : new Set(videos.map((v) => v.id))
    );
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => apiClient.ravensightMedia.deleteVideo(id)));
      if (current && selectedIds.has(current.id)) setCurrent(null);
      setSelectedIds(new Set());
      setConfirmingId(null);
      fetchVideos();
    } catch (e) {
      toast({
        title: "Bulk delete failed",
        description: e?.message || "Could not delete selected videos.",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  const formatLabel = getFormatLabel(videoSize.w, videoSize.h);
  const aspectClass =
    formatLabel === "Portrait"
      ? "aspect-[9/16] max-h-[65vh] mx-auto"
      : formatLabel === "Square"
      ? "aspect-square max-h-[65vh] mx-auto"
      : "aspect-video";

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MediaUpload type="video" onUploaded={fetchVideos} />

      {/* Video Display */}
      {current && playUrl ? (
        <div className="space-y-3">
          <div
            ref={containerRef}
            className={`relative rounded-lg overflow-hidden border border-border bg-black flex items-center justify-center ${aspectClass}`}
          >
            <ReactPlayer
              ref={playerRef}
              src={playUrl}
              playing={playing}
              volume={muted ? 0 : volume}
              playbackRate={speed}
              controls={nativeControlsFallback || isFullscreen}
              playsInline
              preload="metadata"
              width="100%"
              height="100%"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              config={{ file: { attributes: { controlsList: "nodownload" } } }}
              onPlay={() => { setPlaying(true); setPlaybackError(""); }}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(event) => setProgress(event.currentTarget?.currentTime || 0)}
              onDurationChange={(seconds) => setDuration(Number.isFinite(seconds) ? seconds : 0)}
              onLoadedMetadata={(event) => {
                const media = event.currentTarget;
                setVideoSize({ w: media.videoWidth || 0, h: media.videoHeight || 0 });
                if (Number.isFinite(media.duration)) setDuration(media.duration);
              }}
              onError={(event) => {
                const code = event?.currentTarget?.error?.code;
                setPlaying(false);
                setNativeControlsFallback(true);
                setPlaybackError(code === 4
                  ? "This video format is not supported by this browser. Try MP4 or WebM, or convert the file before uploading."
                  : "The video stream could not be loaded. Check the file or try again.");
              }}
            />
            {formatLabel && !isFullscreen && (
              <span className="absolute top-3 left-3 px-2 py-1 text-xs rounded bg-background/80 text-foreground backdrop-blur-sm">
                {formatLabel}
              </span>
            )}
          </div>

          {playbackError && <p role="alert" className="text-sm text-destructive">{playbackError}</p>}

          {/* Custom Controls */}
          {!isFullscreen && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
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
                  className="flex-1 accent-primary"
                />
                <span className="text-xs text-muted-foreground w-10 tabular-nums">
                  {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1">
                  <Button size="icon" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"}>
                    {playing ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={captureStill}
                    disabled={capturing}
                    title="Capture Still"
                  >
                    {capturing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFullscreen}
                    title="Fullscreen"
                  >
                    <Maximize className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  {/* Speed */}
                  <div className="flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
                    {[0.5, 1, 1.5, 2].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                          speed === s
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
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
            </div>
          )}
        </div>
      ) : current && urlLoading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading video stream...</p>
        </div>
      ) : current && playbackError ? (
        <div className="rounded-lg border border-destructive/30 bg-card p-8 text-center space-y-3">
          <p role="alert" className="text-sm text-destructive">{playbackError}</p>
          <Button variant="outline" size="sm" onClick={() => setCurrent((selected) => selected ? { ...selected } : selected)}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Video className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Select a video to play, or upload one.
          </p>
        </div>
      )}

      {/* Captured Stills */}
      <StillGallery />

      {/* Video Library */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">
            Video Library
          </p>
          {videos.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === videos.length}
                onChange={toggleSelectAll}
                className="accent-primary"
              />
              Select All
            </label>
          )}
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
            <span className="text-xs text-foreground">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Selected
              </Button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground col-span-full text-center py-4">
              No videos uploaded yet.
            </p>
          ) : (
            videos.map((v) => (
              <div
                key={v.id}
                className={`relative rounded-lg border p-3 transition-colors ${
                  selectedIds.has(v.id)
                    ? "border-primary bg-primary/10"
                    : current?.id === v.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-secondary/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(v.id)}
                  onChange={() => toggleSelect(v.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2 left-2 z-10 w-4 h-4 accent-primary"
                />
                <button
                  onClick={() => setCurrent(v)}
                  className="block w-full text-left"
                >
                  <div className="aspect-video rounded bg-secondary/50 flex items-center justify-center mb-2">
                    <Play className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium text-foreground truncate">
                    {v.title}
                  </p>
                </button>
                <button
                  onClick={() => handleDelete(v)}
                  className={`absolute top-2 right-2 p-1 rounded bg-background/80 transition-colors ${
                    confirmingId === v.id
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  }`}
                  title={confirmingId === v.id ? "Click again to confirm" : "Delete video"}
                >
                  {confirmingId === v.id ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
