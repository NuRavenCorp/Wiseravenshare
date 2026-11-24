import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import * as signalR from "@microsoft/signalr";
import Navbar from "@/components/landing/Navbar";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import StreamSummaryModal from "@/components/live/StreamSummaryModal";
import LiveNowCarousel from "@/components/live/LiveNowCarousel";
import LiveTvPlayer from "@/components/live/LiveTvPlayer";
import {
  Radio,
  Users,
  Send,
  Loader2,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Copy,
  Check,
  AlertCircle,
  Wifi,
  WifiOff,
  Tv,
  Share2,
  Pin,
  Trash2,
  ShieldBan,
  Clock,
  Sparkles,
  Camera,
  Monitor,
  Heart,
  UserPlus,
  UserCheck,
  Settings2,
  ChevronDown,
  Globe,
  Lock,
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
    .configureLogging(signalR.LogLevel.None)
    .build();
}

const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "🎉", "🎤", "🎶", "⭐"];
const GOLIVE_SESSION_STORAGE_KEY = "wiseravenshare_golive_session_v1";
const GOLIVE_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

function generateStreamId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const val = char === "x" ? rand : ((rand & 0x3) | 0x8);
    return val.toString(16);
  });
}

function loadGoLiveSessionSnapshot() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(GOLIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);
    if (!updatedAt || Date.now() - updatedAt > GOLIVE_SESSION_RETENTION_MS) {
      window.localStorage.removeItem(GOLIVE_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveGoLiveSessionSnapshot(snapshot) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      GOLIVE_SESSION_STORAGE_KEY,
      JSON.stringify({
        ...snapshot,
        updatedAt: Date.now(),
      })
    );
  } catch {
    // Best-effort persistence.
  }
}

// ── HLS Video Player ───────────────────────────────────────────────────────────
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
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
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
      className={`w-full rounded-xl bg-black object-contain ${className}`}
      style={{ minHeight: "240px" }}
    />
  );
}

