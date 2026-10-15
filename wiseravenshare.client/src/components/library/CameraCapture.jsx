import React, { useState, useRef, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Video, Square, X, Circle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function CameraCapture({ onClose, onSaved }) {
  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not supported in this browser.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e) =>
        setError(e?.message || "Could not access camera. Please allow camera and microphone permissions.")
      );
    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const startRecording = () => {
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const stopAndSave = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setSaving(true);
    try {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        await new Promise((resolve) => {
          recorder.onstop = resolve;
          recorder.stop();
        });
      }
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: "video/webm" });
      await apiClient.ravensightMedia.uploadVideo(file, {
        title: `Recording ${new Date().toLocaleString()}`,
      });
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-heading text-foreground flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" /> Video Feed
          </h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <>
            <div className="relative rounded-lg overflow-hidden border border-border bg-black aspect-video">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
                  <Circle className="w-3 h-3 fill-red-500 text-red-500 animate-pulse" />
                  <span className="text-xs text-white tabular-nums">{formatTime(elapsed)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 mt-4">
              {!recording ? (
                <Button onClick={startRecording} disabled={!stream || saving}>
                  <Video className="w-4 h-4" /> Start Recording
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopAndSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                  {saving ? "Saving..." : "Stop & Save"}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}