import React, { useState, useEffect, useRef, useCallback } from "react";
import Navbar from "@/components/landing/Navbar";
import LibraryCard from "@/components/library/LibraryCard";
import CameraCapture from "@/components/library/CameraCapture";
import TeamConnections from "@/components/library/TeamConnections";
import { apiClient } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Music, Video, Upload, Loader2, Trash2, Search, Library as LibraryIcon, ListMusic, Play, Clapperboard, Database } from "lucide-react";
import { useMediaExperience } from "@/components/media/MediaExperience";
import { getPlayableUrl } from "@/lib/mediaUtils";

const FILTERS = [
  { id: "all", label: "All", icon: LibraryIcon },
  { id: "photo", label: "Photos", icon: ImageIcon },
  { id: "music", label: "Music", icon: Music },
  { id: "video", label: "Videos", icon: Video },
];

const ACCEPT_MAP = {
  photo: "image/*",
  music: "audio/*,.mp4,.m4a,.aac,.flac,.ogg,.opus,.wma,.aiff",
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
  music: new Set(["mp3", "mp4", "wav", "m4a", "aac", "flac", "ogg", "opus", "wma", "aiff"]),
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

function FeedVideo({ item, onOpen }) {
  const videoRef = useRef(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    getPlayableUrl(item.file_uri).then((resolved) => { if (active) setUrl(resolved || item.file_uri); });
    return () => { active = false; };
  }, [item.file_uri]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) video.play().catch(() => {});
      else video.pause();
    }, { threshold: [0, 0.6, 1] });
    observer.observe(video);
    return () => observer.disconnect();
  }, [url]);

  return (
    <article className="relative h-full min-h-[72vh] snap-start snap-always bg-black">
      <video ref={videoRef} src={url || undefined} controls playsInline muted loop preload="metadata" className="h-full w-full object-contain" />
      <div className="absolute bottom-12 left-4 right-4 flex items-end justify-between text-white drop-shadow">
        <span className="font-medium">{item.title}</span>
        <Button size="sm" variant="secondary" onClick={() => onOpen(item)}>Open</Button>
      </div>
    </article>
  );
}

