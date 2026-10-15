import { createActorSignaling } from "./actorSignaling";
import { createSignalRSignaling } from "./signalrSignaling";

/**
 * Current signaling provider.
 * "signalr" — ASP.NET Core SignalR hub
 * "actor"   — fallback provider
 */
const PROVIDER = "signalr";

export function createSignaling(sessionCode, options = {}) {
  if (!sessionCode) throw new Error("Session code is required");

  if (PROVIDER === "signalr") {
    return createSignalRSignaling(sessionCode, options);
  }

  return createActorSignaling(sessionCode, options);
}

export function getSignalingProvider() {
  return PROVIDER;
}