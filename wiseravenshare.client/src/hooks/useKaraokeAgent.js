import { useCallback, useRef, useState } from "react";
import { apiClient } from "@/api/client";

/**
 * Connects KaraokeTranscriber to NuravenCorpLLM for live transcription analysis.
 *
 * Usage:
 *   const { agentFeedback, startSession, sendTurn, endSession } = useKaraokeAgent();
 *
 * - Call startSession(performanceId) when singing begins.
 * - Call sendTurn(turnText) for each finalized transcript turn.
 * - Call endSession() when singing stops.
 * - Render agentFeedback in the UI.
 */
export function useKaraokeAgent() {
  const sessionIdRef = useRef(null);
  const [agentFeedback, setAgentFeedback] = useState(null);
  const [agentError, setAgentError] = useState(null);
  const pendingRef = useRef(false);

  const startSession = useCallback(async (performanceId = null) => {
    sessionIdRef.current = null;
    setAgentFeedback(null);
    setAgentError(null);
    try {
      const resp = await apiClient.requestJson("/api/karaoke/agent/sessions", {
        method: "POST",
        body: JSON.stringify({ performanceId }),
      });
      if (resp?.sessionId) {
        sessionIdRef.current = resp.sessionId;
      }
    } catch (err) {
      // Non-fatal: agent features are best-effort
      console.warn("[KaraokeAgent] Session start failed:", err?.message);
    }
  }, []);

  const sendTurn = useCallback(async (transcript) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !transcript?.trim() || pendingRef.current) return;

    pendingRef.current = true;
    try {
      const resp = await apiClient.requestJson(
        `/api/karaoke/agent/sessions/${encodeURIComponent(sessionId)}/event`,
        {
          method: "POST",
          body: JSON.stringify({ input: transcript.trim() }),
        }
      );

      if (resp && !resp.hasError && resp.text) {
        setAgentFeedback(resp.text);
      }

      // Surface any low-risk tool results to the UI
      if (Array.isArray(resp?.toolResults)) {
        const successful = resp.toolResults
          .filter((t) => t.success)
          .map((t) => t.tool)
          .join(", ");
        if (successful) {
          setAgentFeedback((prev) => prev || `✓ ${successful}`);
        }
      }
    } catch (err) {
      console.warn("[KaraokeAgent] Turn send failed:", err?.message);
      setAgentError("Agent feedback unavailable.");
    } finally {
      pendingRef.current = false;
    }
  }, []);

  const endSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (!sessionId) return;
    try {
      await apiClient.requestJson(
        `/api/karaoke/agent/sessions/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" }
      );
    } catch {
      // Best-effort cleanup
    }
    setAgentFeedback(null);
    setAgentError(null);
  }, []);

  return { agentFeedback, agentError, startSession, sendTurn, endSession };
}