// ── Flying Reactions Overlay ───────────────────────────────────────────────────
function FlyingReactions({ reactions }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="absolute bottom-12 text-3xl select-none animate-float-up filter drop-shadow-md"
          style={{ left: `${r.x}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

// ── Main GoLive Page Component ─────────────────────────────────────────────────
export default function GoLivePage() {
  const { roomId: paramRoomId } = useParams();
  const roomId = (paramRoomId || "MAIN").toUpperCase();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState("broadcast"); // "broadcast" | "viewer" | "tv"
  const [streamTitle, setStreamTitle] = useState("WiseRavenShare Live Stream");
  const [visibility, setVisibility] = useState("Public"); // Public | Followers | Private

  // Devices & Pre-Live Setup
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicId, setSelectedMicId] = useState("");
  const [facingMode, setFacingMode] = useState("user");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Broadcast controls
  const [camOn, setCamOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [recPhase, setRecPhase] = useState("idle"); // idle | starting | recording | uploading | done | error
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);
  const [summaryData, setSummaryData] = useState(null);
  const [activeStreamId, setActiveStreamId] = useState("");
  const activeRoomId = (activeStreamId || roomId).toUpperCase();

  // References
  const previewRef = useRef(null);
  const guestPreviewRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const currentStreamIdRef = useRef(null);
  const recTimerRef = useRef(null);
  const audioContextRef = useRef(null);

  // SignalR Hub & Live State
  const hubRef = useRef(null);
  const [hubReady, setHubReady] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [pinnedComment, setPinnedComment] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [flyingReactions, setFlyingReactions] = useState([]);
  const [slowModeSeconds, setSlowModeSeconds] = useState(0);
  const [activeGuest, setActiveGuest] = useState(null);
  const [guestJoinRequest, setGuestJoinRequest] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const chatEndRef = useRef(null);

  // HLS Viewer Mode
  const [hlsUrl, setHlsUrl] = useState("");
  const [hlsInput, setHlsInput] = useState("");

  // 1. Enumerate Media Devices (Camera & Microphones)
  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vDevices = devices.filter((d) => d.kind === "videoinput");
      const aDevices = devices.filter((d) => d.kind === "audioinput");
      setVideoDevices(vDevices);
      setAudioDevices(aDevices);

      if (vDevices.length > 0 && !selectedCameraId) {
        setSelectedCameraId(vDevices[0].deviceId);
      }
      if (aDevices.length > 0 && !selectedMicId) {
        setSelectedMicId(aDevices[0].deviceId);
      }
    } catch {
      /* ignore */
    }
  }, [selectedCameraId, selectedMicId]);

  // 2. Camera & Audio Stream Startup
  const startCamera = useCallback(
    async (overrideFacingMode = null, overrideVideoId = null, overrideAudioId = null) => {
      try {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        }

        const videoConstraints = overrideVideoId
          ? { deviceId: { exact: overrideVideoId } }
          : overrideFacingMode
          ? { facingMode: overrideFacingMode }
          : facingMode
          ? { facingMode }
          : true;

        const audioConstraints = overrideAudioId
          ? { deviceId: { exact: overrideAudioId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });

        mediaStreamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          previewRef.current.play().catch(() => {});
        }

        setCamOn(true);
        setIsScreenSharing(false);
        await enumerateDevices();

        // Audio Meter connection
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            const ctx = new AudioContext();
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const checkAudio = () => {
              if (!mediaStreamRef.current) return;
              analyser.getByteFrequencyData(dataArray);
              const max = Math.max(...dataArray);
              setAudioLevel(Math.min(100, Math.round((max / 255) * 100)));
              requestAnimationFrame(checkAudio);
            };
            requestAnimationFrame(checkAudio);
          }
        } catch {}
      } catch {
        toast({
          title: "Camera or Mic Unavailable",
          description: "Please check your browser permissions for camera and microphone.",
          variant: "destructive",
        });
      }
    },
    [facingMode, enumerateDevices, toast]
  );

  const stopCamera = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setCamOn(false);
    clearInterval(recTimerRef.current);
  }, []);

  // 3. Flip Front/Rear Camera (Mobile Web / Capacitor)
  const handleFlipCamera = async () => {
    const nextFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextFacing);
    await startCamera(nextFacing, null, selectedMicId);
  };

  // 4. Toggle Screen Share (Desktop)
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      await startCamera(facingMode, selectedCameraId, selectedMicId);
      setIsScreenSharing(false);
      return;
    }

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        toast({ title: "Screen share not supported on this browser.", variant: "destructive" });
        return;
      }
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // Retain microphone track if available
      if (mediaStreamRef.current) {
        const audioTracks = mediaStreamRef.current.getAudioTracks();
        if (audioTracks.length > 0 && screenStream.getAudioTracks().length === 0) {
          screenStream.addTrack(audioTracks[0]);
        }
      }

      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = screenStream;
      if (previewRef.current) {
        previewRef.current.srcObject = screenStream;
        previewRef.current.play().catch(() => {});
      }
      setIsScreenSharing(true);

      screenStream.getVideoTracks()[0].onended = () => {
        handleToggleScreenShare();
      };
    } catch {
      /* user canceled screen share */
    }
  };

  // 5. Toggle Mute & Camera
  const toggleMute = () => {
    if (!mediaStreamRef.current) return;
    const audioTracks = mediaStreamRef.current.getAudioTracks();
    audioTracks.forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMicMuted((prev) => !prev);
  };

  const toggleVideo = () => {
    if (!mediaStreamRef.current) return;
    const videoTracks = mediaStreamRef.current.getVideoTracks();
    videoTracks.forEach((t) => {
      t.enabled = !t.enabled;
    });
    setCamOn((prev) => !prev);
  };

  // 6. Connect SignalR GoLiveHub
  useEffect(() => {
    const hub = buildHub("/api/hubs/go-live");
    hubRef.current = hub;

    hub.on("ViewerCount", (count) => {
      setViewerCount(count);
      setPeakViewers((curr) => Math.max(curr, count));
    });

    hub.on("ViewerCountUpdated", (count) => {
      setViewerCount(count);
      setPeakViewers((curr) => Math.max(curr, count));
    });

    hub.on("ReceiveComment", (comment) => {
      setComments((prev) => [...prev.slice(-99), comment]);
    });

    hub.on("ReceiveMessage", (sender, message, ts) => {
      setComments((prev) => [
        ...prev.slice(-99),
        {
          id: `${Date.now()}-${Math.random()}`,
          username: sender,
          message,
          timestamp: ts,
        },
      ]);
    });

    hub.on("ReceiveReaction", (_sender, emoji) => {
      const id = `${Date.now()}-${Math.random()}`;
      const x = 15 + Math.random() * 70;
      setFlyingReactions((prev) => [...prev, { id, emoji, x }]);
      setTimeout(() => setFlyingReactions((prev) => prev.filter((r) => r.id !== id)), 2400);
    });

    hub.on("CommentPinned", (pinned) => {
      setPinnedComment(pinned);
    });

    hub.on("CommentDeleted", (commentId) => {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    });

    hub.on("UserBannedFromChat", (bannedUserId) => {
      setComments((prev) => prev.filter((c) => c.userId !== bannedUserId));
      toast({ title: "User banned from stream chat", variant: "destructive" });
    });

    hub.on("SlowModeUpdated", (seconds) => {
      setSlowModeSeconds(seconds);
      toast({ title: seconds > 0 ? `Slow mode set to ${seconds}s` : "Slow mode disabled" });
    });

    hub.on("CoHostRequested", (request) => {
      setGuestJoinRequest(request);
      toast({
        title: "Co-Host Request",
        description: `${request.username} requested to join your broadcast.`,
      });
    });

    hub.on("CoHostApproved", (data) => {
      toast({ title: "You are now co-hosting the live stream!" });
    });

    hub.on("CoHostJoined", (data) => {
      setActiveGuest(data);
    });

    hub.on("CoHostLeft", () => {
      setActiveGuest(null);
      toast({ title: "Co-host left the stream." });
    });

    hub
      .start()
      .then(() => {
        setHubReady(true);
        return hub.invoke("JoinRoom", activeRoomId);
      })
      .catch(() => setHubReady(false));

    hub.onreconnected(() => {
      setHubReady(true);
      hub.invoke("JoinRoom", activeRoomId).catch(() => {});
    });

    hub.onclose(() => setHubReady(false));

    return () => {
      hub.invoke("LeaveRoom", activeRoomId).catch(() => {}).finally(() => hub.stop());
    };
  }, [activeRoomId, toast]);

  // Initial preview start
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Restore GoLive draft/session state for up to 24 hours.
  useEffect(() => {
    const saved = loadGoLiveSessionSnapshot();
    if (!saved || saved.roomId !== roomId) return;

    if (typeof saved.streamTitle === "string" && saved.streamTitle.trim()) {
      setStreamTitle(saved.streamTitle);
    }
    if (typeof saved.visibility === "string" && saved.visibility.trim()) {
      setVisibility(saved.visibility);
    }
    if (typeof saved.mode === "string" && saved.mode.trim()) {
      setMode(saved.mode);
    }
    if (typeof saved.hlsInput === "string") {
      setHlsInput(saved.hlsInput);
    }
    if (typeof saved.hlsUrl === "string") {
      setHlsUrl(saved.hlsUrl);
    }
    if (typeof saved.activeStreamId === "string" && saved.activeStreamId.trim()) {
      currentStreamIdRef.current = saved.activeStreamId;
      setActiveStreamId(saved.activeStreamId);
    }
  }, [roomId]);

  // Persist GoLive draft/session state for up to 24 hours.
  useEffect(() => {
    saveGoLiveSessionSnapshot({
      roomId,
      streamTitle,
      visibility,
      mode,
      hlsInput,
      hlsUrl,
      activeStreamId,
    });
  }, [roomId, streamTitle, visibility, mode, hlsInput, hlsUrl, activeStreamId]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // 7. Go Live Start & Segmented Recording Handler
  const handleGoLive = async () => {
    if (!mediaStreamRef.current) {
      await startCamera();
    }

    let sId = generateStreamId();
    currentStreamIdRef.current = sId;
    setActiveStreamId(sId);
    chunksRef.current = [];
    setRecPhase("starting");

    try {
      const started = await apiClient.live.start(sId, {
        title: streamTitle.trim() || `Live — ${roomId}`,
        is_audio_only: false,
        visibility,
      });

      const canonicalId = started?.stream_id || started?.streamId || sId;
      sId = canonicalId;
      currentStreamIdRef.current = canonicalId;
      setActiveStreamId(canonicalId);

      toast({
        title: "Broadcast Started!",
        description: `You are now streaming live to WiseRavenShare (${visibility}).`,
      });
    } catch (e) {
      /* continue recording even if offline */
    }

    // MediaRecorder for automatic VOD chunk accumulation
    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const rec = new MediaRecorder(mediaStreamRef.current, { mimeType });
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        setRecPhase("uploading");
        const finishedStreamId = currentStreamIdRef.current;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType });
        const form = new FormData();
        form.append("file", blob, `recording-${finishedStreamId}.webm`);
        let recordingUpload = null;

        try {
          recordingUpload = await apiClient.requestJson(`/api/live/${encodeURIComponent(finishedStreamId)}/recording`, {
            method: "POST",
            body: form,
          });
        } catch {
          // Local fallback download if network dropped
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `wiseraven-golive-${finishedStreamId}.webm`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }

        // Call server end stream to get post-broadcast analytics
        try {
          const summary = await apiClient.live.end(finishedStreamId);
          setSummaryData({
            ...summary,
            playbackUrl:
              summary?.playbackUrl ||
              summary?.playback_url ||
              recordingUpload?.playback_url ||
              recordingUpload?.playbackUrl ||
              "",
          });
        } catch {
          setSummaryData({
            title: streamTitle,
            durationFormatted: `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`,
            peakViewers,
            totalComments: comments.length,
            totalReactions: flyingReactions.length,
            replayStatus: "VOD replay packaged for your feed.",
            playbackUrl: recordingUpload?.playback_url || recordingUpload?.playbackUrl || "",
          });
        }

        setRecPhase("done");
        setIsLive(false);
        setActiveStreamId("");
      };

      rec.start(5000); // 5-second chunks
      setIsLive(true);
      setRecPhase("recording");
      setElapsedSeconds(0);
      recTimerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } catch {
      toast({ title: "Failed to initiate stream recording", variant: "destructive" });
    }
  };

  // 8. End Broadcast
  const handleEndLive = async () => {
    clearInterval(recTimerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      setIsLive(false);
      setRecPhase("done");
      setActiveStreamId("");
      try {
        const summary = await apiClient.live.end(currentStreamIdRef.current || activeRoomId);
        setSummaryData(summary);
      } catch {}
    }
  };

  // 9. Send Chat & Reactions
  const handleSendChat = async (e) => {
    e?.preventDefault();
    const msg = chatInput.trim();
    if (!msg || !hubRef.current || !hubReady) return;
    setChatInput("");
    try {
      await hubRef.current.invoke("SendComment", activeRoomId, msg);
    } catch {
      /* ignore */
    }
  };

  const handleSendReaction = async (emoji) => {
    if (!hubRef.current || !hubReady) return;
    try {
      await hubRef.current.invoke("SendReaction", activeRoomId, emoji);
    } catch {
      /* ignore */
    }
  };

  // 10. Moderation Actions
  const handlePinComment = async (comment) => {
    try {
      await hubRef.current?.invoke("PinComment", activeRoomId, comment);
    } catch {}
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await hubRef.current?.invoke("DeleteComment", activeRoomId, commentId);
    } catch {}
  };

  const handleBanUser = async (targetUserId) => {
    if (!targetUserId) return;
    const confirm = window.confirm("Are you sure you want to mute this user from commenting?");
    if (!confirm) return;
    try {
      await hubRef.current?.invoke("BanUserFromStream", activeRoomId, targetUserId);
    } catch {}
  };

  // 11. Co-Host Actions
  const handleApproveGuest = async () => {
    if (!guestJoinRequest) return;
    try {
      const guestKey = `cohost_${generateStreamId().slice(0, 8)}`;
      await hubRef.current?.invoke(
        "ApproveCoHost",
        activeRoomId,
        guestJoinRequest.ConnectionId || guestJoinRequest.connectionId,
        guestKey
      );
      setActiveGuest({ guestStreamKey: guestKey, username: guestJoinRequest.Username });
      setGuestJoinRequest(null);
      toast({ title: `Approved ${guestJoinRequest.Username} as co-host!` });
    } catch {}
  };

  const handleRemoveGuest = async () => {
    if (!activeGuest) return;
    try {
      await hubRef.current?.invoke("RemoveCoHost", activeRoomId, activeGuest.guestStreamKey);
      setActiveGuest(null);
      toast({ title: "Co-host removed." });
    } catch {}
  };

  const handleRequestToJoin = async () => {
    try {
      await hubRef.current?.invoke("RequestToJoin", activeRoomId);
      toast({ title: "Request sent", description: "The broadcast host has been notified." });
    } catch {}
  };

  const copyShareLink = () => {
    const shareTarget = activeStreamId || roomId;
    const url = `${window.location.origin}/go-live/${encodeURIComponent(shareTarget)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedKey(true);
      toast({ title: "Stream link copied to clipboard!" });
      setTimeout(() => setCopiedKey(false), 2000);
    });
  };

  const formatTimer = (sec) =>
    `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <>
      {/* Float up animation for floating emoji reactions */}
      <style>{`
        @keyframes float-up {
          0%   { transform: translateY(0) scale(0.9); opacity: 1; }
          100% { transform: translateY(-220px) scale(1.5); opacity: 0; }
        }
        .animate-float-up { animation: float-up 2.2s ease-out forwards; }
      `}</style>

      <div className="min-h-screen bg-background">
        <Navbar />

        <main className="max-w-7xl mx-auto px-4 pt-20 pb-24 space-y-6">
          {/* Live Now Carousel Discovery Shelf */}
          <LiveNowCarousel />

          {/* Header & Modes Selector */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-border bg-card/60 backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shadow-inner">
                <Radio className="w-6 h-6 text-rose-500 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-heading text-2xl font-bold text-foreground">WiseRavenShare GoLive</h1>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-600 text-white tracking-widest uppercase shadow-sm">
                    {isLive ? "ON AIR" : "STUDIO"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Room: <span className="font-mono text-primary font-semibold">{roomId}</span> · Facebook Live architecture
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border ${
                  hubReady
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                }`}
              >
                {hubReady ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {hubReady ? "Real-time Connected" : "Connecting..."}
              </span>

              <div className="flex rounded-xl border border-border p-1 bg-secondary/30">
                <button
                  onClick={() => setMode("broadcast")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    mode === "broadcast"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" /> Studio
                </button>
                <button
                  onClick={() => setMode("viewer")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    mode === "viewer"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> Watch
                </button>
                <button
                  onClick={() => setMode("tv")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    mode === "tv"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Tv className="w-3.5 h-3.5 text-amber-400" /> TV Player
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={copyShareLink}
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? "Copied" : "Share Room"}
              </Button>
            </div>
          </div>

          {/* ── MODE 1: SMART TV LEAN-BACK PLAYER ─────────────────────────────── */}
          {mode === "tv" && (
            <LiveTvPlayer
              streamId={activeRoomId}
              hlsUrl={hlsUrl || `/api/live/${encodeURIComponent(activeRoomId)}/playback`}
              title={streamTitle}
              onExit={() => setMode("broadcast")}
            />
          )}

          {/* ── MODE 2 & 3: BROADCASTER STUDIO & WATCH VIEWER ──────────────────── */}
          {mode !== "tv" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ── VIDEO CANVAS (Host Studio & Co-Host) ───────────────────────── */}
              <div className="lg:col-span-2 space-y-4">
                <div className="relative aspect-video w-full rounded-2xl bg-black border border-border/90 overflow-hidden shadow-2xl flex items-center justify-center">
                  {/* Co-Host Split-Screen Video Grid */}
                  <div
                    className={`w-full h-full grid ${
                      activeGuest ? "grid-cols-2 divide-x divide-white/20" : "grid-cols-1"
                    } relative`}
                  >
                    {/* Host Preview / Stream */}
                    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
                      <video
                        ref={previewRef}
                        muted
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />

                      {!camOn && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-neutral-950">
                          <VideoOff className="w-12 h-12 opacity-40" />
                          <p className="text-sm font-medium">Camera is disabled</p>
                        </div>
                      )}
                    </div>

                    {/* Guest Co-Host Video Tile */}
                    {activeGuest && (
                      <div className="relative w-full h-full flex items-center justify-center bg-neutral-900 overflow-hidden">
                        <video
                          ref={guestPreviewRef}
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-semibold text-white">
                          Co-Host: @{activeGuest.username || "Guest"}
                        </div>
                        <button
                          onClick={handleRemoveGuest}
                          className="absolute top-3 right-3 px-2 py-1 rounded-md bg-red-600/90 hover:bg-red-600 text-[11px] font-bold text-white shadow-md cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Flying emoji reactions animation canvas */}
                  <FlyingReactions reactions={flyingReactions} />

                  {/* Top Overlay: Live Status, Timer & Viewers */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
                    <div className="flex items-center gap-2 pointer-events-auto">
                      {isLive ? (
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-600/90 backdrop-blur-md text-white text-xs font-bold tracking-wider shadow-lg">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          <span>LIVE</span>
                          <span className="opacity-40">•</span>
                          <span className="font-mono">{formatTimer(elapsedSeconds)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-muted-foreground text-xs font-medium border border-white/10">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          <span>PREVIEW SETUP</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-xs font-semibold border border-white/10 shadow-lg">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{viewerCount.toLocaleString()} watching</span>
                      </div>
                    </div>

                    {/* Visibility Badge */}
                    <div className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-xs flex items-center gap-1.5 border border-white/10">
                      {visibility === "Public" ? <Globe className="w-3 h-3 text-sky-400" /> : <Lock className="w-3 h-3 text-amber-400" />}
                      <span>{visibility}</span>
                    </div>
                  </div>

                  {/* Live Audio Level VU Indicator Bar */}
                  {camOn && (
                    <div className="absolute bottom-16 left-4 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full z-20 pointer-events-none">
                      <Mic className={`w-3.5 h-3.5 ${micMuted ? "text-red-400" : "text-emerald-400"}`} />
                      <div className="w-16 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-75 rounded-full"
                          style={{ width: `${micMuted ? 0 : audioLevel}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Bottom Interactive Broadcaster Controls Bar */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-2 z-20">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className={`p-2.5 rounded-full backdrop-blur-md border text-white transition-all shadow-md cursor-pointer ${
                          micMuted
                            ? "bg-red-600/80 border-red-500 text-white"
                            : "bg-black/70 border-white/15 hover:bg-black/90"
                        }`}
                        title={micMuted ? "Unmute Mic" : "Mute Mic"}
                      >
                        {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={toggleVideo}
                        className={`p-2.5 rounded-full backdrop-blur-md border text-white transition-all shadow-md cursor-pointer ${
                          !camOn
                            ? "bg-red-600/80 border-red-500 text-white"
                            : "bg-black/70 border-white/15 hover:bg-black/90"
                        }`}
                        title={camOn ? "Disable Camera" : "Enable Camera"}
                      >
                        {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={handleFlipCamera}
                        className="p-2.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-white hover:bg-black/90 transition-all shadow-md cursor-pointer"
                        title="Flip Camera (Front/Rear)"
                      >
                        <Camera className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleScreenShare}
                        className={`p-2.5 rounded-full backdrop-blur-md border text-white transition-all shadow-md cursor-pointer ${
                          isScreenSharing
                            ? "bg-primary border-primary"
                            : "bg-black/70 border-white/15 hover:bg-black/90"
                        }`}
                        title="Screen Share"
                      >
                        <Monitor className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Main Go Live / End Stream Action Button */}
                    <div className="flex items-center gap-2">
                      {!isLive ? (
                        <Button
                          onClick={handleGoLive}
                          disabled={recPhase === "starting"}
                          className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-6 py-2 rounded-xl shadow-lg shadow-rose-600/30 gap-2 cursor-pointer"
                        >
                          {recPhase === "starting" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                          Start Live Broadcast
                        </Button>
                      ) : (
                        <Button
                          onClick={handleEndLive}
                          variant="destructive"
                          className="font-bold px-6 py-2 rounded-xl shadow-lg gap-2 cursor-pointer"
                        >
                          <Radio className="w-4 h-4 animate-spin" /> End Stream
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Floating Quick Reaction Buttons for Viewers & Co-Hosts */}
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-card/60 backdrop-blur-sm">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-pink-500" /> Send Live Reaction:
                  </span>
                  <div className="flex items-center gap-2">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleSendReaction(emoji)}
                        className="text-lg hover:scale-125 transform transition-transform cursor-pointer select-none p-1"
                        title={`React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pre-Live Setup & Device Hardware Controls */}
                {!isLive && (
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-primary" /> Broadcast Setup & Device Selection
                      </h3>
                      <span className="text-xs text-muted-foreground">Pre-flight connection check</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="stream-title" className="text-xs font-medium">Broadcast Title</Label>
                        <Input
                          id="stream-title"
                          value={streamTitle}
                          onChange={(e) => setStreamTitle(e.target.value)}
                          placeholder="What are you streaming about?"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="visibility" className="text-xs font-medium">Audience Privacy</Label>
                        <select
                          id="visibility"
                          value={visibility}
                          onChange={(e) => setVisibility(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary"
                        >
                          <option value="Public">Public (Visible to everyone & feed)</option>
                          <option value="Followers">Followers Only</option>
                          <option value="Private">Private Test</option>
                        </select>
                      </div>

                      {videoDevices.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Select Camera Device</Label>
                          <select
                            value={selectedCameraId}
                            onChange={(e) => {
                              setSelectedCameraId(e.target.value);
                              startCamera(null, e.target.value, selectedMicId);
                            }}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                          >
                            {videoDevices.map((d) => (
                              <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {audioDevices.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Select Microphone Device</Label>
                          <select
                            value={selectedMicId}
                            onChange={(e) => {
                              setSelectedMicId(e.target.value);
                              startCamera(null, selectedCameraId, e.target.value);
                            }}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                          >
                            {audioDevices.map((d) => (
                              <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── LIVE INTERACTION & REAL-TIME CHAT PANEL ──────────────────── */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card flex flex-col h-[600px] shadow-sm overflow-hidden">
                  {/* Chat Header */}
                  <div className="px-4 py-3 border-b border-border/80 flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="font-heading font-semibold text-sm text-foreground">Live Room Chat</h3>
                    </div>
                    <span className="text-xs text-muted-foreground">{viewerCount} online</span>
                  </div>

                  {/* Co-Host Request Banner (for Host) */}
                  {guestJoinRequest && (
                    <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-bold text-amber-400">Co-Host Request</p>
                        <p className="text-muted-foreground">@{guestJoinRequest.Username} wants to join broadcast.</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" onClick={handleApproveGuest} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setGuestJoinRequest(null)} className="h-7 text-xs">
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Pinned Comment Banner */}
                  {pinnedComment && (
                    <div className="px-3.5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-start justify-between gap-2 text-xs">
                      <div className="flex items-start gap-2">
                        <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-amber-400">Pinned · @{pinnedComment.username || pinnedComment.sender}:</p>
                          <p className="text-foreground/90">{pinnedComment.message || pinnedComment.body}</p>
                        </div>
                      </div>
                      <button onClick={() => setPinnedComment(null)} className="text-muted-foreground hover:text-foreground">
                        ×
                      </button>
                    </div>
                  )}

                  {/* Comments Feed */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {comments.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground/60 space-y-2">
                        <Radio className="w-8 h-8 opacity-40" />
                        <p className="text-xs">Chat is quiet. Be the first to say hi!</p>
                      </div>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id || Math.random()} className="group rounded-xl p-2.5 bg-secondary/30 hover:bg-secondary/50 transition-colors text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-primary">@{c.username || c.sender || "Viewer"}</span>
                            {/* Host Moderation Tools */}
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handlePinComment(c)}
                                className="text-muted-foreground hover:text-amber-400 p-0.5 cursor-pointer"
                                title="Pin comment"
                              >
                                <Pin className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(c.id)}
                                className="text-muted-foreground hover:text-destructive p-0.5 cursor-pointer"
                                title="Delete comment"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                              {c.userId && (
                                <button
                                  type="button"
                                  onClick={() => handleBanUser(c.userId)}
                                  className="text-muted-foreground hover:text-destructive p-0.5 cursor-pointer"
                                  title="Mute user from chat"
                                >
                                  <ShieldBan className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-foreground leading-relaxed">{c.message || c.body}</p>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat Input & Viewer Request to Join */}
                  <div className="p-3 border-t border-border bg-card space-y-2">
                    {!isLive && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRequestToJoin}
                        className="w-full text-xs gap-1.5 rounded-xl border-dashed"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-primary" /> Request to Join as Co-Host
                      </Button>
                    )}

                    <form onSubmit={handleSendChat} className="flex gap-2">
                      <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Say something in live chat…"
                        className="text-xs h-9 rounded-xl"
                      />
                      <Button type="submit" size="sm" disabled={!chatInput.trim()} className="h-9 px-3 rounded-xl cursor-pointer">
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── Post-Stream Summary Modal ─────────────────────────────────────── */}
        {summaryData && (
          <StreamSummaryModal
            summary={summaryData}
            onClose={() => setSummaryData(null)}
            onGoToFeed={() => {
              setSummaryData(null);
              navigate("/social");
            }}
          />
        )}
      </div>
    </>
  );
}
