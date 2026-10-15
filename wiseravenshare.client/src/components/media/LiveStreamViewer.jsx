import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Loader2, Radio, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LiveStreamViewer({ stream, onBack }) {
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const [currentSeq, setCurrentSeq] = useState(stream.chunk_sequence || 0);
  const videoRef = useRef(null);
  const chunkQueueRef = useRef([]);
  const lastSeqRef = useRef(stream.chunk_sequence || 0);
  const playingRef = useRef(false);

  const playNextChunk = () => {
    if (chunkQueueRef.current.length === 0) {
      playingRef.current = false;
      return;
    }
    const chunk = chunkQueueRef.current.shift();
    setCurrentSeq(chunk.seq);
    playingRef.current = true;
    if (videoRef.current) {
      videoRef.current.src = chunk.url;
      videoRef.current.play().catch(() => {});
    }
  };

  useEffect(() => {
    if (!stream) return;
    let unsub;

    const setup = async () => {
      // Play the current chunk immediately if available
      if (stream.current_chunk_uri && stream.chunk_sequence > 0) {
        const url = await getPlayableUrl(stream.current_chunk_uri);
        chunkQueueRef.current.push({ seq: stream.chunk_sequence, url });
        playNextChunk();
      }
      setLoading(false);

      unsub = apiClient.entities.LiveStream.subscribe((event) => {
        if (event.type !== "update") return;
        const s = event.data;
        if (s.id !== stream.id) return;
        if (s.status === "ended") {
          setEnded(true);
          return;
        }
        if (s.chunk_sequence > lastSeqRef.current && s.current_chunk_uri) {
          lastSeqRef.current = s.chunk_sequence;
          getPlayableUrl(s.current_chunk_uri).then((url) => {
            chunkQueueRef.current.push({ seq: s.chunk_sequence, url });
            if (!playingRef.current) playNextChunk();
          });
        }
      });
    };
    setup();

    return () => {
      if (unsub) unsub();
    };
  }, [stream]);

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
          onEnded={playNextChunk}
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
            Segment {currentSeq} - {stream.is_audio_only ? "Audio" : "Video"}
          </p>
        )}
      </div>
    </div>
  );
}