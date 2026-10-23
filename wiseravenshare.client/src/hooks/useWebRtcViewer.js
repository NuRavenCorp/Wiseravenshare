import { useCallback, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { resolveApiUrl } from "@/api/client";
import { createPeerId, getIceServersAsync } from "@/lib/webrtcConfig";

export function useWebRtcViewer() {
  const hubRef = useRef(null);
  const roomIdRef = useRef("");
  const peerIdRef = useRef("");
  const broadcasterPeerRef = useRef(null);
  const broadcasterPeerIdRef = useRef("");
  const candidateQueueRef = useRef([]);
  const [connected, setConnected] = useState(false);

  const cleanupPeer = useCallback(() => {
    if (!broadcasterPeerRef.current) return;
    try {
      broadcasterPeerRef.current.ontrack = null;
      broadcasterPeerRef.current.onicecandidate = null;
      broadcasterPeerRef.current.close();
    } catch {
      // noop
    }
    broadcasterPeerRef.current = null;
    broadcasterPeerIdRef.current = "";
    candidateQueueRef.current = [];
  }, []);

  const flushIceQueue = useCallback(async () => {
    if (!broadcasterPeerRef.current || !broadcasterPeerRef.current.remoteDescription) return;
    const pending = candidateQueueRef.current;
    candidateQueueRef.current = [];
    for (const candidate of pending) {
      try {
        await broadcasterPeerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore stale ICE
      }
    }
  }, []);

  const createViewerPeer = useCallback(async (broadcasterPeerId, onRemoteStream) => {
    const roomId = roomIdRef.current;
    const hub = hubRef.current;
    if (!hub || !roomId) return null;

    cleanupPeer();
    broadcasterPeerIdRef.current = broadcasterPeerId;
    const iceServers = await getIceServersAsync();
    const peer = new RTCPeerConnection({ iceServers });
    broadcasterPeerRef.current = peer;

    peer.ontrack = (event) => {
      const remote = event.streams?.[0];
      if (remote) {
        onRemoteStream?.(remote);
      }
    };

    peer.onicecandidate = (event) => {
      if (!event.candidate || !broadcasterPeerIdRef.current) return;
      void hub.invoke(
        "SendSignal",
        roomId,
        broadcasterPeerIdRef.current,
        "ice-candidate",
        event.candidate.toJSON(),
      );
    };

    return peer;
  }, [cleanupPeer]);

  const startViewingSession = useCallback(async ({
    roomId,
    onRemoteStream,
    displayName = "Viewer",
    peerId,
  }) => {
    await (async () => {
      if (hubRef.current) {
        try {
          await hubRef.current.stop();
        } catch {
          // noop
        }
      }
      cleanupPeer();
      setConnected(false);
      hubRef.current = null;
    })();

    const normalizedRoomId = String(roomId || "").trim().toUpperCase();
    if (!normalizedRoomId) {
      throw new Error("roomId is required for WebRTC viewing.");
    }

    const myPeerId = String(peerId || createPeerId("viewer"));
    const hub = new signalR.HubConnectionBuilder()
      .withUrl(resolveApiUrl("/api/hubs/webrtc"))
      .withAutomaticReconnect()
      .build();

    roomIdRef.current = normalizedRoomId;
    peerIdRef.current = myPeerId;
    hubRef.current = hub;

    hub.on("SignalReceived", async (fromPeerId, signalType, data) => {
      const broadcasterPeerId = String(fromPeerId || "");
      if (!broadcasterPeerId) return;

      if (signalType === "offer" && data) {
        let peer = broadcasterPeerRef.current;
        if (!peer || broadcasterPeerIdRef.current !== broadcasterPeerId) {
          peer = await createViewerPeer(broadcasterPeerId, onRemoteStream);
        }
        if (!peer) return;

        try {
          await peer.setRemoteDescription(new RTCSessionDescription(data));
          await flushIceQueue();
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await hub.invoke("SendSignal", normalizedRoomId, broadcasterPeerId, "answer", answer);
        } catch {
          // ignore stale offer
        }
        return;
      }

      if (signalType === "ice-candidate" && data) {
        const peer = broadcasterPeerRef.current;
        if (!peer || !peer.remoteDescription) {
          candidateQueueRef.current.push(data);
          return;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(data));
        } catch {
          candidateQueueRef.current.push(data);
        }
      }
    });

    try {
      await hub.start();
      await hub.invoke(
        "JoinSession",
        normalizedRoomId,
        myPeerId,
        String(displayName || "Viewer"),
        "viewer",
        navigator.userAgent || "browser",
      );
      setConnected(true);
    } catch (error) {
      cleanupPeer();
      setConnected(false);
      hubRef.current = null;
      throw error;
    }
  }, [cleanupPeer, createViewerPeer, flushIceQueue]);

  const stopViewingSession = useCallback(async () => {
    const hub = hubRef.current;
    const roomId = roomIdRef.current;

    cleanupPeer();
    setConnected(false);
    roomIdRef.current = "";
    peerIdRef.current = "";

    if (!hub) return;

    try {
      if (roomId) {
        await hub.invoke("LeaveSession", roomId);
      }
    } catch {
      // noop
    }

    try {
      await hub.stop();
    } catch {
      // noop
    } finally {
      hubRef.current = null;
    }
  }, [cleanupPeer]);

  return {
    connected,
    startViewingSession,
    stopViewingSession,
  };
}
