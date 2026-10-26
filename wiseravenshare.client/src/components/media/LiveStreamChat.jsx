import React, { useEffect, useMemo, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { resolveApiUrl } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ACCESS_TOKEN_KEY = "wiseravenshare_access_token";

const getAccessToken = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return "";
  }
  return window.localStorage.getItem(ACCESS_TOKEN_KEY) || window.localStorage.getItem("token") || "";
};

export default function LiveStreamChat({ roomId, username }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [connection, setConnection] = useState(null);
  const [connecting, setConnecting] = useState(true);

  const normalizedRoomId = useMemo(
    () => String(roomId || "").trim().toUpperCase(),
    [roomId],
  );

  useEffect(() => {
    if (!normalizedRoomId) {
      setMessages([]);
      setConnection(null);
      setConnecting(false);
      return undefined;
    }

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(resolveApiUrl("/api/hubs/live-chat"), {
        accessTokenFactory: () => getAccessToken(),
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on("ReceiveMessage", (user, message, sentAtUtc) => {
      setMessages((prev) => [
        ...prev.slice(-199),
        {
          user: String(user || "Guest"),
          message: String(message || ""),
          sentAtUtc: sentAtUtc || new Date().toISOString(),
        },
      ]);
    });

    let disposed = false;
    setConnecting(true);

    conn.start()
      .then(async () => {
        if (disposed) return;
        await conn.invoke("JoinRoom", normalizedRoomId);
        setConnection(conn);
        setConnecting(false);
      })
      .catch(() => {
        if (disposed) return;
        setConnection(null);
        setConnecting(false);
      });

    return () => {
      disposed = true;
      const leaveAndStop = async () => {
        try {
          if (conn.state === signalR.HubConnectionState.Connected) {
            await conn.invoke("LeaveRoom", normalizedRoomId);
          }
        } catch {
          // Best-effort leave.
        }
        await conn.stop();
      };
      void leaveAndStop();
    };
  }, [normalizedRoomId]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || !connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    try {
      await connection.invoke(
        "SendMessage",
        normalizedRoomId,
        trimmed,
      );
      setInput("");
    } catch {
      // Keep existing input for retry.
    }
  };

  return (
    <div className="h-full min-h-[360px] rounded-lg border border-border bg-card p-3 flex flex-col">
      <div className="mb-2">
        <p className="text-sm font-medium text-foreground">Live Chat</p>
        <p className="text-xs text-muted-foreground">
          {connecting ? "Connecting..." : "Connected"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-md border border-border bg-background p-2 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((item, index) => (
            <div key={`${item.sentAtUtc}-${index}`} className="text-xs">
              <span className="font-medium text-foreground">{item.user}:</span>{" "}
              <span className="text-muted-foreground break-words">{item.message}</span>
            </div>
          ))
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Type a message..."
          className="h-9"
        />
        <Button size="sm" onClick={() => void send()} disabled={!input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
