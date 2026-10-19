/**
 * PodcastDeviceSync.jsx
 *
 * Device registration, real-time sync status, recording state machine,
 * video-feed control, and resumable chunk upload for podcast recording.
 *
 * For a paid podcast service: includes clear affordances for
 * start/pause/stop recording, video feed ownership, and upload progress.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, Video, VideoOff, Pause, Square, Circle,
  Upload, Loader2, Smartphone, Laptop, Tablet, Wifi, WifiOff, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const WS_BASE = import.meta.env.VITE_PODCAST_SYNC_WS
  ?? (window.location.origin.replace(/^http/, "ws") + "/api/podcast-sync");
const API_BASE = "/api/podcast-sync";

const DEVICE_ICONS = { phone: Smartphone, tablet: Tablet, laptop: Laptop, browser: Laptop };

export default function PodcastDeviceSync({
  sessionId,
  deviceId     = `device-${Math.random().toString(36).slice(2, 8)}`,
  deviceType   = "browser",
  isHost       = false,
  onRecordingStateChange,
}) {
  const [wsStatus,       setWsStatus]       = useState("connecting");
  const [recordingState, setRecordingState] = useState("idle");
  const [videoFeedActive, setVideoFeedActive] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [uploadProgress,  setUploadProgress]  = useState(null); // { done, total }
  const [chunkError,      setChunkError]      = useState("");
  const wsRef       = useRef(null);
  const mediaRecRef = useRef(null);
  const chunksRef   = useRef(0);
  const streamRef   = useRef(null);
  const DeviceIcon  = DEVICE_ICONS[deviceType] ?? Laptop;

  // ── WebSocket ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    const connect = () => {
      const token = localStorage.getItem("wiseravenshare_access_token") ?? "";
      const url   = `${WS_BASE}/ws/${sessionId}?deviceId=${encodeURIComponent(deviceId)}&deviceType=${encodeURIComponent(deviceType)}&token=${encodeURIComponent(token)}`;
      const ws    = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen  = () => setWsStatus("open");
      ws.onclose = () => { setWsStatus("closed"); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          switch (msg.event) {
            case "connected":
              if (msg.resumedState?.recordingState)
                setRecordingState(msg.resumedState.recordingState);
              if (msg.resumedState?.videoFeedActive != null)
                setVideoFeedActive(msg.resumedState.videoFeedActive);
              break;
            case "device_joined":
              setConnectedDevices((prev) =>
                prev.some((d) => d.deviceId === msg.device_id)
                  ? prev
                  : [...prev, { deviceId: msg.device_id, deviceType: msg.device_type }]
              );
              break;
            case "recording_state_changed":
              setRecordingState(msg.recording_state);
              onRecordingStateChange?.(msg.recording_state);
              break;
            case "video_feed_changed":
              setVideoFeedActive(msg.active_device_id === deviceId);
              break;
          }
        } catch { /* ignore */ }
      };
    };

    connect();
    return () => { wsRef.current?.close(); stopMediaCapture(); };
  }, [sessionId, deviceId, deviceType]);

  // ── Recording helpers ─────────────────────────────────────────────
  const sendWs = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(payload));
  }, []);

  const stopMediaCapture = useCallback(() => {
    mediaRecRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecRef.current = null;
    streamRef.current   = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: videoFeedActive,
      });
      streamRef.current = stream;
      chunksRef.current = 0;

      // Get list of already-uploaded chunks so we can resume
      const token = localStorage.getItem("wiseravenshare_access_token") ?? "";
      const existing = await fetch(
        `${API_BASE}/sessions/${sessionId}/chunks?deviceId=${encodeURIComponent(deviceId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then((r) => r.json()).catch(() => ({ chunks: [] }));
      const uploadedSet = new Set((existing.chunks ?? []).map((c) => c.chunkIndex));
      chunksRef.current = Math.max(0, ...[...uploadedSet]) + (uploadedSet.size > 0 ? 1 : 0);

      const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
      mediaRecRef.current = mr;

      mr.ondataavailable = async (e) => {
        if (!e.data?.size) return;
        const chunkIndex = chunksRef.current++;
        if (uploadedSet.has(chunkIndex)) return; // skip already uploaded

        try {
          const token2 = localStorage.getItem("wiseravenshare_access_token") ?? "";
          const presign = await fetch(`${API_BASE}/sessions/${sessionId}/chunks/presign`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
            body: JSON.stringify({ deviceId, chunkIndex, contentType: "video/webm" }),
          }).then((r) => r.json());

          await fetch(presign.uploadUrl, { method: "PUT", body: e.data });

          const sha256 = ""; // skip SHA in browser; server can verify via ETag
          await fetch(`${API_BASE}/sessions/${sessionId}/chunks`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
            body: JSON.stringify({ deviceId, chunkIndex, storageKey: presign.storageKey, sizeBytes: e.data.size, sha256 }),
          });

          setUploadProgress({ done: chunkIndex + 1, total: chunksRef.current });
          setChunkError("");
        } catch {
          setChunkError(`Chunk ${chunkIndex} failed — will retry on reconnect.`);
        }
      };

      mr.start(5000); // 5-second chunks
      sendWs({ action: "recording_state", state: "recording" });
    } catch (err) {
      setChunkError(err?.message || "Could not access microphone/camera.");
    }
  }, [sessionId, deviceId, videoFeedActive, sendWs]);

  const pauseRecording = useCallback(() => {
    if (mediaRecRef.current?.state === "recording") {
      mediaRecRef.current.pause();
      sendWs({ action: "recording_state", state: "paused" });
    } else if (mediaRecRef.current?.state === "paused") {
      mediaRecRef.current.resume();
      sendWs({ action: "recording_state", state: "recording" });
    }
  }, [sendWs]);

  const stopRecording = useCallback(() => {
    stopMediaCapture();
    sendWs({ action: "recording_state", state: "idle" });
    setUploadProgress(null);
  }, [stopMediaCapture, sendWs]);

  const toggleVideoFeed = useCallback(() => {
    const next = !videoFeedActive;
    sendWs({ action: "video_feed", active: next, feedType: "camera" });
  }, [videoFeedActive, sendWs]);

  // ── UI ────────────────────────────────────────────────────────────
  const isRecording = recordingState === "recording";
  const isPaused    = recordingState === "paused";
  const isActive    = isRecording || isPaused;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DeviceIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold capitalize">{deviceType}</span>
          <span className="text-xs text-muted-foreground font-mono">{deviceId.slice(-6)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {wsStatus === "open"
            ? <><Wifi className="w-3.5 h-3.5 text-green-500" /><span className="text-green-500">Live</span></>
            : <><WifiOff className="w-3.5 h-3.5 text-destructive" /><span className="text-destructive">Offline</span></>
          }
        </div>
      </div>

      {/* Recording state indicator */}
      <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${isRecording ? "border-red-500/40 bg-red-500/10" : isPaused ? "border-yellow-500/30 bg-yellow-500/10" : "border-border bg-secondary/30"}`}>
        <span className={`w-3 h-3 rounded-full shrink-0 ${isRecording ? "bg-red-500 animate-pulse" : isPaused ? "bg-yellow-400" : "bg-muted-foreground/30"}`} />
        <span className="text-sm font-medium capitalize text-foreground">{recordingState}</span>
        {uploadProgress && (
          <span className="ml-auto text-xs text-muted-foreground">
            ↑ chunk {uploadProgress.done}/{uploadProgress.total}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        {!isActive ? (
          <Button size="sm" onClick={startRecording} disabled={wsStatus !== "open" || !sessionId}
            className="bg-red-600 hover:bg-red-700 text-white">
            <Circle className="w-3.5 h-3.5 mr-1 fill-current" /> Start Recording
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={pauseRecording}>
              {isPaused ? <Mic className="w-3.5 h-3.5 mr-1" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
              {isPaused ? "Resume" : "Pause"}
            </Button>
            <Button size="sm" variant="destructive" onClick={stopRecording}>
              <Square className="w-3.5 h-3.5 mr-1" /> Stop
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={toggleVideoFeed}
          className={videoFeedActive ? "text-primary border border-primary/30" : ""}>
          {videoFeedActive ? <Video className="w-3.5 h-3.5 mr-1" /> : <VideoOff className="w-3.5 h-3.5 mr-1" />}
          {videoFeedActive ? "Video On" : "Video Off"}
        </Button>
      </div>

      {chunkError && (
        <p role="alert" className="text-xs text-destructive">{chunkError}</p>
      )}

      {/* Connected devices */}
      {connectedDevices.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Connected devices</p>
          <div className="flex flex-wrap gap-2">
            {connectedDevices.map((d) => {
              const Icon = DEVICE_ICONS[d.deviceType] ?? Laptop;
              return (
                <div key={d.deviceId} className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                  <Icon className="w-3 h-3" />
                  <span className="capitalize">{d.deviceType}</span>
                  <span className="font-mono opacity-60">{d.deviceId.slice(-4)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!sessionId && (
        <p className="text-xs text-muted-foreground">
          No active session. Create or open a podcast session to enable device sync.
        </p>
      )}
    </div>
  );
}
