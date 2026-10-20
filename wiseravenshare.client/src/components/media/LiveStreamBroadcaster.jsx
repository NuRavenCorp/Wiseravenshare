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
  const bufferedChunksRef = useRef([]);
  const segmentIndexRef = useRef(0);
  const flushTimerRef = useRef(null);
  const inFlightFlushRef = useRef(false);

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

  const generateStreamId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    const nowHex = Date.now().toString(16).padStart(12, "0").slice(-12);
    const randomHex = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      .toString(16)
      .padStart(20, "0")
      .slice(-20);
    return `${randomHex.slice(0, 8)}-${randomHex.slice(8, 12)}-4${randomHex.slice(13, 16)}-a${randomHex.slice(17, 20)}-${nowHex}`;
  };

  const sha256Hex = async (blob) => {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const flushSegment = async (force = false) => {
    if (inFlightFlushRef.current) {
      if (!force) return;
      while (inFlightFlushRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    if (!bufferedChunksRef.current.length) return;
    inFlightFlushRef.current = true;
    try {
      const streamId = streamIdRef.current;
      if (!streamId) return;

      const mimeType = recorderRef.current?.mimeType || pickMimeType();
      const blob = new Blob(bufferedChunksRef.current, { type: mimeType });
      if (!blob.size) return;
      bufferedChunksRef.current = [];

      const segmentIndex = segmentIndexRef.current++;
      const sha256 = await sha256Hex(blob);
      const presigned = await apiClient.live.presignSegment(streamId, {
        segment_index: segmentIndex,
        size_bytes: blob.size,
        sha256,
      });

      const putResponse = await fetch(presigned.url, {
        method: "PUT",
        headers: { "Content-Type": blob.type || "video/webm" },
        body: blob,
      });
      if (!putResponse.ok) {
        throw new Error(`Segment upload failed with ${putResponse.status}`);
      }

      await apiClient.live.confirmSegment(streamId, segmentIndex);
    } catch (error) {
      console.error(error);
      if (force) {
        setError(error?.message || "Could not upload final live segment.");
      }
    } finally {
      inFlightFlushRef.current = false;
    }
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

      const streamId = generateStreamId();
      await apiClient.live.start(streamId, {
        title: title.trim(),
        is_audio_only: audioOnly,
      });
      streamIdRef.current = streamId;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(mediaStream, { mimeType });
      recorderRef.current = recorder;
      bufferedChunksRef.current = [];
      segmentIndexRef.current = 0;

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        bufferedChunksRef.current.push(e.data);
      };

      recorder.start(1000);
      flushTimerRef.current = setInterval(() => {
        void flushSegment(false);
      }, 5000);
      setStreaming(true);
    } catch (err) {
      setError(
        err.message || "Failed to access camera/microphone. Check permissions."
      );
    }
  };

  const stopStream = async () => {
    setSaving(true);
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
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
    let saveError = null;
    if (streamId) {
      try {
        await flushSegment(true);
        await apiClient.live.end(streamId);
      } catch (e) {
        console.error(e);
        saveError = "Live stream ended, but finalize/save failed.";
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
    streamIdRef.current = null;
    setStreaming(false);
    setSaving(false);
    setTitle("");
    bufferedChunksRef.current = [];
    if (saveError) {
      setError(saveError);
      return;
    }
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
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (streaming) {
            void stopStream();
            return;
          }
          onEnd?.();
        }}
        disabled={saving}
      >
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
              {saving ? "Finalizing stream for auto-save..." : "Live recording in progress (5s auto segments)"}
            </span>
            <Button variant="destructive" size="sm" onClick={stopStream} disabled={saving}>
              <StopCircle className="w-4 h-4" /> Stop & Save
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}