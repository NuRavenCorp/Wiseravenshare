import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Loader2, Radio, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LiveStreamViewer({ stream, onBack }) {
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const videoRef = useRef(null);
  const lastSeqRef = useRef(stream.chunk_sequence || 0);
  const currentSourceRef = useRef("");

  const applyWholeStreamSource = async (next) => {
    if (!next?.current_chunk_uri) return;
    const playableUrl = await getPlayableUrl(next.current_chunk_uri);
    if (!playableUrl || !videoRef.current) return;

    const video = videoRef.current;
    const previousTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const shouldResumePlayback = !video.paused || video.currentTime > 0;

    if (currentSourceRef.current === playableUrl) {
      return;
    }
    currentSourceRef.current = playableUrl;
    video.src = playableUrl;
    video.onloadedmetadata = () => {
      if (previousTime > 0 && Number.isFinite(video.duration) && video.duration > previousTime) {
        try {
          video.currentTime = previousTime;
        } catch {
          // Ignore seek failures for browsers that block metadata-time seeks.
        }
      }
      if (shouldResumePlayback || !ended) {
        video.play().catch(() => {});
      }
    };
  };

  useEffect(() => {
    if (!stream) return;
    let disposed = false;
    let unsub;

    const setup = async () => {
      if (stream.current_chunk_uri && stream.chunk_sequence > 0) {
        lastSeqRef.current = stream.chunk_sequence;
        await applyWholeStreamSource(stream);
      }
      if (disposed) return;
      setLoading(false);

      unsub = apiClient.entities.LiveStream.subscribe((event) => {
        if (disposed) return;
        if (event.type !== "update") return;
        const s = event.data;
        if (s.id !== stream.id) return;
        if (s.status === "ended") {
          setEnded(true);
          return;
        }
        if (s.chunk_sequence > lastSeqRef.current && s.current_chunk_uri) {
          lastSeqRef.current = s.chunk_sequence;
          void applyWholeStreamSource(s);
        }
      });
    };
    setup();

    return () => {
      disposed = true;
      if (unsub) unsub();
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = null;
      }
    };
  }, [stream, ended]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" /> Back to streams
      </Button>

      <div className="rounded-lg overflow-hidden border border-border bg-black relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full aspect-video ${stream.is_audio_only ? "opacity-0" : ""}`}
          onEnded={() => {
            // Keep viewer active between rolling live file updates.
            if (!ended && videoRef.current) {
              videoRef.current.play().catch(() => {});
            }
          }}
        />
        {stream.is_audio_only && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Radio className="w-12 h-12 text-primary animate-pulse" />
          </div>
        )}
        {!ended && (
          <span className="absolute top-3 left-3 px-2 py-1 text-xs rounded bg-destructive text-destructive-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive-foreground animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-sm font-medium text-foreground">{stream.title}</p>
        {ended ? (
          <p className="text-xs text-muted-foreground mt-1">Stream has ended</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            Live {stream.is_audio_only ? "Audio" : "Video"} stream
          </p>
        )}
      </div>
    </div>
  );
}