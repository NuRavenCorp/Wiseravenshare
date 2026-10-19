import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import LiveStreamBroadcaster from "@/components/media/LiveStreamBroadcaster";
import LiveStreamViewer from "@/components/media/LiveStreamViewer";
import LiveFeed from "@/components/media/LiveFeed";
import { Radio, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LiveStreamPanel() {
  const [mode, setMode] = useState("list");
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStream, setSelectedStream] = useState(null);

  const fetchStreams = async () => {
    try {
      const res = await apiClient.entities.LiveStream.filter(
        { status: "live" },
        { sort: "-created_date", limit: 50 }
      );
      setStreams(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStreams();
    const unsub = apiClient.entities.LiveStream.subscribe(() => fetchStreams());
    return unsub;
  }, []);

  if (mode === "broadcast") {
    return (
      <LiveStreamBroadcaster
        onEnd={() => {
          setMode("list");
          fetchStreams();
        }}
      />
    );
  }

  if (mode === "view" && selectedStream) {
    return (
      <LiveStreamViewer
        stream={selectedStream}
        onBack={() => {
          setMode("list");
          setSelectedStream(null);
          fetchStreams();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <LiveFeed />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Live Streams
          </span>
        </div>
        <Button size="sm" onClick={() => setMode("broadcast")}>
          <Plus className="w-3.5 h-3.5" /> Go Live
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : streams.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Radio className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No active live streams. Go live to start broadcasting.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {streams.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedStream(s);
                setMode("view");
              }}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded bg-destructive/10 flex items-center justify-center shrink-0">
                <Radio className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {s.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.is_audio_only ? "Audio" : "Video"} - Segment{" "}
                  {s.chunk_sequence || 0}
                </p>
              </div>
              <span className="px-2 py-0.5 text-xs rounded bg-destructive text-destructive-foreground flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive-foreground animate-pulse" />
                LIVE
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}