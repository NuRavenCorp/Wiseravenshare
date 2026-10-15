import { useState, useEffect, useRef, useCallback } from "react";
import { createSignaling } from "@/lib/signaling/createSignaling";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTCHost(sessionCode) {
  const [peers, setPeers] = useState([]);
  const [streams, setStreams] = useState({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const peerConnectionsRef = useRef({});
  const roomRef = useRef(null);
  const createOfferRef = useRef(null);
  const offeredRef = useRef(new Set());

  const sendSessionEvent = useCallback(
    async (eventType, payload = {}) => {
      if (!roomRef.current || !sessionCode) {
        return false;
      }

      try {
        await roomRef.current.send({
          type: "session-event",
          eventType,
          data: payload,
        });
        return true;
      } catch (eventError) {
        setError(eventError?.message || "Could not send a live studio update.");
        return false;
      }
    },
    [sessionCode]
  );

  useEffect(() => {
    if (!sessionCode) return;

    const connId = crypto.randomUUID();
    const room = createSignaling(sessionCode, { id: connId });
    roomRef.current = room;
    setError("");

    const createOffer = async (peerId) => {
      if (peerConnectionsRef.current[peerId]) return;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current[peerId] = pc;

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (event) => {
        setStreams((prev) => ({ ...prev, [peerId]: event.streams[0] }));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          room.send({
            type: "signal",
            target: peerId,
            signalType: "ice-candidate",
            data: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          setStreams((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      room.send({
        type: "signal",
        target: peerId,
        signalType: "offer",
        data: offer,
      });
    };

    createOfferRef.current = createOffer;

    const sub = room.subscribe(async (msg) => {
      if (msg.type === "welcome") {
        setConnected(true);
        room.send({ type: "join", name: "Host", role: "host" });
      }

      if (msg.type === "error") {
        setError(msg.message || "WebRTC signaling failed.");
      }

      if (msg.type === "peers") {
        setPeers(msg.peers);
      }

      if (msg.type === "signal") {
        const { from, signalType, data } = msg;
        const pc = peerConnectionsRef.current[from];
        if (!pc) return;

        if (signalType === "answer") {
          if (pc.signalingState !== "stable") {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
            } catch {}
          }
        } else if (signalType === "ice-candidate") {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data));
          } catch {}
        }
      }
    });

    return () => {
      sub.unsubscribe();
      room.close();
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      peerConnectionsRef.current = {};
      offeredRef.current = new Set();
      createOfferRef.current = null;
      roomRef.current = null;
      setConnected(false);
      setPeers([]);
      setStreams({});
      setError("");
    };
  }, [sessionCode]);

  useEffect(() => {
    if (!createOfferRef.current) return;

    const memberIds = new Set(peers.filter((p) => p.role === "member").map((p) => p.id));

    Object.keys(peerConnectionsRef.current).forEach((peerId) => {
      if (!memberIds.has(peerId)) {
        peerConnectionsRef.current[peerId]?.close();
        delete peerConnectionsRef.current[peerId];
        offeredRef.current.delete(peerId);
        setStreams((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    });

    peers
      .filter((p) => p.role === "member")
      .forEach((peer) => {
        if (!offeredRef.current.has(peer.id) && !peerConnectionsRef.current[peer.id]) {
          offeredRef.current.add(peer.id);
          createOfferRef.current(peer.id);
        }
      });
  }, [peers]);

  return { peers, streams, connected, error, sendSessionEvent };
}