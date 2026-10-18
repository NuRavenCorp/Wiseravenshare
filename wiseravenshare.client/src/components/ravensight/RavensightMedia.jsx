import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Image } from "@/components/ui/image";
import { Loader2, Upload, Trash2, Video, Music, Camera, Play, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const TYPES = [
  { id: "video", label: "Video", icon: Video, accept: "video/*", folder: "video" },
  { id: "music", label: "Music", icon: Music, accept: "audio/*", folder: "music" },
  { id: "photo", label: "Photos", icon: Camera, accept: "image/*", folder: "photos" },
];

function AssetThumb({ asset, type }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    getPlayableUrl(asset.file_uri).then(setUrl);
  }, [asset.file_uri]);

  if (type === "photo") {
    if (!url) return <div className="w-full aspect-video bg-secondary/50 animate-pulse rounded" />;
    return <Image src={url} alt={asset.title} className="w-full aspect-video" fittingType="fill" />;
  }
  return (
    <div className="w-full aspect-video bg-secondary/50 rounded flex items-center justify-center">
      {url ? (
        <Play className="w-6 h-6 text-muted-foreground" />
      ) : (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

export default function RavensightMedia() {
  const [type, setType] = useState("video");
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const inputRef = useRef(null);
  const { toast } = useToast();

  const normalizeAsset = (assetType, asset) => ({
    ...asset,
    id: asset.id,
    asset_type: assetType,
    title: asset.title || asset.caption || asset.fileName || "Untitled",
    file_uri: asset.mediaUrl || asset.imageUrl || asset.videoUrl || "",
  });

  const load = async (assetType = type) => {
    setLoading(true);
    try {
      if (assetType === "video") {
        const response = await apiClient.ravensightMedia.listVideos();
        const items = Array.isArray(response)
          ? response
          : Array.isArray(response?.items)
            ? response.items
            : Array.isArray(response?.data)
              ? response.data
              : [];
        setAssets(items.map((item) => normalizeAsset("video", item)));
      } else if (assetType === "music") {
        const response = await apiClient.ravensightMedia.listMusic();
        const items = Array.isArray(response)
          ? response
          : Array.isArray(response?.items)
            ? response.items
            : Array.isArray(response?.data)
              ? response.data
              : [];
        setAssets(items.map((item) => normalizeAsset("music", item)));
      } else {
        const response = await apiClient.ravensightMedia.listPhotos(50);
        const items = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response?.items)
              ? response.items
              : [];
        setAssets(items.map((item) => normalizeAsset("photo", item)));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setSelectedIds(new Set());
    setConfirmingId(null);
  }, [type]);

  const handleFile = async (file) => {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const mediaType = file.type.startsWith("video/") || ["mp4", "mov", "webm", "m4v", "avi"].includes(extension)
      ? "video"
      : file.type.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(extension)
        ? "music"
        : file.type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(extension)
          ? "photo"
          : "";

    if (!mediaType) {
      toast({ title: "Unsupported media", description: "Choose a photo, audio track, or video clip.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const title = file.name.replace(/\.[^/.]+$/, "");
      if (mediaType === "video") {
        await apiClient.ravensightMedia.uploadVideo(file, { title, destinationFolder: "my-library" });
      } else if (mediaType === "music") {
        await apiClient.ravensightMedia.uploadMusic(file, { title, destinationFolder: "my-library" });
      } else {
        await apiClient.ravensightMedia.uploadPhoto(file, { caption: title, destinationFolder: "my-library" });
      }

      setType(mediaType);
      try {
        await load(mediaType);
      } catch (refreshError) {
        toast({
          title: "Media uploaded",
          description: `Saved successfully, but the library did not refresh: ${refreshError?.message || "refresh failed"}`,
          variant: "default",
        });
        return;
      }
      toast({ title: "Media uploaded", description: `${file.name} was saved to your ${mediaType === "photo" ? "photo" : mediaType} library.` });
    } catch (uploadError) {
      toast({
        title: "Upload failed",
        description: uploadError?.message || `Could not save ${file.name}.`,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (asset) => {
    if (confirmingId !== asset.id) {
      setConfirmingId(asset.id);
      return;
    }
    setConfirmingId(null);
    setDeleting(asset.id);
    try {
      if (type === "video") await apiClient.ravensightMedia.deleteVideo(asset.id);
      else if (type === "music") await apiClient.ravensightMedia.deleteMusic(asset.id);
      else await apiClient.ravensightMedia.deletePhoto(asset.id);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e?.message || "Could not delete this asset.",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
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
      prev.size === assets.length ? new Set() : new Set(assets.map((a) => a.id))
    );
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => {
        if (type === "video") return apiClient.ravensightMedia.deleteVideo(id);
        if (type === "music") return apiClient.ravensightMedia.deleteMusic(id);
        return apiClient.ravensightMedia.deletePhoto(id);
      }));
      setSelectedIds(new Set());
      setConfirmingId(null);
      load();
    } catch (e) {
      toast({
        title: "Bulk delete failed",
        description: e?.message || "Could not delete selected assets.",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  const currentType = TYPES.find((t) => t.id === type);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-border">
        {TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                type === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,audio/*,video/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Upload media
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No {currentType.label.toLowerCase()} uploaded yet.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === assets.length}
                onChange={toggleSelectAll}
                className="accent-primary"
              />
              Select All
            </label>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-foreground">{selectedIds.size} selected</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  <X className="w-3.5 h-3.5" /> Clear
                </Button>
                <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
                  {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete Selected
                </Button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {assets.map((a) => (
              <div
                key={a.id}
                className={`relative rounded-lg border bg-card overflow-hidden transition-colors ${
                  selectedIds.has(a.id) ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={() => toggleSelect(a.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2 left-2 z-10 w-4 h-4 accent-primary"
                />
                <div className="p-3">
                  <AssetThumb asset={a} type={type} />
                  <p className="text-xs font-medium text-foreground truncate mt-2">
                    {a.title}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(a)}
                  disabled={deleting === a.id}
                  className={`absolute top-2 right-2 p-1 rounded bg-background/80 transition-colors disabled:opacity-50 ${
                    confirmingId === a.id
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  }`}
                  title={confirmingId === a.id ? "Click again to confirm deletion" : `Delete ${currentType.label.toLowerCase()}`}
                >
                  {deleting === a.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : confirmingId === a.id ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}