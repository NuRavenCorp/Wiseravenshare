import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Hls from "hls.js";
import * as signalR from "@microsoft/signalr";
import Navbar from "@/components/landing/Navbar";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Radio, Users, Send, Loader2, Video, VideoOff,
  Mic, MicOff, Copy, Check, AlertCircle, Wifi, WifiOff,
  Save, ExternalLink, Clock,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────
function readToken() {
  if (typeof window === "undefined") return "";
  return (
    window.localStorage.getItem("wiseravenshare_access_token") ||
    window.localStorage.getItem("token") ||
    ""
  );
}

function buildHub(path) {
  return new signalR.HubConnectionBuilder()
    .withUrl(path, { accessTokenFactory: readToken })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build();
}

const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "🎉", "🎤", "🎶", "⭐"];

// ── HLS Video ──────────────────────────────────────────────────────────────────
function HlsVideo({ src, className = "" }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => { hls.destroy(); hlsRef.current = null; };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    }
  }, [src]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      playsInline
      className={`w-full rounded-lg bg-black ${className}`}
      style={{ minHeight: "200px" }}
    />
  );
}

// ── Flying reaction ────────────────────────────────────────────────────────────
function FlyingReactions({ reactions }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="absolute bottom-16 text-3xl select-none animate-float-up"
          style={{ left: `${r.x}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GoLivePage() {
  const { roomId: paramRoomId } = useParams();
  const roomId = (paramRoomId || "MAIN").toUpperCase();
  const { user } = useAuth();

  const [mode, setMode] = useState("viewer"); // "viewer" | "broadcast"

  // HLS viewer
  const [hlsUrl, setHlsUrl] = useState("");
  const [hlsInput, setHlsInput] = useState("");

  // Broadcaster
  const previewRef = useRef(null);
  const mediaStreamRef = useRef(null);      // getUserMedia stream
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);             // accumulated blobs for upload
  const currentStreamIdRef = useRef(null);  // server stream ID
  const [camOn, setCamOn] = useState(false);
  const [recPhase, setRecPhase] = useState("idle"); // idle|starting|recording|uploading|done|error
  const [recSeconds, setRecSeconds] = useState(0);
  const recTimerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [savedStreamId, setSavedStreamId] = useState(null);  // after upload succeeds
  const [uploadErr, setUploadErr] = useState("");
  const [keptPermanent, setKeptPermanent] = useState(false);

  // Chat
  const chatHubRef = useRef(null);
  const [chatReady, setChatReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);

  // Reactions
  const liveHubRef = useRef(null);
  const [liveReady, setLiveReady] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [flyingReactions, setFlyingReactions] = useState([]);

  // ── SignalR: live-chat hub ─────────────────────────────────────────────────
  useEffect(() => {
    const hub = buildHub("/api/hubs/live-chat");
    chatHubRef.current = hub;

    hub.on("ReceiveMessage", (sender, body, ts) => {
      setMessages((prev) => [
        ...prev.slice(-199),
        { id: `${Date.now()}-${Math.random()}`, sender, body, ts },
      ]);
    });

    hub.start()
      .then(() => {
        setChatReady(true);
        return hub.invoke("JoinRoom", roomId);
      })
      .catch(() => setChatReady(false));

    hub.onreconnected(() => {
      setChatReady(true);
      hub.invoke("JoinRoom", roomId).catch(() => {});
    });
    hub.onclose(() => setChatReady(false));

    return () => { hub.stop(); };
  }, [roomId]);

  // ── SignalR: go-live hub ───────────────────────────────────────────────────
  useEffect(() => {
    const hub = buildHub("/api/hubs/go-live");
    liveHubRef.current = hub;

    hub.on("ViewerCount", (count) => setViewerCount(count));
    hub.on("ReceiveReaction", (_sender, emoji) => {
      const id = `${Date.now()}-${Math.random()}`;
      const x = 10 + Math.random() * 80;
      setFlyingReactions((prev) => [...prev, { id, emoji, x }]);
      setTimeout(() => setFlyingReactions((prev) => prev.filter((r) => r.id !== id)), 2500);
    });

    hub.start()
      .then(() => {
        setLiveReady(true);
        return hub.invoke("JoinRoom", roomId);
      })
      .catch(() => setLiveReady(false));

    hub.onreconnected(() => {
      setLiveReady(true);
      hub.invoke("JoinRoom", roomId).catch(() => {});
    });
    hub.onclose(() => setLiveReady(false));

    return () => {
      hub.invoke("LeaveRoom", roomId).catch(() => {}).finally(() => hub.stop());
    };
  }, [roomId]);

  // ── Auto-scroll chat ───────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send chat message ──────────────────────────────────────────────────────
  const sendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || !chatHubRef.current || !chatReady) return;
    setChatInput("");
    try {
      await chatHubRef.current.invoke("SendMessage", roomId, msg);
    } catch { /* ignore */ }
  }, [chatInput, chatReady, roomId]);

  // ── Send reaction ──────────────────────────────────────────────────────────
  const sendReaction = useCallback(async (emoji) => {
    if (!liveHubRef.current || !liveReady) return;
    try {
      await liveHubRef.current.invoke("SendReaction", roomId, emoji);
    } catch { /* ignore */ }
  }, [liveReady, roomId]);

  // ── Broadcaster: camera ────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => {});
      }
      setCamOn(true);
    } catch {
      alert("Could not access camera/microphone. Check browser permissions.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setCamOn(false);
    clearInterval(recTimerRef.current);
  }, []);

  // ── Broadcaster: start recording + stream ─────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!mediaStreamRef.current) return;

    const sId = `wrs-${roomId.toLowerCase()}-${Date.now()}`;
    currentStreamIdRef.current = sId;
    chunksRef.current = [];
    setUploadErr("");
    setSavedStreamId(null);
    setKeptPermanent(false);
    setRecPhase("starting");

    try {
      await apiClient.live.start(sId, { title: `Go Live — ${roomId}`, is_audio_only: false });
    } catch { /* non-fatal; recording still works */ }

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const rec = new MediaRecorder(mediaStreamRef.current, { mimeType });
    recorderRef.current = rec;

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    rec.onstop = async () => {
      setRecPhase("uploading");
      const sId = currentStreamIdRef.current;
      const mimeUsed = rec.mimeType || mimeType;

      // Upload full recording to server
      const blob = new Blob(chunksRef.current, { type: mimeUsed });
      const form = new FormData();
      form.append("file", blob, `recording-${sId}.webm`);

      try {
        await apiClient.requestJson(`/api/live/${encodeURIComponent(sId)}/recording`, {
          method: "POST",
          body: form,
        });
        setSavedStreamId(sId);
        setUploadErr("");
      } catch (err) {
        setUploadErr(err?.message || "Upload failed — recording saved locally as fallback.");
        // Fallback: trigger browser download so the recording is not lost
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `golive-${sId}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      // Always end the stream on server
      try { await apiClient.live.end(sId); } catch { /* ignore */ }

      setRecPhase("done");
    };

    rec.start(5000); // collect 5-second chunks
    setRecPhase("recording");
    setRecSeconds(0);
    recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
  }, [roomId]);

  const stopRecording = useCallback(() => {
    clearInterval(recTimerRef.current);
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const keepRecording = useCallback(async () => {
    if (!savedStreamId) return;
    try {
      await apiClient.live.keep(savedStreamId);
      setKeptPermanent(true);
    } catch { /* ignore */ }
  }, [savedStreamId]);

  useEffect(() => () => {
    clearInterval(recTimerRef.current);
    stopCamera();
  }, [stopCamera]);

  const copyStreamKey = () => {
    const key = `wrs-${roomId.toLowerCase()}-${(user?.id || "live").slice(0, 8)}`;
    navigator.clipboard.writeText(key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const recFmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Connection badge ───────────────────────────────────────────────────────
  const ConnBadge = ({ ready }) => (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ready ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}`}>
      {ready ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {ready ? "Live" : "Connecting…"}
    </span>
  );

  return (
    <>
      {/* Float-up animation */}
      <style>{`
        @keyframes float-up {
          0%   { transform: translateY(0)   scale(1);   opacity: 1; }
          100% { transform: translateY(-160px) scale(1.4); opacity: 0; }
        }
        .animate-float-up { animation: float-up 2.4s ease-out forwards; }
      `}</style>

      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 pt-20 pb-24">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Radio className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h1 className="font-heading text-2xl text-foreground flex items-center gap-2">
                  Go Live <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-normal">LIVE</span>
                </h1>
                <p className="text-xs text-muted-foreground">Room: {roomId}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ConnBadge ready={chatReady && liveReady} />
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="w-4 h-4" /> {viewerCount}
              </span>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {["viewer", "broadcast"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 text-xs capitalize transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                  >
                    {m === "viewer" ? "👁 Watch" : "🔴 Broadcast"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* ── Video / Camera column ─────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-3 relative">
              {mode === "viewer" ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={hlsInput}
                      onChange={(e) => setHlsInput(e.target.value)}
                      placeholder="Paste HLS stream URL (.m3u8)…"
                      className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <Button size="sm" onClick={() => setHlsUrl(hlsInput.trim())} disabled={!hlsInput.trim()}>
                      Watch
                    </Button>
                  </div>

                  {hlsUrl ? (
                    <div className="relative">
                      <HlsVideo src={hlsUrl} />
                      <FlyingReactions reactions={flyingReactions} />
                    </div>
                  ) : (
                    <div className="relative aspect-video bg-secondary/30 rounded-lg border border-border flex flex-col items-center justify-center gap-3">
                      <Radio className="w-12 h-12 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">Enter an HLS stream URL above to start watching</p>
                      <p className="text-xs text-muted-foreground/60">OBS → Settings → Stream → Custom → rtmp://your-server:1935/live/</p>
                      <FlyingReactions reactions={flyingReactions} />
                    </div>
                  )}
                </div>
              ) : (
                /* Broadcaster */
                <div className="space-y-3">
                  <div className="relative aspect-video bg-black rounded-lg border border-border overflow-hidden">
                    <video ref={previewRef} muted playsInline className="w-full h-full object-cover" />
                    {!camOn && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <VideoOff className="w-10 h-10 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Camera off</p>
                      </div>
                    )}
                    {recPhase === "recording" && (
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        REC {recFmt(recSeconds)}
                      </div>
                    )}
                    {recPhase === "uploading" && (
                      <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm text-white">Saving recording to server…</p>
                      </div>
                    )}
                    <FlyingReactions reactions={flyingReactions} />
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap gap-2">
                    {!camOn ? (
                      <Button onClick={startCamera} className="gap-1.5" disabled={recPhase === "uploading"}>
                        <Video className="w-4 h-4" /> Start Camera
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={stopCamera} disabled={recPhase === "recording" || recPhase === "uploading"} className="gap-1.5">
                        <VideoOff className="w-4 h-4" /> Stop Camera
                      </Button>
                    )}
                    {camOn && (recPhase === "idle" || recPhase === "done" || recPhase === "error") && (
                      <Button onClick={startRecording} variant="destructive" className="gap-1.5">
                        <Mic className="w-4 h-4" /> Start Recording
                      </Button>
                    )}
                    {recPhase === "recording" && (
                      <Button onClick={stopRecording} variant="outline" className="gap-1.5 border-red-500 text-red-500 hover:bg-red-500/10">
                        <MicOff className="w-4 h-4" /> Stop &amp; Save
                      </Button>
                    )}
                    {recPhase === "starting" && (
                      <Button disabled className="gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Starting…</Button>
                    )}
                  </div>

                  {/* Upload error */}
                  {uploadErr && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{uploadErr}</span>
                    </div>
                  )}

                  {/* Post-recording: saved recording info */}
                  {recPhase === "done" && savedStreamId && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-400">
                        <Check className="w-4 h-4" /> Recording saved to server
                      </div>
                      <div className="space-y-2 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-1">Playback URL</p>
                          <div className="flex gap-2">
                            <code className="flex-1 bg-secondary/50 px-2 py-1.5 rounded font-mono truncate">
                              /api/live/{savedStreamId}/playback
                            </code>
                            <a
                              href={`/api/live/${savedStreamId}/playback`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <Button size="sm" variant="outline" className="gap-1">
                                <ExternalLink className="w-3.5 h-3.5" /> Watch
                              </Button>
                            </a>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!keptPermanent ? (
                            <Button size="sm" onClick={keepRecording} className="gap-1.5">
                              <Save className="w-3.5 h-3.5" /> Keep Permanently
                            </Button>
                          ) : (
                            <span className="flex items-center gap-1.5 text-green-400 text-xs">
                              <Check className="w-3.5 h-3.5" /> Kept permanently
                            </span>
                          )}
                          {!keptPermanent && (
                            <span className="flex items-center gap-1 text-muted-foreground text-xs">
                              <Clock className="w-3 h-3" /> Expires in 72 h if not kept
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* RTMP info */}
                  <details className="rounded-lg border border-border bg-card/60 p-4">
                    <summary className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      Stream via OBS / RTMP (advanced)
                    </summary>
                    <div className="mt-3 space-y-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">RTMP Server URL</p>
                        <code className="block bg-secondary/50 px-3 py-2 rounded text-xs font-mono">rtmp://your-server:1935/live/</code>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Stream Key</p>
                        <div className="flex gap-2">
                          <code className="flex-1 bg-secondary/50 px-3 py-2 rounded text-xs font-mono truncate">
                            wrs-{roomId.toLowerCase()}-{(user?.id || "live").slice(0, 8)}
                          </code>
                          <Button size="sm" variant="outline" onClick={copyStreamKey} className="gap-1 shrink-0">
                            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {/* Reaction bar */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    disabled={!liveReady}
                    className="text-2xl hover:scale-125 transition-transform disabled:opacity-40 active:scale-110"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Chat column ───────────────────────────────────────────── */}
            <div className="flex flex-col h-[600px] rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <span className="text-sm font-medium">Live Chat</span>
                <ConnBadge ready={chatReady} />
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center mt-8">No messages yet. Say hello!</p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className="text-sm">
                    <span className="font-medium text-primary">{m.sender}: </span>
                    <span className="text-foreground break-words">{m.body}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2 px-3 py-3 border-t border-border shrink-0">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value.slice(0, 200))}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  disabled={!chatReady}
                  placeholder={chatReady ? "Send a message…" : "Connecting…"}
                  maxLength={200}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                <Button size="icon" onClick={sendChat} disabled={!chatInput.trim() || !chatReady}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
