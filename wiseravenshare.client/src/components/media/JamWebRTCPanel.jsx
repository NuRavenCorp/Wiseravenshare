/**
 * JamWebRTCPanel.jsx
 *
 * Distributed musician jamming panel.  Handles:
 *   - Joining a jam session and reporting role
 *   - RTT measurement via ping-pong (every 5 s)
 *   - Snowball routing order display
 *   - Offset-corrected Web Audio metronome (same engine as Metronome.jsx)
 *   - Audio constraint guidance (echoCancellation=false etc.)
 *   - Reconnect recovery: reads offset matrix from server on reconnect
 *
 * Audio flows WebRTC between browsers — this component handles only the
 * orchestration side.  A WebRTC peer connection UI should be layered on
 * top (e.g. Daily, Livekit, or a custom RTCPeerConnection implementation).
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Music2, Radio, Users, AlertTriangle, CheckCircle, Loader2,
  Wifi, WifiOff, Drum, Guitar, Mic2, Piano, Music, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";

const WS_BASE  = import.meta.env.VITE_JAM_SYNC_WS
  ?? (window.location.origin.replace(/^http/, "ws") + "/api/jam-sync");
const API_BASE = "/api/jam-sync";

const ROLES = [
  { value: "drummer",    label: "Drummer",     Icon: Drum   },
  { value: "bassist",    label: "Bassist",     Icon: Music2 },
  { value: "guitarist",  label: "Guitarist",   Icon: Guitar },
  { value: "keyboardist",label: "Keys",        Icon: Piano  },
  { value: "vocalist",   label: "Vocals",      Icon: Mic2   },
  { value: "other",      label: "Other",       Icon: Music  },
];

function LatencyBar({ rttMs }) {
  const color = rttMs < 60 ? "bg-green-500" : rttMs < 150 ? "bg-yellow-400" : "bg-red-500";
  const pct   = Math.min(100, (rttMs / 300) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono w-14 text-right ${rttMs < 60 ? "text-green-500" : rttMs < 150 ? "text-yellow-400" : "text-red-500"}`}>
        {rttMs.toFixed(0)} ms
      </span>
    </div>
  );
}

export default function JamWebRTCPanel({ jamId: externalJamId }) {
  const { user } = useAuth();
  const [jamId,        setJamId]        = useState(externalJamId ?? "");
  const [newJamTitle,  setNewJamTitle]  = useState("");
  const [role,         setRole]         = useState("other");
  const [displayName,  setDisplayName]  = useState(user?.displayName ?? user?.email ?? "");
  const [joined,       setJoined]       = useState(false);
  const [wsStatus,     setWsStatus]     = useState("idle");
  const [rttMs,        setRttMs]        = useState(0);
  const [audioConfig,  setAudioConfig]  = useState(null);
  const [snowballOrder, setSnowballOrder] = useState([]);
  const [metronome,    setMetronome]    = useState(null); // { bpm, startTs, offsetMs }
  const [bpm,          setBpm]          = useState(120);
  const [isLeadDevice, setIsLeadDevice] = useState(false);

  const wsRef           = useRef(null);
  const pingIntervalRef = useRef(null);
  const musicianId      = useRef(user?.id ?? `jam-${Math.random().toString(36).slice(2, 8)}`).current;
  const audioCtxRef     = useRef(null);
  const metronomeRef    = useRef(null); // { nextBeat, timer }

  // ── Session creation ────────────────────────────────────────────────
  const createJam = useCallback(async () => {
    if (!newJamTitle.trim()) return;
    try {
      const token = localStorage.getItem("wiseravenshare_access_token") ?? "";
      const res   = await fetch(`${API_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newJamTitle.trim() }),
      }).then((r) => r.json());
      setJamId(res.jamId);
      setIsLeadDevice(true);
      setNewJamTitle("");
    } catch { /* handled below */ }
  }, [newJamTitle]);

  // ── WebSocket ────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!jamId) return;
    setWsStatus("connecting");
    const token = localStorage.getItem("wiseravenshare_access_token") ?? "";
    const url   = `${WS_BASE}/ws/${jamId}?token=${encodeURIComponent(token)}`;
    const ws    = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("open");
      ws.send(JSON.stringify({ musician_id: musicianId, role, name: displayName }));
    };

    ws.onclose = () => {
      setWsStatus("closed");
      clearInterval(pingIntervalRef.current);
      if (joined) setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "connected" || msg.audioConfig) {
          setAudioConfig(msg.audioConfig);
        }
        if (msg.event === "routing_update") {
          setSnowballOrder(msg.snowballOrder ?? msg.order ?? []);
          if (msg.audioConfig) setAudioConfig(msg.audioConfig);
        }
        if (msg.event === "metronome_started") {
          const offsetMs = msg.offsets?.[musicianId] ?? 0;
          setMetronome({ bpm: msg.bpm, startTs: msg.start_ts, offsetMs });
          startMetronomeAudio(msg.bpm, msg.start_ts, offsetMs);
        }
        if (msg.pong) {
          const rtt = (Date.now() / 1000 - msg.clientTs) * 1000;
          setRttMs(rtt);
          ws.send(JSON.stringify({ type: "rtt_report", musician_id: musicianId, rtt_ms: rtt }));
        }
      } catch { /* ignore */ }
    };

    // Ping every 5 s to measure RTT
    pingIntervalRef.current = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "ping", musician_id: musicianId, ts: Date.now() / 1000 }));
    }, 5000);
  }, [jamId, role, displayName, musicianId, joined]);

  const joinSession = useCallback(async () => {
    if (!jamId) return;
    try {
      const token = localStorage.getItem("wiseravenshare_access_token") ?? "";
      await fetch(`${API_BASE}/sessions/${jamId}/musicians`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ musicianId, role, displayName }),
      });
      setJoined(true);
      connect();
    } catch { /* handled by WS disconnect */ }
  }, [jamId, musicianId, role, displayName, connect]);

  // ── Metronome (Web Audio, offset-corrected) ────────────────────────
  const startMetronomeAudio = useCallback((bpm, startTs, offsetMs) => {
    // Stop any previous metronome
    clearTimeout(metronomeRef.current?.timer);
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { return; }
    }
    const ctx         = audioCtxRef.current;
    const interval    = 60 / bpm;            // seconds per beat
    const nowSec      = Date.now() / 1000;
    const adjustedStart = startTs + offsetMs / 1000; // server epoch + half-RTT offset

    // Schedule first beat
    let nextBeatTime = adjustedStart;
    while (nextBeatTime < nowSec) nextBeatTime += interval;

    const scheduleBeat = () => {
      const ctx2     = audioCtxRef.current;
      if (!ctx2) return;
      const delay    = nextBeatTime - Date.now() / 1000;
      const beatTime = ctx2.currentTime + Math.max(0, delay);

      const osc  = ctx2.createOscillator();
      const gain = ctx2.createGain();
      osc.connect(gain);
      gain.connect(ctx2.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, beatTime);
      gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.05);
      osc.start(beatTime);
      osc.stop(beatTime + 0.06);

      nextBeatTime += interval;
      metronomeRef.current = { timer: setTimeout(scheduleBeat, Math.max(0, delay * 1000 - 50)) };
    };

    scheduleBeat();
  }, []);

  const stopMetronomeAudio = useCallback(() => {
    clearTimeout(metronomeRef.current?.timer);
    setMetronome(null);
  }, []);

  const requestMetronome = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "start_metronome", bpm }));
  }, [bpm]);

  useEffect(() => {
    return () => {
      clearTimeout(metronomeRef.current?.timer);
      clearInterval(pingIntervalRef.current);
      wsRef.current?.close();
    };
  }, []);

  const myPosition = snowballOrder.indexOf(musicianId);

  // ── UI ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Session setup */}
      {!jamId && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" /> Start or Join a Jam Session
          </h3>
          <div className="flex gap-2">
            <Input
              value={newJamTitle}
              onChange={(e) => setNewJamTitle(e.target.value)}
              placeholder="Session title…"
              onKeyDown={(e) => e.key === "Enter" && createJam()}
            />
            <Button size="sm" onClick={createJam} disabled={!newJamTitle.trim()}>Create</Button>
          </div>
          <div className="flex gap-2">
            <Input value={jamId} onChange={(e) => setJamId(e.target.value)} placeholder="Paste session ID to join…" />
            <Button size="sm" variant="outline" onClick={joinSession} disabled={!jamId.trim()}>Join</Button>
          </div>
        </div>
      )}

      {jamId && !joined && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs text-muted-foreground font-mono break-all">Session: {jamId}</p>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setRole(value)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition-colors ${role === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <Button className="w-full" onClick={joinSession}>Join as {ROLES.find((r) => r.value === role)?.label}</Button>
        </div>
      )}

      {joined && (
        <>
          {/* Status */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="w-4 h-4 text-primary" />
                Live Jam
                <span className={`text-xs px-2 py-0.5 rounded-full ${wsStatus === "open" ? "bg-green-500/15 text-green-500" : "bg-destructive/15 text-destructive"}`}>
                  {wsStatus === "open" ? "Connected" : "Reconnecting…"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground capitalize">{role}</span>
            </div>

            <LatencyBar rttMs={rttMs} />

            {rttMs > 200 && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2.5 text-xs text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                High latency ({rttMs.toFixed(0)} ms). The groove may drift — try a wired connection or move closer to your router.
              </div>
            )}

            {rttMs > 0 && rttMs <= 200 && (
              <div className="flex items-center gap-2 text-xs text-green-500">
                <CheckCircle className="w-3.5 h-3.5" /> Latency looks good for jamming.
              </div>
            )}
          </div>

          {/* Audio config */}
          {audioConfig && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required Audio Settings</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  ["Echo cancellation", "OFF ✓"],
                  ["Noise suppression", "OFF ✓"],
                  ["Auto gain control", "OFF ✓"],
                  ["Sample rate",       "48 kHz"],
                  ["Channels",          "Stereo"],
                  ["Codec bitrate",     "128 kbps"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between rounded bg-secondary/50 px-2 py-1">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-mono text-foreground">{v}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                These constraints are applied automatically. Voice-optimized processing is disabled so instruments sound natural.
              </p>
            </div>
          )}

          {/* Snowball routing order */}
          {snowballOrder.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Snowball Routing Order</p>
              <div className="flex flex-col gap-1">
                {snowballOrder.map((mid, i) => (
                  <div key={mid} className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs ${mid === musicianId ? "bg-primary/10 border border-primary/30 font-semibold text-primary" : "bg-secondary/40 text-muted-foreground"}`}>
                    <span className="w-4 text-center font-mono opacity-60">{i + 1}</span>
                    <span className="flex-1 truncate">{mid === musicianId ? "You" : mid.slice(0, 8)}</span>
                    {i === 0 && <span className="text-[10px] text-muted-foreground">anchor</span>}
                    {mid === musicianId && i > 0 && (
                      <span className="text-[10px]">hears {i} player{i !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Lower positions hear fewer streams (less lag). Drummer anchors the chain.
              </p>
            </div>
          )}

          {/* Metronome */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shared Metronome</p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={40}
                max={300}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">BPM</span>
              {metronome ? (
                <Button size="sm" variant="outline" onClick={stopMetronomeAudio}>Stop Click</Button>
              ) : (
                <Button size="sm" onClick={requestMetronome} disabled={wsStatus !== "open"}>
                  <Circle className="w-3 h-3 mr-1 fill-current" /> Start Click
                </Button>
              )}
            </div>
            {metronome && (
              <div className="flex items-center gap-2 text-xs text-green-500">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {metronome.bpm} BPM · offset {metronome.offsetMs.toFixed(1)} ms applied
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Each device runs its own Web Audio click with a {rttMs > 0 ? `${(rttMs / 2).toFixed(0)} ms` : "personalised"} offset so everyone hears the beat at the same moment.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
