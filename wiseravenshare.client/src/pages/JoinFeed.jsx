import React, { useState, useRef, useEffect } from "react";
import { createSignaling } from "@/lib/signaling/createSignaling";
import { Video, Loader2, AlertCircle, LogOut, Radio, Crosshair, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function normalizeValue(value) {
  return (value || "").trim().toLowerCase();
}

export default function JoinFeed() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("camera");
  const [device, setDevice] = useState("Tablet / iPad");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const [peerCount, setPeerCount] = useState(0);
  const [studioState, setStudioState] = useState(null);
  const [directorNote, setDirectorNote] = useState(null);
  const videoRef = useRef(null);
  const pcRef = useRef({});
  const roomRef = useRef(null);
  const streamRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    const urlName = params.get("name");
    const urlRole = params.get("role");
    const urlDevice = params.get("device");
    if (urlCode) setCode(urlCode.toUpperCase());
    if (urlName) setName(urlName);
    if (urlRole) setRole(urlRole);
    if (urlDevice) setDevice(urlDevice);
  }, []);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  const normalizedIdentity = normalizeValue(name);
  const normalizedRole = normalizeValue(role);
  const normalizedDevice = normalizeValue(device);
  const feedAssignments = studioState?.feeds || [];
  const activeFeed = feedAssignments.find((feed) => {
    const feedName = normalizeValue(feed.displayName);
    const feedRole = normalizeValue(feed.role);
    const feedDevice = normalizeValue(feed.device);

    return (
      (normalizedIdentity && feedName && normalizedIdentity === feedName) ||
      (normalizedRole && normalizedDevice && normalizedRole === feedRole && normalizedDevice === feedDevice) ||
      (normalizedRole && normalizedRole === feedRole && !feedDevice)
    );
  });
  const isLiveTally = Boolean(
    studioState?.isRecording &&
      activeFeed?.isLive
  );
  const noteAppliesToCurrentUser = Boolean(
    !directorNote?.target ||
      normalizeValue(directorNote.target) === "all feeds" ||
      normalizeValue(directorNote.target) === normalizeValue(activeFeed?.slotLabel) ||
      normalizeValue(directorNote.target) === normalizedRole ||
      normalizeValue(directorNote.target) === normalizedIdentity
  );

  const handleOffer = async (peerId, offer) => {
    let pc = pcRef.current[peerId];
    if (!pc) {
      pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current[peerId] = pc;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, streamRef.current);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          roomRef.current?.send({
            type: "signal",
            target: peerId,
            signalType: "ice-candidate",
            data: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          pc.close();
          delete pcRef.current[peerId];
        }
      };
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    roomRef.current?.send({
      type: "signal",
      target: peerId,
      signalType: "answer",
      data: answer,
    });
  };

  const join = async () => {
    if (!code.trim()) {
      setError("Enter a session code.");
      return;
    }
    setError(null);
    setJoining(true);

    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (e) {
      setError("Could not access camera. Please allow camera and microphone permissions.");
      setJoining(false);
      return;
    }

    const connId = crypto.randomUUID();
    const room = createSignaling(code.trim().toUpperCase(), { id: connId });
    roomRef.current = room;

    const sub = room.subscribe(async (msg) => {
      if (msg.type === "welcome") {
        room.send({
          type: "join",
          name: name || "Team Member",
          role: role || "camera",
          device,
        });
        setJoined(true);
        setJoining(false);
      }

      if (msg.type === "error") {
        setError(msg.message || "Could not connect to the WebRTC session.");
        setJoining(false);
      }

      if (msg.type === "peers") {
        setPeerCount(msg.peers.length);
      }

      if (msg.type === "signal") {
        const { from, signalType, data } = msg;
        if (signalType === "offer") {
          await handleOffer(from, data);
        } else if (signalType === "ice-candidate") {
          const pc = pcRef.current[from];
          if (pc) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data));
            } catch {}
          }
        }
      }

      if (msg.type === "session-event") {
        if (msg.eventType === "studio-state") {
          setStudioState(msg.payload || null);
        }
        if (msg.eventType === "director-note") {
          setDirectorNote(msg.payload || null);
        }
      }
    });

    cleanupRef.current = () => {
      sub.unsubscribe();
      room.close();
      Object.values(pcRef.current).forEach((pc) => pc.close());
      pcRef.current = {};
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  };

  const leave = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setJoined(false);
    setPeerCount(0);
    setError(null);
    setStudioState(null);
    setDirectorNote(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {!joined ? (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-heading text-foreground">Join Video Feed</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the session code from your team host to share your camera as a live feed.
            </p>
            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="code">Session Code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="font-mono text-lg tracking-wider"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Camera 1"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="camera"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="device">Device</Label>
                <Input
                  id="device"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder="Tablet / iPad"
                />
              </div>
            </div>
            <Button onClick={join} disabled={joining} className="w-full">
              {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
              {joining ? "Connecting..." : "Join & Share Camera"}
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-foreground">Connected to {code}</span>
              </div>
              <Button variant="outline" size="sm" onClick={leave}>
                <LogOut className="w-4 h-4" /> Leave
              </Button>
            </div>
            <div className="relative rounded-lg overflow-hidden border border-border bg-black aspect-video">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 bg-black/60 rounded-full px-2 py-0.5">
                <span className="text-xs text-white">
                  {name || "You"} · {role || "camera"} · {device || "device"} (live)
                </span>
              </div>
              <div className="absolute left-2 bottom-2 flex items-center gap-2">
                <div
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    isLiveTally
                      ? "bg-red-500 text-white"
                      : "bg-black/60 text-white"
                  }`}
                >
                  {isLiveTally ? "LIVE TALLY" : "STANDBY"}
                </div>
                {activeFeed?.slotLabel && (
                  <div className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                    {activeFeed.slotLabel}
                  </div>
                )}
              </div>
              {studioState && (
                <div className="absolute top-2 right-2 max-w-[220px] rounded-lg bg-black/70 px-3 py-2 text-left">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                    Studio
                  </p>
                  <p className="text-sm text-white font-medium">
                    {studioState.isRecording ? "Recording live" : "Standing by"}
                  </p>
                  <p className="text-xs text-white/80 mt-1">
                    {studioState.activeSegmentTitle || "Awaiting active segment"}
                  </p>
                  {studioState.currentCue && (
                    <p className="text-xs text-primary-foreground mt-2 rounded bg-primary/70 px-2 py-1">
                      Cue: {studioState.currentCue}
                    </p>
                  )}
                  {studioState.shotPrompt && (
                    <p className="text-xs text-white/90 mt-2 rounded bg-white/10 px-2 py-1">
                      Shot: {studioState.shotPrompt}
                    </p>
                  )}
                </div>
              )}
              {directorNote?.text && noteAppliesToCurrentUser && (
                <div className="absolute inset-x-3 bottom-3 rounded-lg border border-primary/30 bg-black/75 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-primary/80">
                    Director note · {directorNote.target || "All feeds"}
                  </p>
                  <p className="text-sm text-white mt-1">{directorNote.text}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Your camera is streaming to the host.{" "}
              {peerCount > 0 ? `${peerCount} peer(s) in session.` : ""}
            </p>
            {(studioState || directorNote) && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Crew control overlay</p>
                  <span className="text-xs text-muted-foreground">
                    {studioState?.deliveryMode || "live"} mode
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Radio className="w-3.5 h-3.5" /> Tally
                    </p>
                    <p className={`font-medium ${isLiveTally ? "text-red-500" : "text-foreground"}`}>
                      {isLiveTally ? "You are live" : "Stand by"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Crosshair className="w-3.5 h-3.5" /> Shot prompt
                    </p>
                    <p className="text-foreground font-medium">
                      {studioState?.shotPrompt || activeFeed?.responsibility || "Awaiting direction"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-muted-foreground flex items-center gap-1">
                      <MonitorSmartphone className="w-3.5 h-3.5" /> Assigned slot
                    </p>
                    <p className="text-foreground font-medium">
                      {activeFeed?.slotLabel || studioState?.mainCamLabel || "Unassigned"}
                    </p>
                  </div>
                </div>
                {studioState && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md border border-border bg-card px-3 py-2">
                      <p className="text-muted-foreground">Recording</p>
                      <p className="text-foreground font-medium">
                        {studioState.isRecording ? "Live" : "Paused"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-card px-3 py-2">
                      <p className="text-muted-foreground">Segment</p>
                      <p className="text-foreground font-medium">
                        {studioState.activeSegmentTitle || "Waiting"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-card px-3 py-2">
                      <p className="text-muted-foreground">Cue</p>
                      <p className="text-foreground font-medium">
                        {studioState.cueNumber || 0}/{studioState.totalCues || 0}
                      </p>
                    </div>
                  </div>
                )}
                {directorNote?.text && noteAppliesToCurrentUser && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                    <p className="text-xs text-primary">
                      Latest direction from {directorNote.author || "director"}
                    </p>
                    <p className="text-sm text-foreground mt-1">{directorNote.text}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}