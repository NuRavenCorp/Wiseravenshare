import React, { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";

export default function MediaUpload({ type, onUploaded, label }) {
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      if (type === "video") {
        await apiClient.ravensightMedia.uploadVideo(file, {
          title: file.name.replace(/\.[^/.]+$/, ""),
        });
      } else {
        await apiClient.ravensightMedia.uploadMusic(file, {
          title: file.name.replace(/\.[^/.]+$/, ""),
        });
      }
      setSuccess(`"${file.name}" uploaded successfully`);
      onUploaded?.();
    } catch (e) {
      const msg = e?.data?.message || e?.message || "Upload failed";
      setError(msg);
      console.error("MediaUpload error:", e);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const accept = type === "video" ? "video/*" : "audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg";
  const defaultLabel = type === "video" ? "Upload Video" : "Upload Music";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {uploading ? "Uploading…" : (label || defaultLabel)}
      </Button>

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
