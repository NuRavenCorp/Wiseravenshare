import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Video, Trash2 } from "lucide-react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";

export default function VideoTeaserRecorder({ videoUri, onChange }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");
  const liveVideoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    if (videoUri) {
      getPlayableUrl(videoUri).then(setPreviewUrl);
    } else {
      setPreviewUrl(null);
    }
  }, [videoUri]);

  const startRecording = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        await uploadBlob(blob);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Camera access denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const uploadBlob = async (blob) => {
    setUploading(true);
    try {
      const file = new File([blob], "teaser.webm", { type: "video/webm" });
      const upload = await apiClient.ravensightMedia.uploadVideo(file, { title: "teaser" });
      onChange(upload.mediaUrl || upload.file?.mediaUrl || "");
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = () => {
    onChange("");
    setPreviewUrl(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Video className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Video Teaser</span>
      </div>

      {recording && (
        <video
          ref={liveVideoRef}
          autoPlay
          muted
          className="w-full rounded-lg border border-primary/40"
        />
      )}

      {!recording && previewUrl && (
        <video
          src={previewUrl}
          controls
          className="w-full rounded-lg border border-border"
        />
      )}

      {!recording && !previewUrl && (
        <div className="aspect-video rounded-lg border border-dashed border-border flex items-center justify-center bg-card/50">
          <p className="text-sm text-muted-foreground">
            No teaser recorded yet
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        {!recording ? (
          <Button
            onClick={startRecording}
            variant="outline"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Video className="w-4 h-4" />
            )}
            {previewUrl ? "Re-record" : "Record Teaser"}
          </Button>
        ) : (
          <Button onClick={stopRecording} variant="destructive">
            Stop & Upload
          </Button>
        )}
        {previewUrl && !recording && !uploading && (
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