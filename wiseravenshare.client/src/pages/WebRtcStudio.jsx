import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/landing/Navbar";
import { useWebRTCHost } from "@/hooks/useWebRTCHost";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Link as LinkIcon, Radio, RefreshCw, Video, VideoOff, Wifi } from "lucide-react";

function generateSessionCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function RemoteStreamTile({ peer, stream }) {
  const videoId = `webrtc-stream-${peer.id}`;

  useEffect(() => {
    const element = document.getElementById(videoId);
    if (element && stream) {
      element.srcObject = stream;
    }
  }, [stream, videoId]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video bg-black">
        {stream ? (
          <video
            id={videoId}
            autoPlay
            playsInline
            muted={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <VideoOff className="h-8 w-8" />
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
          {peer.name || "Guest Camera"}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">{peer.name || "Guest Camera"}</p>
          <p className="text-xs text-muted-foreground">Role: {peer.role || "member"}</p>
        </div>
        <Badge variant={stream ? "default" : "secondary"}>{stream ? "Live" : "Connecting"}</Badge>
      </div>
    </div>
  );
}

export default function WebRtcStudio() {
  const [sessionCode, setSessionCode] = useState("");
  const [joinName, setJoinName] = useState("Camera 1");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const { peers, streams, connected, error } = useWebRTCHost(sessionCode);

  const remotePeers = useMemo(
    () => peers.filter((peer) => peer.role === "member"),
    [peers]
  );

  const joinLink = sessionCode
    ? `${window.location.origin}/join-feed?code=${encodeURIComponent(sessionCode)}&name=${encodeURIComponent(joinName || "Camera 1")}`
    : "";

  const startSession = () => {
    setSessionCode(generateSessionCode());
    setCopiedCode(false);
    setCopiedLink(false);
  };

  const stopSession = () => {
    setSessionCode("");
    setCopiedCode(false);
    setCopiedLink(false);
  };

  const regenerateSession = () => {
    setSessionCode(generateSessionCode());
    setCopiedCode(false);
    setCopiedLink(false);
  };

  const copyValue = async (value, setFlag) => {
    await navigator.clipboard.writeText(value);
    setFlag(true);
    window.setTimeout(() => setFlag(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-24">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-heading text-3xl text-foreground text-glow">WebRTC Studio</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Launch a peer-to-peer session, share the join link with contributors, and monitor
              incoming camera feeds in real time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? "default" : "secondary"}>
              {connected ? "Signaling connected" : "Waiting for signaling"}
            </Badge>
            <Badge variant={remotePeers.length > 0 ? "default" : "outline"}>
              {remotePeers.length} remote feed{remotePeers.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
          <div className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <Wifi className="h-4 w-4" />
                <AlertTitle>WebRTC signaling error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5 text-primary" />
                  Host controls
                </CardTitle>
                <CardDescription>
                  Start a session, share the code, and invite collaborators to publish their video feed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!sessionCode ? (
                  <Button onClick={startSession} className="w-full">
                    <Video className="h-4 w-4" />
                    Start WebRTC session
                  </Button>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="session-code">Session code</Label>
                      <div className="flex gap-2">
                        <Input
                          id="session-code"
                          readOnly
                          value={sessionCode}
                          className="font-mono text-lg tracking-[0.3em]"
                        />
                        <Button
                          variant="outline"
                          onClick={() => copyValue(sessionCode, setCopiedCode)}
                        >
                          <Copy className="h-4 w-4" />
                          {copiedCode ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="join-name">Suggested camera name</Label>
                      <Input
                        id="join-name"
                        value={joinName}
                        onChange={(event) => setJoinName(event.target.value)}
                        placeholder="Camera 1"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="join-link">Join link</Label>
                      <div className="flex gap-2">
                        <Input id="join-link" readOnly value={joinLink} />
                        <Button
                          variant="outline"
                          onClick={() => copyValue(joinLink, setCopiedLink)}
                        >
                          <LinkIcon className="h-4 w-4" />
                          {copiedLink ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Share this link or the session code. Guests can also open{" "}
                        <Link to="/join-feed" className="text-primary hover:underline">
                          Join Feed
                        </Link>{" "}
                        directly and enter the code manually.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={regenerateSession}>
                        <RefreshCw className="h-4 w-4" />
                        New code
                      </Button>
                      <Button variant="destructive" onClick={stopSession}>
                        <VideoOff className="h-4 w-4" />
                        Stop session
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-primary" />
                  Join instructions
                </CardTitle>
                <CardDescription>
                  Use any modern browser with camera and microphone access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>1. Open the join link on the contributor device.</p>
                <p>2. Enter a display name, then allow camera and microphone access.</p>
                <p>3. Keep the page open while the feed is live.</p>
                <Separator />
                <Alert>
                  <Wifi className="h-4 w-4" />
                  <AlertTitle>Connection note</AlertTitle>
                  <AlertDescription>
                    Peer-to-peer media quality depends on network reachability. If guests cannot connect,
                    confirm both sides can reach the API host and allow WebRTC traffic through their browser.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                Live remote feeds
              </CardTitle>
              <CardDescription>
                Connected contributors appear here as they join the session and publish their stream.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!sessionCode ? (
                <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                  Start a session to begin receiving remote WebRTC feeds.
                </div>
              ) : remotePeers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                  Waiting for guests to join the session and publish a camera feed.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {remotePeers.map((peer) => (
                    <RemoteStreamTile key={peer.id} peer={peer} stream={streams[peer.id]} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
