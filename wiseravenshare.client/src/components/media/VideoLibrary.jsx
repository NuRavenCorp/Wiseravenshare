import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import MediaUpload from "@/components/media/MediaUpload";
import { Loader2, Play, Trash2, Check, Video, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function VideoLibrary() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmingId, setConfirmingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [ended, setEnded] = useState(false);
  const { toast } = useToast();

  const normalizeVideo = (video) => ({
    ...video,
    id: video.id,
    title: video.title || "Untitled video",
    file_uri: video.videoUrl || video.mediaUrl || "",
  });

  const fetchVideos = async () => {
    try {
      const res = await apiClient.ravensightMedia.listVideos();
      setVideos((res || []).map(normalizeVideo));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const openPreview = async (v) => {
    setPreviewVideo(v);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const url = await getPlayableUrl(v.file_uri);
      setPreviewUrl(url);
    } catch (e) {
      toast({ title: "Could not load video", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewVideo(null);
    setEnded(false);
  };

  const handleDelete = async (v) => {
    if (confirmingId !== v.id) {
      setConfirmingId(v.id);
      return;
    }
    setConfirmingId(null);
    try {
      await apiClient.ravensightMedia.deleteVideo(v.id);
      if (previewVideo?.id === v.id) closePreview();
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
      if (previewVideo && selectedIds.has(previewVideo.id)) closePreview();
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

      {/* Preview Modal */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={closePreview}>
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closePreview}
              className="absolute -top-10 right-0 text-sm text-muted-foreground hover:text-foreground"
            >
              Close ✕
            </button>
            {previewLoading ? (
              <div className="aspect-video rounded-lg border border-border bg-card flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : previewUrl ? (
              <video
                key={previewUrl}
                src={previewUrl}
                controls
                autoPlay
                onEnded={() => setEnded(true)}
                onPlay={() => setEnded(false)}
                className="w-full rounded-lg border border-border bg-black"
              />
            ) : null}
            <div className="flex items-center justify-between gap-3 mt-2">
              <p className="text-sm text-foreground truncate">{previewVideo.title}</p>
              {previewUrl && ended && (
                <button
                  onClick={() => { setEnded(false); setPreviewUrl(null); setTimeout(() => setPreviewUrl(previewUrl), 10); }}
                  className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline shrink-0"
                >
                  <Play className="w-3 h-3" /> Replay
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Library Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Video Library</p>
          <span className="text-xs text-muted-foreground">({videos.length})</span>
        </div>
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

      {/* Bulk Delete Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
          <span className="text-xs text-foreground">{selectedIds.size} selected</span>
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

      {/* Grid */}
      {videos.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Video className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No videos in your library yet. Upload one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {videos.map((v) => (
            <div
              key={v.id}
              className={`relative rounded-lg border p-3 transition-colors ${
                selectedIds.has(v.id)
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
              <button onClick={() => openPreview(v)} className="block w-full text-left group">
                <div className="aspect-video rounded bg-secondary/50 flex items-center justify-center mb-2 relative overflow-hidden">
                  <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors" />
                  <Play className="w-7 h-7 text-primary relative z-10" />
                </div>
                <p className="text-xs font-medium text-foreground truncate mb-1.5">{v.title}</p>
                <span className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                  <Play className="w-3 h-3" /> Play Video
                </span>
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
          ))}
        </div>
      )}
    </div>
  );
}