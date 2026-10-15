import React, { useState, useRef, useEffect } from "react";
import { createSignaling } from "@/lib/signaling/createSignaling";
import { Video, Loader2, AlertCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function JoinFeed() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const [peerCount, setPeerCount] = useState(0);
  const videoRef = useRef(null);
  const pcRef = useRef({});
  const roomRef = useRef(null);
  const streamRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    const urlName = params.get("name");
    if (urlCode) setCode(urlCode.toUpperCase());
    if (urlName) setName(urlName);
  }, []);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

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
        room.send({ type: "join", name: name || "Team Member", role: "member" });
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
                <span className="text-xs text-white">{name || "You"} (live)</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Your camera is streaming to the host.{" "}
              {peerCount > 0 ? `${peerCount} peer(s) in session.` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}