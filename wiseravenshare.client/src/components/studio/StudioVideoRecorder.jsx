import React, { useState, useRef, useEffect } from "react";
import { useReactMediaRecorder } from "react-media-recorder";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";

const MODES = ["camera", "screen", "screen+camera"];

export default function StudioVideoRecorder({ projectId, trackName, onUploadComplete }) {
  const [mode, setMode] = useState("camera");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pipStream, setPipStream] = useState(null);
  const pipVideoRef = useRef(null);
  const previewVideoRef = useRef(null);

  const mediaConstraints =
    mode === "camera"
      ? { video: true, audio: true }
      : mode === "screen"
      ? { screen: true, audio: true }
      : { screen: true, audio: true };

  const { status, startRecording, stopRecording, pauseRecording, resumeRecording, mediaBlobUrl, previewStream } =
    useReactMediaRecorder(mediaConstraints);

  // Attach preview stream to video element
  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // PiP camera for screen+camera mode
  useEffect(() => {
    if (mode !== "screen+camera") {
      if (pipStream) {
        pipStream.getTracks().forEach((t) => t.stop());
        setPipStream(null);
      }
      return;
    }
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setPipStream(stream);
        if (pipVideoRef.current) pipVideoRef.current.srcObject = stream;
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    if (pipVideoRef.current && pipStream) {
      pipVideoRef.current.srcObject = pipStream;
    }
  }, [pipStream]);

  const handleStop = async () => {
    stopRecording();
  };

  // Upload when blob is available after stopping
  useEffect(() => {
    if (!mediaBlobUrl || status !== "stopped") return;
    uploadBlob(mediaBlobUrl);
  }, [mediaBlobUrl, status]);

  const uploadBlob = async (blobUrl) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const resp = await fetch(blobUrl);
      const blob = await resp.blob();
      const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type });

      // Simulate progress (XHR-based progress not available through apiClient, so fake it)
      const progressInterval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 10, 90));
      }, 200);

      const result = await apiClient.studio.uploadRecording(projectId, file, trackName || "Recording");
      clearInterval(progressInterval);
      setUploadProgress(100);
      onUploadComplete?.(result?.blobUrl || blobUrl);
    } catch (e) {
      console.error("Upload failed:", e);
    } finally {
      setUploading(false);
    }
  };

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isStopped = status === "stopped" || status === "idle";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold">Studio Recorder</span>
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={isRecording || isPaused}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
        <video
          ref={previewVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
        />
        {mode === "screen+camera" && (
          <video
            ref={pipVideoRef}
            autoPlay
            muted
            playsInline
            className="absolute bottom-2 right-2 w-32 h-24 rounded-lg border-2 border-white object-cover"
          />
        )}
        {(isRecording || isPaused) && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded px-2 py-1">
            <span className={`w-2 h-2 rounded-full ${isPaused ? "bg-yellow-400" : "bg-red-500 animate-pulse"}`} />
            <span className="text-xs text-white">{isPaused ? "Paused" : "Recording"}</span>
          </div>
        )}
      </div>

      {/* Recorded preview */}
      {mediaBlobUrl && isStopped && (
        <video src={mediaBlobUrl} controls className="w-full rounded-lg" />
      )}

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        {isStopped && !uploading && (
          <Button onClick={startRecording} size="sm">
            ● Record
          </Button>
        )}
        {isRecording && (
          <>
            <Button onClick={pauseRecording} size="sm" variant="outline">
              ⏸ Pause
            </Button>
            <Button onClick={handleStop} size="sm" variant="destructive">
              ■ Stop
            </Button>
          </>
        )}
        {isPaused && (
          <>
            <Button onClick={resumeRecording} size="sm" variant="outline">
              ▶ Resume
            </Button>
            <Button onClick={handleStop} size="sm" variant="destructive">
              ■ Stop
            </Button>
          </>
        )}
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Uploading…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
