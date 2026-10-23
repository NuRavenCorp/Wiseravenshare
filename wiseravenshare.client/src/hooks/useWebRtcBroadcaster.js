import { useCallback, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { resolveApiUrl } from "@/api/client";
import { createPeerId, getIceServersAsync } from "@/lib/webrtcConfig";

export function useWebRtcBroadcaster() {
  const hubRef = useRef(null);
  const roomIdRef = useRef("");
  const peerIdRef = useRef("");
  const peersRef = useRef({});
  const candidateQueueRef = useRef({});
  const [viewerCount, setViewerCount] = useState(0);
  const [connected, setConnected] = useState(false);

  const clearPeer = useCallback((viewerId) => {
    const peer = peersRef.current[viewerId];
    if (!peer) return;
    try {
      peer.onicecandidate = null;
      peer.onconnectionstatechange = null;
      peer.close();
    } catch {
      // noop
    }
    delete peersRef.current[viewerId];
    delete candidateQueueRef.current[viewerId];
  }, []);

  const clearAllPeers = useCallback(() => {
    Object.keys(peersRef.current).forEach(clearPeer);
    setViewerCount(0);
  }, [clearPeer]);

  const enqueueIce = useCallback((viewerId, candidate) => {
    if (!candidate) return;
    if (!candidateQueueRef.current[viewerId]) {
      candidateQueueRef.current[viewerId] = [];
    }
    candidateQueueRef.current[viewerId].push(candidate);
  }, []);

  const flushIceQueue = useCallback(async (viewerId, peer) => {
    const pending = candidateQueueRef.current[viewerId] || [];
    candidateQueueRef.current[viewerId] = [];
    for (const candidate of pending) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore stale ICE
      }
    }
  }, []);

  const createViewerPeer = useCallback(async (viewerId, mediaStream) => {
    const hub = hubRef.current;
    const roomId = roomIdRef.current;
    if (!hub || !roomId || !mediaStream) return null;
    if (peersRef.current[viewerId]) return peersRef.current[viewerId];

    const iceServers = await getIceServersAsync();
    const peer = new RTCPeerConnection({ iceServers });
    peersRef.current[viewerId] = peer;

    mediaStream.getTracks().forEach((track) => peer.addTrack(track, mediaStream));

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void hub.invoke("SendSignal", roomId, viewerId, "ice-candidate", event.candidate.toJSON());
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        clearPeer(viewerId);
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await hub.invoke("SendSignal", roomId, viewerId, "offer", offer);
    return peer;
  }, [clearPeer]);

  const startBroadcastSession = useCallback(async ({
    roomId,
    mediaStream,
    displayName = "Host",
    peerId,
  }) => {
    await (async () => {
      if (hubRef.current) {
        // Stop previous session before creating a new one.
        const previousStop = async () => {
          try {
            await hubRef.current.stop();
          } catch {
            // noop
          }
          hubRef.current = null;
        };
        clearAllPeers();
        setConnected(false);
        await previousStop();
      }
    })();

    const normalizedRoomId = String(roomId || "").trim().toUpperCase();
    if (!normalizedRoomId) {
      throw new Error("roomId is required for WebRTC signaling.");
    }
    if (!mediaStream) {
      throw new Error("mediaStream is required for WebRTC broadcasting.");
    }

    const myPeerId = String(peerId || createPeerId("broadcaster"));
    const hub = new signalR.HubConnectionBuilder()
      .withUrl(resolveApiUrl("/api/hubs/webrtc"))
      .withAutomaticReconnect()
      .build();

    roomIdRef.current = normalizedRoomId;
    peerIdRef.current = myPeerId;
    hubRef.current = hub;

    hub.on("PeersUpdated", async (peers) => {
      const allPeers = Array.isArray(peers) ? peers : [];
      const viewerPeers = allPeers.filter(
        (entry) => entry?.id && entry.id !== myPeerId && String(entry.role || "").toLowerCase() !== "broadcaster",
      );
      setViewerCount(viewerPeers.length);

      const activeIds = new Set(viewerPeers.map((entry) => entry.id));
      for (const staleViewerId of Object.keys(peersRef.current)) {
        if (!activeIds.has(staleViewerId)) {
          clearPeer(staleViewerId);
        }
      }

      for (const viewer of viewerPeers) {
        if (!peersRef.current[viewer.id]) {
          try {
            await createViewerPeer(viewer.id, mediaStream);
          } catch {
            clearPeer(viewer.id);
          }
        }
      }
    });

    hub.on("SignalReceived", async (fromPeerId, signalType, data) => {
      const viewerId = String(fromPeerId || "");
      if (!viewerId) return;

      if (signalType === "answer") {
        const peer = peersRef.current[viewerId];
        if (!peer || !data) return;
        try {
          await peer.setRemoteDescription(new RTCSessionDescription(data));
          await flushIceQueue(viewerId, peer);
        } catch {
          // ignore stale answer
        }
        return;
      }

      if (signalType === "ice-candidate" && data) {
        const peer = peersRef.current[viewerId];
        if (!peer || !peer.remoteDescription) {
          enqueueIce(viewerId, data);
          return;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(data));
        } catch {
          enqueueIce(viewerId, data);
        }
      }
    });

    try {
      await hub.start();
      await hub.invoke(
        "JoinSession",
        normalizedRoomId,
        myPeerId,
        String(displayName || "Host"),
        "broadcaster",
        navigator.userAgent || "browser",
      );
      setConnected(true);
    } catch (error) {
      clearAllPeers();
      setConnected(false);
      hubRef.current = null;
      throw error;
    }
  }, [clearAllPeers, clearPeer, createViewerPeer, enqueueIce, flushIceQueue]);

  const stopBroadcastSession = useCallback(async () => {
    const hub = hubRef.current;
    const roomId = roomIdRef.current;

    clearAllPeers();
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
  }, [clearAllPeers]);

  return {
    connected,
    viewerCount,
    startBroadcastSession,
    stopBroadcastSession,
  };
}
