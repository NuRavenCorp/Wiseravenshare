import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import * as signalR from "@microsoft/signalr";
import { Radio, Users, MessageSquare, Maximize, Minimize, ArrowLeft } from "lucide-react";

export default function LiveTvPlayer({ streamId, hlsUrl, title, onExit }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [showChat, setShowChat] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 1. Setup Low-Latency HLS stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    let hlsInstance = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 5,
        enableWorker: true,
      });
      hlsInstance = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [hlsUrl]);

  // 2. Setup SignalR connection for TV viewers
  useEffect(() => {
    if (!streamId) return;

    const token =
      (typeof window !== "undefined" &&
        (localStorage.getItem("wiseravenshare_access_token") || localStorage.getItem("token"))) ||
      "";

    const connection = new signalR.HubConnectionBuilder()
      .withUrl("/api/hubs/go-live", { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build();

    connection.on("ViewerCount", setViewerCount);
    connection.on("ViewerCountUpdated", setViewerCount);
    connection.on("ReceiveComment", (msg) => {
      setComments((prev) => [...prev.slice(-24), msg]);
    });
    connection.on("ReceiveMessage", (sender, body, ts) => {
      setComments((prev) => [
        ...prev.slice(-24),
        { id: `${Date.now()}-${Math.random()}`, username: sender, message: body, timestamp: ts },
      ]);
    });

    connection
      .start()
      .then(() => connection.invoke("JoinRoom", streamId))
      .catch(() => {});

    return () => {
      connection.invoke("LeaveRoom", streamId).catch(() => {}).finally(() => connection.stop());
    };
  }, [streamId]);

  // 3. D-Pad remote key handling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowRight" || e.key === "c" || e.key === "C") {
        setShowChat((prev) => !prev);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "Escape" && onExit) {
        onExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[85vh] min-h-[500px] bg-black rounded-2xl overflow-hidden select-none border border-border shadow-2xl"
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        autoPlay
        playsInline
        controls
      />

      {/* Top Left Live Banner */}
      <div className="absolute top-5 left-5 flex items-center gap-3 bg-black/75 backdrop-blur-md px-4 py-2 rounded-full text-white border border-white/10 shadow-lg z-20">
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
        </span>
        <span className="font-heading font-bold text-sm tracking-widest text-red-400">LIVE TV</span>
        <span className="text-white/40">|</span>
        <span className="font-semibold text-sm max-w-sm truncate">{title || "WiseRavenShare Live"}</span>
        <span className="text-white/40">|</span>
        <span className="flex items-center gap-1 text-xs text-white/80 font-medium">
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          {viewerCount.toLocaleString()} watching
        </span>
      </div>

      {/* Top Right Controls */}
      <div className="absolute top-5 right-5 flex items-center gap-2 z-20">
        <button
          type="button"
          onClick={() => setShowChat((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border transition-all ${
            showChat ? "bg-white/20 text-white border-white/30" : "bg-black/60 text-white/70 border-white/10 hover:text-white"
          }`}
          title="Toggle Chat (Press -> or C)"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat {showChat ? "On" : "Off"}</span>
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2 rounded-full bg-black/60 text-white/70 hover:text-white border border-white/10 backdrop-blur-md transition-colors"
          title="Fullscreen (F)"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>

        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold backdrop-blur-md transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Exit TV Mode
          </button>
        )}
      </div>

      {/* Right Edge Translucent Chat Ticker */}
      {showChat && (
        <aside className="absolute top-20 right-5 bottom-16 w-80 md:w-96 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-4 flex flex-col justify-end text-white shadow-2xl z-20 animate-in slide-in-from-right-4 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-bold uppercase tracking-wider text-white/60">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-primary" /> Live Chat Ticker
            </span>
            <span className="text-[10px] text-white/40">Remote: Press → to hide</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[380px] scrollbar-none pr-1">
            {comments.length === 0 ? (
              <p className="text-xs text-white/50 italic py-4 text-center">Chat ticker waiting for comments...</p>
            ) : (
              comments.map((c) => (
                <div key={c.id || Math.random()} className="text-xs leading-relaxed bg-white/5 rounded-lg p-2 border border-white/5">
                  <span className="font-bold text-sky-400 mr-1.5">@{c.username || c.sender || "Viewer"}:</span>
                  <span className="text-white/90">{c.message || c.body}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
