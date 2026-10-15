import { apiClient } from "@/api/client";

/**
 * Alternative actor-style signaling.
 * Returns a room object with: subscribe(handler), send(msg), close().
 */
export function createActorSignaling(sessionCode, options = {}) {
  const id = options.id || crypto.randomUUID();
  return apiClient.actors.VideoSignaling(sessionCode).connect({ id });
}