import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Image } from "@/components/ui/image";
import ZoomableImage from "@/components/media/ZoomableImage";
import { Camera, Download, X, Loader2, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

function StillThumb({ still, onClick }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    getPlayableUrl(still.file_uri).then(setUrl);
  }, [still.file_uri]);
  if (!url) {
    return (
      <button className="block w-full">
        <div className="w-full aspect-video bg-secondary/50 animate-pulse rounded" />
      </button>
    );
  }
  return (
    <button onClick={onClick} className="block w-full">
      <Image src={url} alt={still.title} className="w-full aspect-video" fittingType="fill" />
    </button>
  );
}

function StillViewer({ still, onClose, onDownload }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    getPlayableUrl(still.file_uri).then(setUrl);
  }, [still.file_uri]);
  return (
    <div
      className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
        {url ? (
          <ZoomableImage src={url} alt={still.title} className="w-full rounded-lg max-h-[75vh]" fittingType="fit" />
        ) : (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <p className="text-sm text-foreground">{still.title}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onDownload(still)}>
              <Download className="w-3.5 h-3.5" /> Download
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-3.5 h-3.5" /> Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StillGallery() {
  const [stills, setStills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { toast } = useToast();

  const isVideoStill = (photo) =>
    String(photo.caption || "").startsWith("video-still:")
    || String(photo.title || "").includes(" - Still");

  const fetchStills = async () => {
    try {
      const res = await apiClient.ravensightMedia.listPhotos(100);
      const items = (res?.data || []).map((photo) => ({
        ...photo,
        file_uri: photo.mediaUrl || photo.imageUrl || "",
      }));
      setStills(items.filter(isVideoStill));
    } catch {
      setStills([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStills();
  }, []);

  const downloadStill = async (still) => {
    const url = await getPlayableUrl(still.file_uri);
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${still.title || "still"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (still) => {
    if (confirmingId !== still.id) {
      setConfirmingId(still.id);
      return;
    }
    setConfirmingId(null);
    try {
      await apiClient.ravensightMedia.deletePhoto(still.id);
      if (viewing?.id === still.id) setViewing(null);
      fetchStills();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e?.message || "Could not delete this still.",
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
      prev.size === stills.length ? new Set() : new Set(stills.map((s) => s.id))
    );
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => apiClient.ravensightMedia.deletePhoto(id)));
      if (viewing && selectedIds.has(viewing.id)) setViewing(null);
      setSelectedIds(new Set());
      setConfirmingId(null);
      fetchStills();
    } catch (e) {
      toast({
        title: "Bulk delete failed",
        description: e?.message || "Could not delete selected stills.",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  if (loading || stills.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-accent" />
          <p className="text-xs font-medium text-muted-foreground">
            Captured Stills ({stills.length})
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={selectedIds.size === stills.length}
            onChange={toggleSelectAll}
            className="accent-primary"
          />
          Select All
        </label>
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
        {stills.map((s) => (
          <div
            key={s.id}
            className={`relative rounded-lg border bg-card overflow-hidden transition-colors ${
              selectedIds.has(s.id) ? "border-primary" : "border-border"
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(s.id)}
              onChange={() => toggleSelect(s.id)}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-2 left-2 z-10 w-4 h-4 accent-primary"
            />
            <StillThumb still={s} onClick={() => setViewing(s)} />
            <div className="p-2 flex items-center justify-between gap-1">
              <p className="text-xs text-foreground truncate flex-1">{s.title}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => downloadStill(s)}
              >
                <Download className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 shrink-0 ${
                  confirmingId === s.id
                    ? "bg-destructive text-destructive-foreground"
                    : "hover:text-destructive"
                }`}
                onClick={() => handleDelete(s)}
                title={confirmingId === s.id ? "Click again to confirm" : "Delete still"}
              >
                {confirmingId === s.id ? <Check className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <StillViewer
          still={viewing}
          onClose={() => setViewing(null)}
          onDownload={downloadStill}
        />
      )}
    </div>
  );
}