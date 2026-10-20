import React, { useState, useRef, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import {
  Radio,
  StopCircle,
  Mic,
  Video,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadToSpaces } from "@/lib/spacesUpload";

export default function LiveStreamBroadcaster({ onEnd }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const streamIdRef = useRef(null);
  const previewRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const pickMimeType = () => {
    if (audioOnly) {
      return MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
    }
    return MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "video/mp4";
  };

  const startStream = async () => {
    if (!title.trim() || !user) return;
    setError(null);
    try {
      const constraints = audioOnly
        ? { audio: true, video: false }
        : { audio: true, video: true };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      const res = await apiClient.entities.LiveStream.create({
        title: title.trim(),
        streamer_id: user.id,
        status: "live",
        is_audio_only: audioOnly,
        started_at: new Date().toISOString(),
      });
      streamIdRef.current = res.id;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(mediaStream, { mimeType });
      recorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        recordedChunksRef.current.push(e.data);
      };

      recorder.start();
      setStreaming(true);
    } catch (err) {
      setError(
        err.message || "Failed to access camera/microphone. Check permissions."
      );
    }
  };

  const stopStream = async () => {
    setSaving(true);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      const recorder = recorderRef.current;
      const stopped = new Promise((resolve) => {
        recorder.addEventListener("stop", resolve, { once: true });
      });
      try {
        recorder.requestData();
      } catch {
        // Some browsers can throw if requestData is called too close to stop.
      }
      recorder.stop();
      await stopped;
    }

    const streamId = streamIdRef.current;
    const mimeType = recorderRef.current?.mimeType || (audioOnly ? "audio/webm" : "video/webm");
    let finalUri = "";
    if (streamId && recordedChunksRef.current.length > 0) {
      try {
        const ext = mimeType.includes("webm") ? "webm" : "mp4";
        const fullRecording = new Blob(recordedChunksRef.current, { type: mimeType });
        const file = new File([fullRecording], `live-stream-${streamId}.${ext}`, { type: mimeType });
        const { fileUrl } = await uploadToSpaces(file, "live");
        finalUri = fileUrl || "";
      } catch (e) {
        console.error(e);
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
    if (streamIdRef.current) {
      try {
        await apiClient.entities.LiveStream.update(streamIdRef.current, {
          current_chunk_uri: finalUri || undefined,
          chunk_sequence: finalUri ? 1 : 0,
          status: "ended",
          ended_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error(e);
      }
    }
    setStreaming(false);
    setSaving(false);
    setTitle("");
    recordedChunksRef.current = [];
    onEnd?.();
  };

  useEffect(() => {
    if (!streaming || audioOnly || !previewRef.current || !streamRef.current) {
      return;
    }

    const video = previewRef.current;
    video.srcObject = streamRef.current;
    const playPreview = () => {
      video.play().catch(() => {});
    };
    video.onloadedmetadata = playPreview;
    playPreview();

    return () => {
      video.onloadedmetadata = null;
      if (video.srcObject) {
        video.srcObject = null;
      }
    };
  }, [streaming, audioOnly]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onEnd}>
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      {!streaming ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-sm font-medium text-foreground mb-3">
              Go Live
            </p>
            <Input
              placeholder="Stream title (e.g., Live from City Hall)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAudioOnly(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors ${
                !audioOnly
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Video className="w-3.5 h-3.5" /> Video
            </button>
            <button
              onClick={() => setAudioOnly(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors ${
                audioOnly
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mic className="w-3.5 h-3.5" /> Audio Only
            </button>
          </div>
          <Button
            onClick={startStream}
            disabled={!title.trim()}
            className="w-full"
          >
            <Radio className="w-4 h-4" /> Start Broadcasting
          </Button>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg overflow-hidden border border-border bg-black relative">
            {audioOnly ? (
              <div className="aspect-video flex items-center justify-center">
                <Mic className="w-12 h-12 text-primary animate-pulse" />
              </div>
            ) : (
              <video
                ref={previewRef}
                autoPlay
                muted
                playsInline
                className="w-full aspect-video"
              />
            )}
            <span className="absolute top-3 left-3 px-2 py-1 text-xs rounded bg-destructive text-destructive-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-destructive-foreground animate-pulse" />
              LIVE
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <span className="text-xs text-muted-foreground">
              {saving ? "Saving full live recording..." : "Live recording in progress"}
            </span>
            <Button variant="destructive" size="sm" onClick={stopStream} disabled={saving}>
              <StopCircle className="w-4 h-4" /> End Stream
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}