import { resolveApiUrl } from "@/api/client";

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "stun:stun.l.google.com:19302" },
];

const ICE_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedIceServers = null;
let cachedAt = 0;
let inflightPromise = null;

export function getIceServers() {
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS;
  if (!raw) return DEFAULT_ICE_SERVERS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_ICE_SERVERS;
    }
    return parsed;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

export async function getIceServersAsync() {
  const now = Date.now();
  if (cachedIceServers && now - cachedAt < ICE_CACHE_TTL_MS) {
    return cachedIceServers;
  }
  if (inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    try {
      const response = await fetch(resolveApiUrl("/api/live/ice-servers"), {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`ICE config request failed with ${response.status}`);
      }
      const payload = await response.json();
      const servers = Array.isArray(payload?.iceServers) && payload.iceServers.length > 0
        ? payload.iceServers
        : getIceServers();
      cachedIceServers = servers;
      cachedAt = Date.now();
      return servers;
    } catch {
      const fallback = getIceServers();
      cachedIceServers = fallback;
      cachedAt = Date.now();
      return fallback;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

export function createPeerId(prefix = "peer") {
  const safePrefix = String(prefix || "peer").trim() || "peer";
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${safePrefix}-${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${safePrefix}-${Date.now()}-${random}`;
}
