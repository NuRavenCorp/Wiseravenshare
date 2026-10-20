import React, { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";

export default function MediaUpload({ type, onUploaded, label }) {
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    const allFiles = Array.from(files || []).filter(Boolean);
    if (!allFiles.length) return;

    setUploading(true);
    setError(null);
    setSuccess(null);
    let uploadedCount = 0;
    let firstUploadedName = "";
    const failed = [];

    try {
      for (const file of allFiles) {
        try {
          if (type === "video") {
            await apiClient.ravensightMedia.uploadVideo(file, {
              title: file.name.replace(/\.[^/.]+$/, ""),
            });
          } else {
            await apiClient.ravensightMedia.uploadMusic(file, {
              title: file.name.replace(/\.[^/.]+$/, ""),
              destinationFolder: "my-library",
            });
          }
          if (!firstUploadedName) firstUploadedName = file.name;
          uploadedCount += 1;
        } catch (uploadError) {
          failed.push({
            fileName: file.name,
            message: uploadError?.data?.message || uploadError?.message || "Upload failed",
          });
        }
      }

      if (uploadedCount) {
        setSuccess(
          uploadedCount === 1
            ? `"${firstUploadedName || "Track"}" uploaded successfully`
            : `${uploadedCount} file(s) uploaded successfully`
        );
        onUploaded?.();
      }

      if (failed.length) {
        setError(
          failed.length === 1
            ? `${failed[0].fileName}: ${failed[0].message}`
            : `${failed.length} file(s) failed to upload.`
        );
      }
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
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
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
