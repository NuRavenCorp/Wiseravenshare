import React, { useState, useEffect, useRef, useCallback } from "react";
import Navbar from "@/components/landing/Navbar";
import LibraryCard from "@/components/library/LibraryCard";
import LibraryPreview from "@/components/library/LibraryPreview";
import CameraCapture from "@/components/library/CameraCapture";
import TeamConnections from "@/components/library/TeamConnections";
import { apiClient } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Music, Video, Upload, Loader2, Trash2, Search, Library as LibraryIcon } from "lucide-react";

const FILTERS = [
  { id: "all", label: "All", icon: LibraryIcon },
  { id: "photo", label: "Photos", icon: ImageIcon },
  { id: "music", label: "Music", icon: Music },
  { id: "video", label: "Videos", icon: Video },
];

const ACCEPT_MAP = {
  photo: "image/*",
  music: "audio/*",
  video: "video/*",
};

const TYPE_PREFIXES = {
  photo: "image/",
  music: "audio/",
  video: "video/",
};

const TYPE_LABELS = {
  photo: "image",
  music: "audio",
  video: "video",
};

const EXTENSION_MAP = {
  photo: new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]),
  music: new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg"]),
  video: new Set(["mp4", "mov", "webm"]),
};

const getFileExtension = (fileName = "") => {
  const parts = String(fileName).toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) : "";
};

const normalizeLibraryItem = (type, item) => {
  if (type === "photo") {
    return {
      id: item.id,
      asset_type: "photo",
      title: item.title || item.caption || item.fileName || "Untitled photo",
      file_uri: item.mediaUrl || item.imageUrl || "",
      created_date: item.createdAt || item.uploadedAt || "",
    };
  }

  if (type === "music") {
    return {
      id: item.id,
      asset_type: "music",
      title: item.title || item.fileName || "Untitled track",
      file_uri: item.mediaUrl || "",
      created_date: item.uploadedAt || "",
    };
  }

  return {
    id: item.id,
    asset_type: "video",
    title: item.title || "Untitled video",
    file_uri: item.videoUrl || item.mediaUrl || "",
    created_date: item.createdAt || "",
  };
};

