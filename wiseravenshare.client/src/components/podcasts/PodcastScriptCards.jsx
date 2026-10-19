/**
 * PodcastScriptCards.jsx
 *
 * SMS-style script card feed synced in real time via WebSocket.
 * Cards appear one at a time like a text message conversation:
 *   - host cards slide in from the left
 *   - co-host cards slide in from the right
 *   - guest cards appear centered with a distinct colour
 *
 * Usage:
 *   <PodcastScriptCards
 *     sessionId="uuid"
 *     deviceId="phone-1"
 *     deviceType="phone"
 *     isHost={true}
 *   />
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Mic, Mic2, User, Image, Video, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";

const WS_BASE = import.meta.env.VITE_PODCAST_SYNC_WS
  ?? (window.location.origin.replace(/^http/, "ws") + "/api/podcast-sync");

const SPEAKER_STYLES = {
  host:    { align: "left",   bg: "bg-primary/15 border-primary/30",     label: "Host"    },
  "co-host": { align: "right", bg: "bg-accent/15 border-accent/30",      label: "Co-host" },
  guest:   { align: "center", bg: "bg-secondary/60 border-border",        label: "Guest"   },
  default: { align: "left",   bg: "bg-card border-border",                label: ""        },
};

function CardBubble({ card, isNew }) {
  const style  = SPEAKER_STYLES[card?.speakerHint] ?? SPEAKER_STYLES.default;
  const alignClass = {
    left:   "items-start",
    right:  "items-end",
    center: "items-center",
  }[style.align];

  return (
    <div
      className={`flex flex-col ${alignClass} ${isNew ? "animate-[slideIn_0.3s_ease-out]" : ""}`}
      style={{ animationFillMode: "both" }}
    >
      {style.label && (
        <span className="text-[10px] text-muted-foreground mb-1 px-1">{style.label}</span>
      )}
      <div
        className={`max-w-[85%] rounded-2xl border p-4 shadow-sm space-y-2 ${style.bg}`}
        style={{ maxWidth: "min(85%, 480px)" }}
      >
        {card?.title && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {card.title}
          </p>
        )}
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {card?.body || <span className="italic text-muted-foreground">No content</span>}
        </p>
        {card?.mediaUrl && (
          <div className="rounded-lg overflow-hidden border border-border/50 mt-1">
            {card.mediaType === "image" && (
              <img src={card.mediaUrl} alt="Card media" className="w-full max-h-48 object-cover" />
            )}
            {card.mediaType === "video" && (
              <video src={card.mediaUrl} controls className="w-full max-h-48" />
            )}
          </div>
        )}
        {card?.durationSeconds && (
          <p className="text-[10px] text-muted-foreground">⏱ {card.durationSeconds}s suggested</p>
        )}
      </div>
    </div>
  );
}

export default function PodcastScriptCards({
  sessionId,
  deviceId,
  deviceType = "browser",
  isHost     = false,
  className  = "",
}) {
  const [cards,        setCards]        = useState([]);
  const [currentIdx,   setCurrentIdx]   = useState(0);
  const [totalCards,   setTotalCards]   = useState(0);
  const [wsStatus,     setWsStatus]     = useState("connecting"); // connecting|open|closed
  const [lastEventIdx, setLastEventIdx] = useState(-1);
  const wsRef = useRef(null);
  const feedRef = useRef(null);

  // ── Load all cards from REST ──────────────────────────────────────────
  const loadCards = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/podcast-sync/sessions/${sessionId}/cards`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("wiseravenshare_access_token") ?? ""}` },
      });
      if (res.ok) setCards(await res.json());
    } catch { /* will retry on next reconnect */ }
  }, [sessionId]);

  // ── WebSocket connection ────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    loadCards();

    const connect = () => {
      const token = localStorage.getItem("wiseravenshare_access_token") ?? "";
      const url   = `${WS_BASE}/ws/${sessionId}?deviceId=${encodeURIComponent(deviceId)}&deviceType=${encodeURIComponent(deviceType)}&token=${encodeURIComponent(token)}`;
      const ws    = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen  = () => setWsStatus("open");
      ws.onclose = () => { setWsStatus("closed"); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === "connected" && msg.resumedState) {
            setCurrentIdx(msg.resumedState.currentCardIndex ?? 0);
          } else if (msg.event === "card_advanced") {
            setCurrentIdx(msg.cardIndex ?? 0);
            setLastEventIdx(msg.cardIndex ?? 0);
          }
        } catch { /* ignore */ }
      };
    };

    connect();
    return () => { wsRef.current?.close(); };
  }, [sessionId, deviceId, deviceType, loadCards]);

  // ── Scroll new card into view ─────────────────────────────────────
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [currentIdx]);

  const sendAdvance = useCallback((direction) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "advance_card", direction }));
    }
  }, []);

  const currentCard = cards[currentIdx];
  const shownCards  = cards.slice(0, currentIdx + 1); // show all cards up to current (message thread)

  if (!sessionId)
    return <div className="text-sm text-muted-foreground p-4">No active session. Start a recording session to see script cards.</div>;

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`w-2 h-2 rounded-full ${wsStatus === "open" ? "bg-green-500 animate-pulse" : wsStatus === "connecting" ? "bg-yellow-500 animate-pulse" : "bg-destructive"}`} />
          {wsStatus === "open" ? "Live" : wsStatus === "connecting" ? "Connecting…" : "Reconnecting…"}
        </div>
        <span className="text-xs text-muted-foreground">
          Card {cards.length > 0 ? currentIdx + 1 : 0} / {cards.length}
        </span>
      </div>

      {/* Card feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-3">
            <Mic className="w-8 h-8" />
            <p className="text-sm">No script cards yet.</p>
            <p className="text-xs text-center max-w-48">Add cards in the Script Editor tab — they'll appear here, one at a time, as you record.</p>
          </div>
        ) : (
          shownCards.map((card, i) => (
            <CardBubble key={i} card={card} isNew={i === lastEventIdx} />
          ))
        )}
      </div>

      {/* Controls — only host can advance */}
      {isHost && cards.length > 0 && (
        <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-3 justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendAdvance("back")}
              disabled={currentIdx <= 0}
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>

            <div className="flex flex-col items-center min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate max-w-full">
                {currentCard?.title || `Card ${currentIdx + 1}`}
              </p>
              {currentCard?.speakerHint && (
                <span className="text-[10px] text-muted-foreground capitalize">{currentCard.speakerHint}</span>
              )}
            </div>

            <Button
              size="sm"
              onClick={() => sendAdvance("forward")}
              disabled={currentIdx >= cards.length - 1}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Quick progress dots */}
          <div className="flex justify-center gap-1 mt-2 overflow-hidden">
            {cards.slice(Math.max(0, currentIdx - 4), currentIdx + 5).map((_, i) => {
              const abs = i + Math.max(0, currentIdx - 4);
              return (
                <span
                  key={abs}
                  className={`h-1.5 rounded-full transition-all ${abs === currentIdx ? "w-4 bg-primary" : abs < currentIdx ? "w-1.5 bg-primary/40" : "w-1.5 bg-border"}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
