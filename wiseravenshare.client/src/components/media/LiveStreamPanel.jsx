import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import LiveStreamBroadcaster from "@/components/media/LiveStreamBroadcaster";
import LiveStreamViewer from "@/components/media/LiveStreamViewer";
import LiveFeed from "@/components/media/LiveFeed";
import { Radio, Plus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LiveStreamPanel() {
  const { user } = useAuth();
  const [mode, setMode] = useState("list");
  const [streams, setStreams] = useState([]);
  const [endedStreams, setEndedStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStream, setSelectedStream] = useState(null);
  const [expiryById, setExpiryById] = useState({});
  const [keepTextById, setKeepTextById] = useState({});
  const [keepBusyById, setKeepBusyById] = useState({});
  const [deleteBusyById, setDeleteBusyById] = useState({});

  const fetchStreams = async () => {
    try {
      const [liveRes, endedRes] = await Promise.all([
        apiClient.entities.LiveStream.filter(
          { status: "live" },
          { sort: "-created_date", limit: 50 }
        ),
        user?.id
          ? apiClient.entities.LiveStream.filter(
              { status: "ended", streamer_id: user.id },
              { sort: "-updated_date", limit: 20 }
            )
          : Promise.resolve({ items: [] }),
      ]);
      setStreams(liveRes.items || []);
      setEndedStreams(endedRes.items || []);
    } finally {
      setLoading(false);
    }
  };

  const refreshExpiry = async (streamId) => {
    if (!streamId || !user?.id) return;
    try {
      const expiry = await apiClient.live.expiry(streamId, user.id);
      setExpiryById((prev) => ({ ...prev, [streamId]: expiry }));
    } catch {
      // best-effort
    }
  };

  const refreshEndedExpiry = async (items) => {
    if (!user?.id || !Array.isArray(items) || !items.length) return;
    await Promise.all(items.map((item) => refreshExpiry(item.id)));
  };

  useEffect(() => {
    fetchStreams();
    const unsub = apiClient.entities.LiveStream.subscribe(() => fetchStreams());
    return unsub;
  }, [user?.id]);

  useEffect(() => {
    if (!endedStreams.length) return;
    void refreshEndedExpiry(endedStreams);
  }, [endedStreams, user?.id]);

  const formatRemaining = (secondsRemaining) => {
    if (typeof secondsRemaining !== "number") return "No expiry set";
    if (secondsRemaining <= 0) return "Expired";
    const days = Math.floor(secondsRemaining / 86400);
    const hours = Math.floor((secondsRemaining % 86400) / 3600);
    const minutes = Math.floor((secondsRemaining % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const keepStream = async (streamId) => {
    if (!streamId) return;
    setKeepBusyById((prev) => ({ ...prev, [streamId]: true }));
    try {
      await apiClient.live.keep(streamId);
      await refreshExpiry(streamId);
      await fetchStreams();
    } finally {
      setKeepBusyById((prev) => ({ ...prev, [streamId]: false }));
    }
  };

  const sendKeepMessage = async (streamId) => {
    const text = (keepTextById[streamId] || "").trim();
    if (!text) return;
    setKeepBusyById((prev) => ({ ...prev, [streamId]: true }));
    try {
      await apiClient.live.message(streamId, text);
      setKeepTextById((prev) => ({ ...prev, [streamId]: "" }));
      await refreshExpiry(streamId);
      await fetchStreams();
    } finally {
      setKeepBusyById((prev) => ({ ...prev, [streamId]: false }));
    }
  };

  const deleteStream = async (streamId, streamTitle) => {
    if (!streamId) return;
    const confirmed = window.confirm(`Delete "${streamTitle || "this live recording"}" and its stream files?`);
    if (!confirmed) return;

    setDeleteBusyById((prev) => ({ ...prev, [streamId]: true }));
    try {
      await apiClient.live.delete(streamId);
      setExpiryById((prev) => {
        const next = { ...prev };
        delete next[streamId];
        return next;
      });
      setKeepTextById((prev) => {
        const next = { ...prev };
        delete next[streamId];
        return next;
      });
      await fetchStreams();
    } finally {
      setDeleteBusyById((prev) => ({ ...prev, [streamId]: false }));
    }
  };

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
                  {s.is_audio_only ? "Audio" : "Video"}
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
      {user?.id && endedStreams.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Saved Live Recordings
            </span>
            <span className="text-xs text-muted-foreground">
              Auto-delete after 3 days unless kept
            </span>
          </div>
          <div className="space-y-3">
            {endedStreams.map((stream) => {
              const expiry = expiryById[stream.id];
              const kept = !!expiry?.kept_permanently;
              const urgent = !!expiry?.in_reminder_window;
              const busy = !!keepBusyById[stream.id];
              const deleting = !!deleteBusyById[stream.id];
              return (
                <div key={stream.id} className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-foreground font-medium">{stream.title}</p>
                      <p className={`text-xs ${kept ? "text-green-500" : urgent ? "text-amber-500" : "text-muted-foreground"}`}>
                        {kept
                          ? "Kept permanently"
                          : `Auto-deletes in ${formatRemaining(expiry?.seconds_remaining)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant={kept ? "outline" : "default"} onClick={() => keepStream(stream.id)} disabled={busy || deleting || kept}>
                        {kept ? "Kept" : busy ? "Saving..." : "Keep"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteStream(stream.id, stream.title)}
                        disabled={busy || deleting}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deleting ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                  {!kept && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={keepTextById[stream.id] || ""}
                        onChange={(e) =>
                          setKeepTextById((prev) => ({ ...prev, [stream.id]: e.target.value }))
                        }
                        placeholder='Type "keep" to save permanently'
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                      />
                      <Button size="sm" variant="outline" onClick={() => sendKeepMessage(stream.id)} disabled={busy || deleting || !(keepTextById[stream.id] || "").trim()}>
                        Send
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}