export default function Library() {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ all: 0, photo: 0, music: 0, video: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmingId, setConfirmingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const fileRefs = useRef({});

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [photosResult, musicResult, videosResult] = await Promise.all([
        apiClient.ravensightMedia.listPhotos(100),
        apiClient.ravensightMedia.listMusic(),
        apiClient.ravensightMedia.listVideos(),
      ]);

      const allItems = [
        ...(photosResult?.data || []).map((item) => normalizeLibraryItem("photo", item)),
        ...(musicResult || []).map((item) => normalizeLibraryItem("music", item)),
        ...(videosResult || []).map((item) => normalizeLibraryItem("video", item)),
      ];

      const filtered = allItems
        .filter((item) => filter === "all" || item.asset_type === filter)
        .filter((item) => {
          if (!search.trim()) return true;
          return String(item.title || "").toLowerCase().includes(search.trim().toLowerCase());
        })
        .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));

      setItems(filtered);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  const fetchCounts = useCallback(async () => {
    try {
      const [photosResult, musicResult, videosResult] = await Promise.all([
        apiClient.ravensightMedia.listPhotos(200),
        apiClient.ravensightMedia.listMusic(),
        apiClient.ravensightMedia.listVideos(),
      ]);
      const c = {
        photo: (photosResult?.data || []).length,
        music: (musicResult || []).length,
        video: (videosResult || []).length,
      };
      c.all = c.photo + c.music + c.video;
      setCounts(c);
    } catch {
      setCounts({ all: 0, photo: 0, music: 0, video: 0 });
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetchCounts();
  }, []);

  const handleUpload = async (type, file) => {
    if (!file) return;
    const expectedPrefix = TYPE_PREFIXES[type];
    const extension = getFileExtension(file.name);
    const extensionAllowed = EXTENSION_MAP[type]?.has(extension) || false;
    const hasMimeType = Boolean(file.type);
    const mimeMatches = expectedPrefix ? file.type.startsWith(expectedPrefix) : false;

    if (expectedPrefix && ((hasMimeType && !mimeMatches) || (!hasMimeType && !extensionAllowed))) {
      toast({
        title: "Wrong file type",
        description: `This category only accepts ${TYPE_LABELS[type]} files. You selected "${file.type || extension || "unknown"}".`,
        variant: "destructive",
      });
      if (fileRefs.current[type]) fileRefs.current[type].value = "";
      return;
    }
    setUploading(type);
    try {
      if (type === "photo") {
        await apiClient.ravensightMedia.uploadPhoto(file, {
          caption: file.name.replace(/\.[^/.]+$/, ""),
        });
      } else if (type === "music") {
        await apiClient.ravensightMedia.uploadMusic(file, {
          title: file.name.replace(/\.[^/.]+$/, ""),
          destinationFolder: "my-library",
        });
      } else {
        await apiClient.ravensightMedia.uploadVideo(file, {
          title: file.name.replace(/\.[^/.]+$/, ""),
        });
      }
      fetchItems();
      fetchCounts();
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e?.message || "Could not upload this file.",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
      if (fileRefs.current[type]) fileRefs.current[type].value = "";
    }
  };

  const handleDelete = async (item) => {
    if (confirmingId !== item.id) {
      setConfirmingId(item.id);
      return;
    }
    setConfirmingId(null);
    try {
      if (item.asset_type === "photo") await apiClient.ravensightMedia.deletePhoto(item.id);
      else if (item.asset_type === "music") await apiClient.ravensightMedia.deleteMusic(item.id);
      else await apiClient.ravensightMedia.deleteVideo(item.id);
      if (preview?.id === item.id) setPreview(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      fetchItems();
      fetchCounts();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e?.message || "Could not delete this item.",
        variant: "destructive",
      });
    }
  };

  const toggleSelect = (id) => {
    setConfirmingBulk(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setConfirmingBulk(false);
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    );
  };

  const handleBulkDelete = async () => {
    if (!confirmingBulk) {
      setConfirmingBulk(true);
      return;
    }
    setConfirmingBulk(false);
    setBulkDeleting(true);
    try {
      const selectedItems = items.filter((item) => selectedIds.has(item.id));
      await Promise.all(selectedItems.map((item) => {
        if (item.asset_type === "photo") return apiClient.ravensightMedia.deletePhoto(item.id);
        if (item.asset_type === "music") return apiClient.ravensightMedia.deleteMusic(item.id);
        return apiClient.ravensightMedia.deleteVideo(item.id);
      }));
      if (preview && selectedIds.has(preview.id)) setPreview(null);
      setSelectedIds(new Set());
      setConfirmingId(null);
      fetchItems();
      fetchCounts();
      toast({ title: "Items deleted", description: "Selected items have been removed." });
    } catch (e) {
      toast({
        title: "Bulk delete failed",
        description: e?.message || "Could not delete selected items.",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <LibraryIcon className="w-7 h-7 text-primary" />
          <h1 className="font-heading text-3xl text-foreground text-glow">My Library</h1>
        </div>

        {/* Upload buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {["photo", "music", "video"].map((type) => (
            <div key={type}>
              <input
                ref={(el) => (fileRefs.current[type] = el)}
                type="file"
                accept={ACCEPT_MAP[type]}
                className="hidden"
                onChange={(e) => handleUpload(type, e.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRefs.current[type]?.click()}
                disabled={uploading === type}
              >
                {uploading === type ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Upload {type === "photo" ? "Photo" : type === "music" ? "Music" : "Video"}
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setShowCamera(true)}>
            <Video className="w-4 h-4" /> Start Video Feed
          </Button>
        </div>

        <TeamConnections />

        {/* Filter tabs + search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex gap-1 border-b border-border">
            {FILTERS.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => { setFilter(f.id); setSelectedIds(new Set()); }}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                    filter === f.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" /> {f.label}
                  <span className="text-xs text-muted-foreground">({counts[f.id] || 0})</span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-full sm:w-56"
            />
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 mb-4">
            <span className="text-xs text-foreground">{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedIds(new Set()); setConfirmingBulk(false); }}>
                Clear
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {confirmingBulk ? "Click again to confirm" : `Delete Selected (${selectedIds.size})`}
              </Button>
            </div>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <LibraryIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search.trim() ? "No items match your search." : "Your library is empty. Upload a photo, track, or video to get started."}
            </p>
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === items.length}
                  onChange={toggleSelectAll}
                  className="accent-primary"
                />
                Select All
              </label>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((item) => (
                <LibraryCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  confirming={confirmingId === item.id}
                  onSelect={() => toggleSelect(item.id)}
                  onPreview={() => setPreview(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {preview && <LibraryPreview item={preview} onClose={() => setPreview(null)} />}
      {showCamera && (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onSaved={() => { fetchItems(); fetchCounts(); }}
        />
      )}
    </div>
  );
}