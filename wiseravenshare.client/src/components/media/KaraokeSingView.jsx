import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ArrowLeft, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import KaraokeTranscriber from "@/components/media/KaraokeTranscriber";

/**
 * Full-screen karaoke singing stage.
 *
 * Props:
 *   track            – catalog track object
 *   playbackUrl      – resolved audio URL (already loaded)
 *   timedLyrics      – [{ timeSeconds, text }] sorted array
 *   lyrics           – plain string fallback when no timed lines
 *   onBack           – callback to return to catalog
 *   currentUser
 */
export default function KaraokeSingView({
  track,
  playbackUrl,
  timedLyrics = [],
  lyrics = "",
  onBack,
  currentUser = null,
}) {
  const audioRef      = useRef(null);
  const lyricsRef     = useRef(null);
  const lineRefs      = useRef([]);
  const relaySocketRef = useRef(null);

  const [activeIndex,      setActiveIndex]      = useState(-1);
  const [activeTokenIndex, setActiveTokenIndex] = useState(-1);
  const [playing,          setPlaying]           = useState(false);
  const [progress,         setProgress]          = useState(0);     // 0-100
  const [currentTime,      setCurrentTime]       = useState(0);
  const [duration,         setDuration]          = useState(0);
  const [transcribeMode,   setTranscribeMode]    = useState(false);
  const [relayPlaybackUrl, setRelayPlaybackUrl]  = useState("");
  const [relayLines,       setRelayLines]        = useState([]);

  const channel = useMemo(() => String(track?.id || "default"), [track?.id]);
  const relayUrl = useMemo(() => {
    const configured = (import.meta.env?.VITE_KARAOKE_RELAY_WS_URL || "").trim();
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const base = configured || `${protocol}://${window.location.host}/api/python-matrix/karaoke/stream`;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}channel=${encodeURIComponent(channel)}`;
  }, [channel]);

  const groupWordsIntoLines = useCallback((words) => {
    if (!Array.isArray(words) || words.length === 0) return [];

    const normalized = words
      .map((word) => ({
        text: String(word?.text || word?.word || "").trim(),
        start: Number(word?.start ?? word?.startSeconds ?? word?.start_time ?? 0),
        end: Number(word?.end ?? word?.endSeconds ?? word?.end_time ?? 0),
      }))
      .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end))
      .sort((a, b) => a.start - b.start);

    if (normalized.length === 0) return [];

    const lines = [];
    let currentLine = { timeSeconds: normalized[0].start, text: "", tokens: [] };
    for (let i = 0; i < normalized.length; i += 1) {
      const word = normalized[i];
      const previous = normalized[i - 1];
      if (previous && word.start - previous.end > 0.8 && currentLine.tokens.length > 0) {
        currentLine.text = currentLine.tokens.map((token) => token.text).join(" ");
        lines.push(currentLine);
        currentLine = { timeSeconds: word.start, text: "", tokens: [] };
      }
      currentLine.tokens.push(word);
    }

    if (currentLine.tokens.length > 0) {
      currentLine.text = currentLine.tokens.map((token) => token.text).join(" ");
      lines.push(currentLine);
    }
    return lines;
  }, []);

  const normalizeIncomingLines = useCallback((lines) => {
    if (!Array.isArray(lines)) return [];
    return lines
      .map((line) => {
        const timeSeconds = Number(line?.time ?? line?.timeSeconds ?? line?.start ?? 0);
        const rawTokens = Array.isArray(line?.tokens) ? line.tokens : [];
        const tokens = rawTokens
          .map((token) => ({
            text: String(token?.text || token?.word || "").trim(),
            start: Number(token?.start ?? 0),
            end: Number(token?.end ?? 0),
          }))
          .filter((token) => token.text && Number.isFinite(token.start) && Number.isFinite(token.end));
        const text = String(line?.text || "").trim()
          || (tokens.length > 0 ? tokens.map((token) => token.text).join(" ") : "");
        if (!text) return null;
        return { timeSeconds: Number.isFinite(timeSeconds) ? timeSeconds : 0, text, tokens };
      })
      .filter(Boolean)
      .sort((a, b) => a.timeSeconds - b.timeSeconds);
  }, []);

  // Auto-scroll the active lyric line into view centre
  useEffect(() => {
    const el = lineRefs.current[activeIndex];
    if (el && lyricsRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  const activeLines = relayLines.length > 0 ? relayLines : timedLyrics;
  const activePlaybackUrl = relayPlaybackUrl || playbackUrl;

  const handleTimeUpdate = useCallback((e) => {
    const ct = e.currentTarget.currentTime;
    const dur = e.currentTarget.duration;
    setCurrentTime(ct);
    if (dur && Number.isFinite(dur)) setProgress((ct / dur) * 100);

    if (!activeLines.length) return;
    let next = -1;
    for (let i = 0; i < activeLines.length; i++) {
      if (ct >= activeLines[i].timeSeconds) next = i;
      else break;
    }
    setActiveIndex(next);

    if (next < 0) {
      setActiveTokenIndex(-1);
      return;
    }

    const tokens = activeLines[next]?.tokens;
    if (!Array.isArray(tokens) || tokens.length === 0) {
      setActiveTokenIndex(-1);
      return;
    }

    let tokenIndex = -1;
    for (let i = 0; i < tokens.length; i += 1) {
      if (ct >= tokens[i].start) tokenIndex = i;
      if (ct >= tokens[i].start && ct <= tokens[i].end) {
        tokenIndex = i;
        break;
      }
    }
    setActiveTokenIndex(tokenIndex);
  }, [activeLines]);

  const handleLoaded = useCallback((e) => {
    const dur = e.currentTarget.duration;
    if (dur && Number.isFinite(dur)) setDuration(dur);
    e.currentTarget.play().catch(() => {});
    setPlaying(true);
  }, []);

  useEffect(() => {
    setRelayPlaybackUrl("");
    setRelayLines([]);
    setActiveIndex(-1);
    setActiveTokenIndex(-1);
  }, [track?.id, playbackUrl]);

  useEffect(() => {
    if (!relayUrl) return undefined;
    const ws = new WebSocket(relayUrl);
    relaySocketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type && payload.type !== "karaoke_ready") return;

        const nextPlaybackUrl = typeof payload?.audio === "string" ? payload.audio.trim() : "";
        const nextLines = Array.isArray(payload?.lines)
          ? normalizeIncomingLines(payload.lines)
          : groupWordsIntoLines(payload?.words);

        if (nextPlaybackUrl) setRelayPlaybackUrl(nextPlaybackUrl);
        if (nextLines.length > 0) setRelayLines(nextLines);
      } catch (error) {
        console.warn("Ignoring invalid karaoke relay payload", error);
      }
    };

    return () => {
      relaySocketRef.current = null;
      try {
        ws.close();
      } catch {
        // no-op
      }
    };
  }, [groupWordsIntoLines, normalizeIncomingLines, relayUrl]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => {}); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = fraction * duration;
  };

  const fmt = (s) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, "0");
    return `${m}:${sec}`;
  };

  // Context window: show 2 before + current + 3 after
  const windowLines = activeLines.length > 0 ? activeLines : (
    lyrics ? lyrics.split(/\r?\n+/).filter(Boolean).map((text, i) => ({ text, timeSeconds: i * 3 })) : []
  );

  const windowStart = Math.max(0, activeIndex - 2);
  const windowEnd   = Math.min(windowLines.length - 1, activeIndex + 3);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white overflow-hidden"
      style={{ fontFamily: "var(--font-heading, sans-serif)" }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center flex-1 px-4">
          <p className="text-sm font-semibold text-white truncate">{track?.title}</p>
          <p className="text-xs text-white/50 truncate">{track?.artist}</p>
        </div>

        <button
          type="button"
          onClick={() => setTranscribeMode((p) => !p)}
          title={transcribeMode ? "Hide mic scoring" : "Enable mic scoring"}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            transcribeMode
              ? "border-primary bg-primary/20 text-primary"
              : "border-white/20 text-white/50 hover:text-white"
          }`}
        >
          <Mic className="w-3 h-3" />
          {transcribeMode ? "Scoring on" : "Score me"}
        </button>
      </div>

      {/* ── Lyrics display ──────────────────────────────────────────── */}
      <div
        ref={lyricsRef}
        className="flex-1 flex flex-col items-center justify-center overflow-hidden px-4 py-8"
      >
        {windowLines.length === 0 ? (
          <p className="text-white/30 text-sm">No lyrics available for this track.</p>
        ) : (
          <div className="w-full max-w-2xl space-y-4 text-center">
            {windowLines.slice(windowStart, windowEnd + 1).map((line, relIdx) => {
              const absIdx   = windowStart + relIdx;
              const isCurrent = absIdx === activeIndex;
              const isPrev    = absIdx < activeIndex;
              return (
                <p
                  key={`${line.timeSeconds}-${absIdx}`}
                  ref={(el) => { lineRefs.current[absIdx] = el; }}
                  className="transition-all duration-300 leading-snug select-none"
                  style={{
                    fontSize: isCurrent ? "2rem" : "1.1rem",
                    fontWeight: isCurrent ? 700 : 400,
                    color: isCurrent
                      ? "hsl(var(--primary))"
                      : isPrev
                      ? "rgba(255,255,255,0.25)"
                      : "rgba(255,255,255,0.55)",
                    textShadow: isCurrent ? "0 0 24px hsl(var(--primary)/60%)" : "none",
                    transform: isCurrent ? "scale(1.04)" : "scale(1)",
                  }}
                >
                  {isCurrent && Array.isArray(line.tokens) && line.tokens.length > 0 ? (
                    line.tokens.map((token, tokenIndex) => (
                      <span
                        key={`${absIdx}-${tokenIndex}-${token.text}`}
                        className={tokenIndex === activeTokenIndex ? "text-primary" : ""}
                        style={{
                          color: tokenIndex === activeTokenIndex ? "hsl(var(--primary))" : undefined,
                          textShadow: tokenIndex === activeTokenIndex ? "0 0 16px hsl(var(--primary)/60%)" : "none",
                        }}
                      >
                        {token.text}
                        {tokenIndex < line.tokens.length - 1 ? " " : ""}
                      </span>
                    ))
                  ) : (
                    line.text
                  )}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Mic score panel (optional) ──────────────────────────────── */}
      {transcribeMode && (
        <div className="shrink-0 border-t border-white/10 px-4 py-3 bg-black/60">
          <KaraokeTranscriber
            sessionId={track?.id}
            songMetadata={
              track
                ? {
                    trackId: track.id,
                    language: track.language || "",
                    languageCodes: track.language ? [track.language] : [],
                  }
                : null
            }
          />
        </div>
      )}

      {/* ── Progress bar + controls ──────────────────────────────────── */}
      <div className="shrink-0 px-4 pb-6 space-y-2 bg-gradient-to-t from-black/80 to-transparent">
        {/* Seekable progress bar */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          onClick={seek}
          className="h-1.5 w-full rounded-full bg-white/10 cursor-pointer overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{fmt(currentTime)}</span>
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-2 text-sm text-white hover:text-primary transition-colors"
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={activePlaybackUrl}
        onLoadedMetadata={handleLoaded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </div>
  );
}
