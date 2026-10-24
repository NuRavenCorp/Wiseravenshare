import { useCallback, useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { resolveApiUrl } from "@/api/client";

const ACCESS_TOKEN_KEY = "wiseravenshare_access_token";

const getAccessToken = () => {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return (
    window.localStorage.getItem(ACCESS_TOKEN_KEY) ||
    window.localStorage.getItem("token") ||
    ""
  );
};

/**
 * Manages a SignalR connection to /api/hubs/messages.
 * Provides real-time P2P messaging backed by MessageHub.
 *
 * @param {string|null} myUserId  - current user's ID
 * @param {function}    onMessage - called with each incoming message object
 */
export function useDirectMessage(myUserId, onMessage) {
  const hubRef = useRef(null);
  const joinedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);

  // Keep callback ref up-to-date without reconnecting.
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!myUserId) return undefined;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(resolveApiUrl("/api/hubs/messages"), {
        accessTokenFactory: () => getAccessToken(),
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    hubRef.current = conn;
    let disposed = false;

    conn.on("DirectMessageReceived", (payload) => {
      onMessageRef.current?.(payload);
    });

    conn.onreconnected(async () => {
      try {
        if (joinedRef.current) {
          await conn.invoke("JoinDirectChannel", myUserId);
        }
        setConnected(true);
      } catch {
        // best-effort rejoin
      }
    });

    conn.onclose(() => {
      if (!disposed) setConnected(false);
    });

    conn
      .start()
      .then(async () => {
        if (disposed) return;
        await conn.invoke("JoinDirectChannel", myUserId);
        joinedRef.current = true;
        setConnected(true);
      })
      .catch(() => {
        if (!disposed) setConnected(false);
      });

    return () => {
      disposed = true;
      joinedRef.current = false;
      hubRef.current = null;
      conn.stop();
    };
  }, [myUserId]);

  const sendMessage = useCallback(
    async ({ recipientUserId, text }) => {
      const hub = hubRef.current;
      if (
        !hub ||
        hub.state !== signalR.HubConnectionState.Connected ||
        !recipientUserId ||
        !text?.trim()
      ) {
        return false;
      }

      await hub.invoke("SendDirectMessage", {
        SenderUserId: myUserId ?? "",
        RecipientUserId: recipientUserId,
        Text: text.trim(),
      });

      return true;
    },
    [myUserId],
  );

  return { connected, sendMessage };
}
