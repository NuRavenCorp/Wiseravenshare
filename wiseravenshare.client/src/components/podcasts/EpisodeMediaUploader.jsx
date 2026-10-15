import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Trash2, Film } from "lucide-react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";

export default function EpisodeMediaUploader({ mediaUri, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (mediaUri) {
      getPlayableUrl(mediaUri).then(setPreviewUrl);
    } else {
      setPreviewUrl(null);
    }
  }, [mediaUri]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const upload = await apiClient.ravensightMedia.uploadVideo(file, {
        title: file.name.replace(/\.[^/.]+$/, ""),
      });
      onChange(upload.mediaUrl || upload.file?.mediaUrl || "");
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = () => {
    onChange("");
    setPreviewUrl(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Film className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Full Episode Video</span>
      </div>

      {previewUrl && (
        <video
          src={previewUrl}
          controls
          className="w-full rounded-lg border border-border"
        />
      )}

      {!previewUrl && !uploading && (
        <div className="aspect-video rounded-lg border border-dashed border-border flex items-center justify-center bg-card/50">
          <p className="text-sm text-muted-foreground">
            No episode video uploaded
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {previewUrl ? "Replace Video" : "Upload Episode"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleUpload}
          className="hidden"
        />
        {previewUrl && !uploading && (
          <Button
            onClick={handleDelete}
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" /> Remove
          </Button>
        )}
      </div>

      {uploading && (
        <p className="text-xs text-muted-foreground">
          Uploading (stored privately)...
        </p>
      )}
    </div>
  );
}