import * as signalR from "@microsoft/signalr";

const ACCESS_TOKEN_KEY = "wiseravenshare_access_token";

const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location.port === "5173") {
    return "http://localhost:10000";
  }

  return "";
};

const getAccessToken = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY) || window.localStorage.getItem("token");
};

export function createSignalRSignaling(sessionCode, options = {}) {
  const peerId = options.id || crypto.randomUUID();
  const subscribers = new Set();
  const normalizedSessionCode = sessionCode.trim().toUpperCase();
  const apiBaseUrl = getApiBaseUrl();
  const hubUrl = `${apiBaseUrl}/api/hubs/webrtc`;

  let joinedPresence = null;

  const emit = (message) => {
    subscribers.forEach((handler) => {
      try {
        handler(message);
      } catch {
        // Ignore individual subscriber failures so signaling remains active.
      }
    });
  };

  const connection = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl, {
      accessTokenFactory: () => getAccessToken() || "",
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  const rejoinIfNeeded = async () => {
    if (!joinedPresence) {
      emit({ type: "welcome", id: peerId });
      return;
    }

    await connection.invoke(
      "JoinSession",
      normalizedSessionCode,
      peerId,
      joinedPresence.name,
      joinedPresence.role,
      joinedPresence.device || ""
    );
  };

  connection.on("PeersUpdated", (peers) => {
    emit({ type: "peers", peers: peers || [] });
  });

  connection.on("SignalReceived", (from, signalType, data) => {
    emit({ type: "signal", from, signalType, data });
  });

  connection.on("SessionEventReceived", (from, eventType, payload) => {
    emit({ type: "session-event", from, eventType, payload });
  });

  connection.onreconnected(async () => {
    try {
      await rejoinIfNeeded();
    } catch (error) {
      emit({
        type: "error",
        message: error?.message || "Could not rejoin the WebRTC session after reconnecting.",
      });
    }
  });

  connection.onclose((error) => {
    if (error) {
      emit({
        type: "error",
        message: error.message || "The WebRTC signaling connection closed unexpectedly.",
      });
    }
  });

  const startPromise = connection
    .start()
    .then(() => {
      emit({ type: "welcome", id: peerId });
    })
    .catch((error) => {
      emit({
        type: "error",
        message: error?.message || "Could not connect to the WebRTC signaling service.",
      });
      throw error;
    });

  return {
    subscribe(handler) {
      subscribers.add(handler);
      return {
        unsubscribe() {
          subscribers.delete(handler);
        },
      };
    },
    async send(message) {
      await startPromise;

      if (message.type === "join") {
        joinedPresence = {
          name: message.name || "Guest",
          role: message.role || "member",
          device: message.device || "",
        };
        await connection.invoke(
          "JoinSession",
          normalizedSessionCode,
          peerId,
          joinedPresence.name,
          joinedPresence.role,
          joinedPresence.device
        );
        return;
      }

      if (message.type === "signal") {
        await connection.invoke(
          "SendSignal",
          normalizedSessionCode,
          message.target,
          message.signalType,
          message.data
        );
        return;
      }

      if (message.type === "session-event") {
        await connection.invoke(
          "BroadcastSessionEvent",
          normalizedSessionCode,
          message.eventType,
          message.data ?? null
        );
      }
    },
    close() {
      Promise.resolve(startPromise)
        .catch(() => undefined)
        .then(async () => {
          try {
            if (connection.state === signalR.HubConnectionState.Connected) {
              await connection.invoke("LeaveSession", normalizedSessionCode);
            }
          } catch {
            // Best-effort leave.
          }
        })
        .finally(() => {
          connection.stop();
        });
    },
  };
}
