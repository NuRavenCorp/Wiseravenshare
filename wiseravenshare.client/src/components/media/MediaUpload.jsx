import React, { useState, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";

export default function MediaUpload({ type, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
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
      onUploaded?.();
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={type === "video" ? "video/*" : "audio/*"}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        Upload {type === "video" ? "Video" : "Music"}
      </Button>
    </div>
  );
}