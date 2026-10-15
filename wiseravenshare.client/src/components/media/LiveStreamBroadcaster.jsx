import React, { useState, useRef, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import {
  Loader2,
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
  const [chunkCount, setChunkCount] = useState(0);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const streamIdRef = useRef(null);
  const chunkSeqRef = useRef(0);
  const previewRef = useRef(null);

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
      if (previewRef.current && !audioOnly) {
        previewRef.current.srcObject = mediaStream;
      }

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
      chunkSeqRef.current = 0;

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        try {
          const ext = mimeType.includes("webm") ? "webm" : "mp4";
          const file = new File([e.data], `chunk-${chunkSeqRef.current}.${ext}`, {
            type: mimeType,
          });
          const { fileUrl: file_uri } = await uploadToSpaces(file, "live");
          chunkSeqRef.current++;
          setChunkCount(chunkSeqRef.current);
          await apiClient.entities.LiveStream.update(streamIdRef.current, {
            current_chunk_uri: file_uri,
            chunk_sequence: chunkSeqRef.current,
          });
        } catch (err) {
          console.error(err);
        }
      };

      recorder.start(3000);
      setStreaming(true);
    } catch (err) {
      setError(
        err.message || "Failed to access camera/microphone. Check permissions."
      );
    }
  };

  const stopStream = async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (streamIdRef.current) {
      try {
        await apiClient.entities.LiveStream.update(streamIdRef.current, {
          status: "ended",
          ended_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error(e);
      }
    }
    setStreaming(false);
    setChunkCount(0);
    setTitle("");
    onEnd?.();
  };

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
              {chunkCount} segments streamed
            </span>
            <Button variant="destructive" size="sm" onClick={stopStream}>
              <StopCircle className="w-4 h-4" /> End Stream
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}