import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as signalR from "@microsoft/signalr";
import { apiClient } from "@/api/client";
import { Radio, Users, Play, Tv } from "lucide-react";

export default function LiveNowCarousel({ onSelectStream, className = "" }) {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchActiveStreams = useCallback(async () => {
    try {
      const active = await apiClient.live.active(12);
      setStreams(Array.isArray(active) ? active : []);
    } catch {
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveStreams();

    const token =
      (typeof window !== "undefined" &&
        (localStorage.getItem("wiseravenshare_access_token") || localStorage.getItem("token"))) ||
      "";

    const connection = new signalR.HubConnectionBuilder()
      .withUrl("/api/hubs/go-live", { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build();

    connection.on("StreamStarted", () => {
      fetchActiveStreams();
    });

    connection.on("StreamEnded", (endedStreamId) => {
      setStreams((prev) => prev.filter((s) => s.id !== endedStreamId && s.stream_id !== endedStreamId));
    });

    connection.on("ViewerCountUpdated", () => {
      // Periodic refresh of viewer counts
      fetchActiveStreams();
    });

    connection.start().catch(() => {});

    return () => {
      connection.stop().catch(() => {});
    };
  }, [fetchActiveStreams]);

  if (loading || streams.length === 0) {
    return null;
  }

  const handleStreamClick = (stream) => {
    if (typeof onSelectStream === "function") {
      onSelectStream(stream);
    } else {
      const streamId = stream.id || stream.stream_id;
      navigate(`/go-live/${encodeURIComponent(streamId)}`);
    }
  };

  return (
    <section className={`rounded-2xl border border-rose-500/30 bg-rose-950/15 p-4 backdrop-blur-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3.5 px-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
          </span>
          <h2 className="font-heading text-base font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-rose-500" /> Live Now on WiseRavenShare
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">
            {streams.length} active
          </span>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-rose-500/20 snap-x snap-mandatory">
        {streams.map((stream) => {
          const streamId = stream.id || stream.stream_id;
          const viewers = stream.viewer_count ?? stream.viewerCount ?? 0;
          const title = stream.title || "Live Stream";
          const streamer = stream.streamer_id || stream.host_user_id || "Creator";

          return (
            <button
              key={streamId}
              type="button"
              onClick={() => handleStreamClick(stream)}
              className="group shrink-0 snap-start w-72 text-left rounded-xl border border-border/80 bg-background/80 hover:border-rose-500/60 hover:bg-card/90 transition-all overflow-hidden focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm hover:shadow-md cursor-pointer"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-video w-full bg-black/60 overflow-hidden flex items-center justify-center">
                <img
                  src={`/api/live/${encodeURIComponent(streamId)}/thumbnail.jpg`}
                  alt={title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    // Fallback to stylized SVG poster
                    e.currentTarget.style.display = "none";
                  }}
                />

                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-bold tracking-wider shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </div>

                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-white text-[11px] font-medium shadow-md">
                  <Users className="w-3 h-3 text-rose-400" />
                  {viewers.toLocaleString()}
                </div>

                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 ml-0.5 fill-current" />
                  </div>
                </div>
              </div>

              {/* Title & Streamer */}
              <div className="p-3 space-y-1">
                <p className="font-heading text-sm font-semibold text-foreground truncate group-hover:text-rose-400 transition-colors">
                  {title}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">Host: @{String(streamer).slice(0, 14)}</span>
                  <span className="text-emerald-400 font-medium">Join Room →</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