export default function Library() {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ all: 0, photo: 0, music: 0, video: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmingId, setConfirmingId] = useState(null);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState("grid");
  const [dragging, setDragging] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlists, setPlaylists] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wiseravenshare.library.playlists") || "[]"); } catch { return []; }
  });
  const [backupBusy, setBackupBusy] = useState(false);
  const dragDepth = useRef(0);
  const { toast } = useToast();
  const { openMedia } = useMediaExperience();
  const fileRefs = useRef({});
  const compareLibraryItems = useCallback((a, b) => (
    sort === "name-asc" ? a.title.localeCompare(b.title)
      : sort === "name-desc" ? b.title.localeCompare(a.title)
        : sort === "oldest" ? String(a.created_date || "").localeCompare(String(b.created_date || ""))
          : String(b.created_date || "").localeCompare(String(a.created_date || ""))
  ), [sort]);

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
        .sort(compareLibraryItems);

      setItems(filtered);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [compareLibraryItems, filter, search, sort]);

  useEffect(() => { localStorage.setItem("wiseravenshare.library.playlists", JSON.stringify(playlists)); }, [playlists]);

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
    if (!file) return false;
    const expectedPrefix = TYPE_PREFIXES[type];
    const extension = getFileExtension(file.name);
    const extensionAllowed = EXTENSION_MAP[type]?.has(extension) || false;
    const hasMimeType = Boolean(file.type);
    const mimeMatches = expectedPrefix ? file.type.startsWith(expectedPrefix) : false;

    const compatibleAudioContainer = type === "music" && extensionAllowed;
    if (expectedPrefix && ((hasMimeType && !mimeMatches && !compatibleAudioContainer) || (!hasMimeType && !extensionAllowed))) {
      toast({
        title: "Wrong file type",
        description: `This category only accepts ${TYPE_LABELS[type]} files. You selected "${file.type || extension || "unknown"}".`,
        variant: "destructive",
      });
      if (fileRefs.current[type]) fileRefs.current[type].value = "";
      return false;
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
      return true;
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e?.message || "Could not upload this file.",
        variant: "destructive",
      });
      return false;
    } finally {
      setUploading(null);
      if (fileRefs.current[type]) fileRefs.current[type].value = "";
    }
  };

  const handleUploadBatch = async (type, fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    let uploadedCount = 0;
    let rejectedCount = 0;

    for (const file of files) {
      const ok = await handleUpload(type, file);
      if (ok) uploadedCount += 1;
      else rejectedCount += 1;
    }

    if (rejectedCount > 0) {
      toast({
        title: "Some uploads were skipped",
        description: `${uploadedCount} uploaded, ${rejectedCount} failed.`,
        variant: uploadedCount ? "default" : "destructive",
      });
    }
  };

  const classifyFile = (file) => {
    const ext = getFileExtension(file.name);
    if (file.type?.startsWith("image/") || EXTENSION_MAP.photo.has(ext)) return "photo";
    if (file.type?.startsWith("audio/") || (EXTENSION_MAP.music.has(ext) && !file.type?.startsWith("video/"))) return "music";
    if (file.type?.startsWith("video/") || EXTENSION_MAP.video.has(ext)) return "video";
    return null;
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files || []);
    for (const file of files) {
      let type = classifyFile(file);
      // MP4 can be audio or video; honor the selected category if it resolves the ambiguity.
      if (getFileExtension(file.name) === "mp4" && filter === "music") type = "music";
      if (getFileExtension(file.name) === "mp4" && filter === "video") type = "video";
      if (type) await handleUpload(type, file);
    }
  };

  const playAll = () => {
    const queue = items.filter((item) => item.asset_type === "music");
    if (!queue.length) return;
    openMedia({ ...queue[0], queue, type: "music" });
  };

  const createPlaylist = () => {
    const selected = items.filter((item) => selectedIds.has(item.id) && item.asset_type === "music");
    if (!playlistName.trim() || selected.length === 0) {
      toast({ title: "Select tracks for your playlist", description: "Choose one or more music tracks and enter a playlist name." });
      return;
    }
    setPlaylists((current) => [...current, { id: crypto.randomUUID(), name: playlistName.trim(), tracks: selected }]);
    setPlaylistName("");
    toast({ title: "Playlist created", description: `${selected.length} track(s) added.` });
  };

  const startPlaylist = (playlist) => {
    if (!playlist.tracks?.length) return;
    openMedia({ ...playlist.tracks[0], queue: playlist.tracks, type: "music" });
  };

  const backupLibrary = async () => {
    setBackupBusy(true);
    try {
      const result = await apiClient.ravensightMedia.backup();
      toast({ title: "Media backup complete", description: `${result?.backedUp ?? 0} file(s) backed up.` });
    } catch (error) {
      toast({ title: "Backup failed", description: error?.message || "Could not back up your media.", variant: "destructive" });
    } finally { setBackupBusy(false); }
  };

  const handleDelete = async (item) => {
    if (confirmingId !== item.id) {
      setConfirmingId(item.id);
      return;
    }
    setConfirmingId(null);
    setDeletingIds((prev) => new Set(prev).add(item.id));
    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setCounts((prev) => ({
      ...prev,
      all: Math.max(0, (prev.all || 0) - 1),
      [item.asset_type]: Math.max(0, (prev[item.asset_type] || 0) - 1),
    }));
    try {
      if (item.asset_type === "photo") await apiClient.ravensightMedia.deletePhoto(item.id);
      else if (item.asset_type === "music") await apiClient.ravensightMedia.deleteMusic(item.id);
      else await apiClient.ravensightMedia.deleteVideo(item.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      fetchCounts();
    } catch (e) {
      fetchItems();
      fetchCounts();
      toast({
        title: "Delete failed",
        description: e?.message || "Could not delete this item.",
        variant: "destructive",
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
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
    const selectedItems = items.filter((item) => selectedIds.has(item.id));
    const selectedIdSet = new Set(selectedItems.map((item) => item.id));
    setDeletingIds((prev) => {
      const next = new Set(prev);
      selectedItems.forEach((item) => next.add(item.id));
      return next;
    });
    setItems((prev) => prev.filter((item) => !selectedIdSet.has(item.id)));
    setCounts((prev) => {
      const next = { ...prev };
      selectedItems.forEach((item) => {
        next.all = Math.max(0, (next.all || 0) - 1);
        next[item.asset_type] = Math.max(0, (next[item.asset_type] || 0) - 1);
      });
      return next;
    });
    setSelectedIds(new Set());
    setConfirmingId(null);
    try {
      const results = await Promise.allSettled(selectedItems.map((item) => {
        if (item.asset_type === "photo") return apiClient.ravensightMedia.deletePhoto(item.id);
        if (item.asset_type === "music") return apiClient.ravensightMedia.deleteMusic(item.id);
        return apiClient.ravensightMedia.deleteVideo(item.id);
      }));
      const failedItems = selectedItems.filter((_, index) => results[index].status === "rejected");
      fetchCounts();
      if (failedItems.length > 0) {
        setItems((prev) => [...prev, ...failedItems].sort(compareLibraryItems));
        setSelectedIds(new Set(failedItems.map((item) => item.id)));
      }
      toast(failedItems.length
        ? { title: "Some items could not be deleted", description: `${failedItems.length} item(s) failed. They remain selected so you can retry.`, variant: "destructive" }
        : { title: "Items deleted", description: "Selected items have been removed." });
    } catch (e) {
      toast({
        title: "Bulk delete failed",
        description: e?.message || "Could not delete selected items.",
        variant: "destructive",
      });
      fetchItems();
      fetchCounts();
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        selectedItems.forEach((item) => next.delete(item.id));
        return next;
      });
      setBulkDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-8" onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }} onDrop={handleDrop}>
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
                multiple
                className="hidden"
                onChange={(e) => handleUploadBatch(type, e.target.files)}
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
          <Button variant="outline" size="sm" onClick={playAll} disabled={!items.some((item) => item.asset_type === "music")}><Play className="w-4 h-4" /> Play All</Button>
          <Button variant="outline" size="sm" onClick={backupLibrary} disabled={backupBusy}><Database className="w-4 h-4" /> {backupBusy ? "Backing up…" : "Back Up Media"}</Button>
        </div>

        {dragging && <div className="mb-4 rounded-xl border-2 border-dashed border-primary bg-primary/10 p-8 text-center text-sm font-medium text-primary">Drop photos, music, or videos here to upload</div>}

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <ListMusic className="h-4 w-4 text-primary" />
          <Input aria-label="Playlist name" placeholder="New playlist name" value={playlistName} onChange={(e) => setPlaylistName(e.target.value)} className="w-48" />
          <Button size="sm" variant="outline" onClick={createPlaylist}><ListMusic className="h-4 w-4" /> Create from selected music</Button>
          <span className="text-xs text-muted-foreground">{playlists.length} saved playlist(s)</span>
          {playlists.map((playlist) => <Button key={playlist.id} variant="ghost" size="sm" onClick={() => startPlaylist(playlist)} title={playlist.tracks?.map((track) => track.title).join(", ")}><Play className="h-3 w-3" /> {playlist.name}</Button>)}
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
          <div className="flex items-center gap-2">
            <select aria-label="Sort library" value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option>
            </select>
            <Button size="sm" variant={view === "feed" ? "default" : "outline"} onClick={() => { setFilter("video"); setView(view === "feed" ? "grid" : "feed"); }}><Clapperboard className="h-4 w-4" /> Video Feed</Button>
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
        {deletingIds.size > 0 && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
            Deleting {deletingIds.size} item{deletingIds.size === 1 ? "" : "s"}…
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
            {view === "feed" ? <div className="mx-auto max-w-xl h-[72vh] overflow-y-auto snap-y snap-mandatory rounded-xl bg-black">{items.filter((item) => item.asset_type === "video").map((item) => <FeedVideo key={item.id} item={item} onOpen={openMedia} />)}</div> : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((item) => (
                <LibraryCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  confirming={confirmingId === item.id}
                  deleting={deletingIds.has(item.id)}
                  onSelect={() => toggleSelect(item.id)}
                  onPreview={() => openMedia(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>}
          </>
        )}
      </div>

      {showCamera && (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onSaved={() => { fetchItems(); fetchCounts(); }}
        />
      )}
    </div>
  );
}
