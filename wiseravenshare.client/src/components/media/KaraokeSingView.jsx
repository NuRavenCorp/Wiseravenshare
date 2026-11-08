import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ArrowLeft, Mic, Loader2, Sliders } from "lucide-react";
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
  karaokeLines = null,
  vtt = "",
  lyrics = "",
  onBack,
  currentUser = null,
  onOpenStudioPlayer = null,
}) {
  const audioRef      = useRef(null);
  const lyricsRef     = useRef(null);
  const lineRefs      = useRef([]);
  const relaySocketRef = useRef(null);
  const lrclibRequestRef = useRef("");

  const [activeIndex,      setActiveIndex]      = useState(-1);
  const [activeTokenIndex, setActiveTokenIndex] = useState(-1);
  const [playing,          setPlaying]           = useState(false);
  const [progress,         setProgress]          = useState(0);     // 0-100
  const [currentTime,      setCurrentTime]       = useState(0);
  const [duration,         setDuration]          = useState(0);
  const [transcribeMode,   setTranscribeMode]    = useState(false);
  const [relayPlaybackUrl, setRelayPlaybackUrl]  = useState("");
  const [relayLines,       setRelayLines]        = useState([]);
  const [vttUrl,           setVttUrl]            = useState(null);

  const fillRefsRef = useRef({});
  const rafRef      = useRef(null);

  // Convert incoming karaokeLines (with word-level timestamps in ms) into unified timed lines
  const linesFromKaraokeLines = useMemo(() => {
    const raw = karaokeLines || (Array.isArray(track?.karaokeLines) && track.karaokeLines.length > 0 ? track.karaokeLines : null);
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.map((kl) => {
      const startSec = (kl.start || 0) / 1000;
      const endSec = (kl.end || 0) / 1000;
      const rawWords = Array.isArray(kl.words) ? kl.words : [];
      const tokens = rawWords.map((w, idx) => {
        const wStart = (w.start || 0) / 1000;
        let wEnd = (w.end || 0) / 1000;
        if (wEnd <= wStart) {
          const nextW = rawWords[idx + 1];
          wEnd = nextW ? (nextW.start || 0) / 1000 : wStart + 0.35;
        }
        return {
          text: String(w.text || w.word || "").trim(),
          start: wStart,
          end: Math.max(wStart + 0.05, wEnd),
        };
      }).filter((t) => t.text.length > 0);

      const text = kl.text || tokens.map((t) => t.text).join(" ");
      return {
        timeSeconds: startSec,
        endSeconds: endSec,
        text,
        tokens,
      };
    });
  }, [karaokeLines, track?.karaokeLines]);

  // VTT Blob URL for browser native caption track
  const vttContent = vtt || track?.vtt || "";
  useEffect(() => {
    if (!vttContent) {
      setVttUrl(null);
      return;
    }
    const blob = new Blob([vttContent], { type: "text/vtt" });
    const url = URL.createObjectURL(blob);
    setVttUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [vttContent]);

  const channel = useMemo(() => String(track?.id || "default"), [track?.id]);
  const relayUrl = useMemo(() => {
    const configured = (import.meta.env?.VITE_KARAOKE_RELAY_WS_URL || "").trim();
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const base = configured || `${protocol}://${window.location.host}/api/python-matrix/karaoke/relay`;
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

  const parseLrcToLines = useCallback((lrcText) => {
    const rows = String(lrcText || "").split(/\r?\n+/).map((row) => row.trim()).filter(Boolean);
    const lines = [];

    const toSeconds = (timestamp) => {
      const [minutesPart, secondsPart = "0"] = String(timestamp || "0:0").split(":");
      const minutes = Number(minutesPart || 0);
      const seconds = Number(secondsPart || 0);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
      return Math.max(0, (minutes * 60) + seconds);
    };

    for (const row of rows) {
      const lineStamp = row.match(/^\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/);
      if (!lineStamp) continue;

      const timeSeconds = toSeconds(lineStamp[1]);
      const body = row.replace(/^\[[^\]]+\]/, "").trim();
      if (!body) continue;

      const tokenMatches = [...body.matchAll(/<(\d{1,2}:\d{2}(?:\.\d{1,3})?)>([^<]+)/g)];
      if (tokenMatches.length > 0) {
        const tokens = tokenMatches
          .map((match, index) => {
            const start = toSeconds(match[1]);
            const text = String(match[2] || "").trim();
            const next = tokenMatches[index + 1];
            const nextStart = next ? toSeconds(next[1]) : start + 0.4;
            return {
              text,
              start,
              end: Math.max(start, nextStart),
            };
          })
          .filter((token) => token.text.length > 0);

        if (tokens.length > 0) {
          lines.push({
            timeSeconds,
            text: tokens.map((token) => token.text).join(" "),
            tokens,
          });
          continue;
        }
      }

      lines.push({ timeSeconds, text: body, tokens: [] });
    }

    return lines.sort((a, b) => a.timeSeconds - b.timeSeconds);
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

  const loadLrclibFallback = useCallback(async (trackName, artistName) => {
    const safeTrack = String(trackName || "").trim();
    const safeArtist = String(artistName || "").trim();
    if (!safeTrack || !safeArtist) return;

    const requestKey = `${safeTrack}::${safeArtist}`.toLowerCase();
    if (lrclibRequestRef.current === requestKey) return;
    lrclibRequestRef.current = requestKey;

    try {
      const url = new URL("https://lrclib.net/api/get");
      url.searchParams.set("track_name", safeTrack);
      url.searchParams.set("artist_name", safeArtist);

      const response = await fetch(url.toString(), { method: "GET" });
      if (!response.ok) return;
      const payload = await response.json();
      const lrc = String(payload?.syncedLyrics || payload?.plainLyrics || "").trim();
      if (!lrc) return;
      const parsed = parseLrcToLines(lrc);
      if (parsed.length > 0) {
        setRelayLines(parsed);
      }
    } catch {
      // Best-effort fallback only.
    }
  }, [parseLrcToLines]);

  // Auto-scroll the active lyric line into view centre
  useEffect(() => {
    const el = lineRefs.current[activeIndex];
    if (el && lyricsRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  const activeLines = useMemo(() => {
    if (linesFromKaraokeLines && linesFromKaraokeLines.length > 0) return linesFromKaraokeLines;
    if (relayLines.length > 0) return relayLines;
    return timedLyrics;
  }, [linesFromKaraokeLines, relayLines, timedLyrics]);

  // Real-time word-fill animation loop using requestAnimationFrame (60/120fps)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeLines || activeLines.length === 0) return;

    function frame() {
      const nowSec = audio.currentTime;
      for (let li = 0; li < activeLines.length; li++) {
        const line = activeLines[li];
        const tokens = line.tokens || [];
        for (let wi = 0; wi < tokens.length; wi++) {
          const tok = tokens[wi];
          const dur = Math.max(0.05, tok.end - tok.start);
          const rawPct = (nowSec - tok.start) / dur;
          const pct = Math.min(100, Math.max(0, rawPct * 100));
          const el = fillRefsRef.current?.[li]?.[wi];
          if (el) el.style.setProperty("--fill", `${pct.toFixed(1)}%`);
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activeLines]);
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
    e.currentTarget.loop = true;
    if (dur && Number.isFinite(dur)) setDuration(dur);
    e.currentTarget.play().catch(() => {});
    setPlaying(true);
  }, []);

  useEffect(() => {
    setRelayPlaybackUrl("");
    setRelayLines([]);
    setActiveIndex(-1);
    setActiveTokenIndex(-1);
    lrclibRequestRef.current = "";
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
        let nextLines = [];
        if (typeof payload?.lrc === "string" && payload.lrc.trim().length > 0) {
          nextLines = parseLrcToLines(payload.lrc);
        } else if (Array.isArray(payload?.lines)) {
          nextLines = normalizeIncomingLines(payload.lines);
        } else if (Array.isArray(payload?.words)) {
          nextLines = groupWordsIntoLines(payload.words);
        }

        if (nextPlaybackUrl) setRelayPlaybackUrl(nextPlaybackUrl);
        if (nextLines.length > 0) {
          setRelayLines(nextLines);
        } else {
          void loadLrclibFallback(
            payload?.trackName || track?.title || "",
            payload?.artistName || track?.artist || ""
          );
        }
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
  }, [groupWordsIntoLines, loadLrclibFallback, normalizeIncomingLines, parseLrcToLines, relayUrl, track?.artist, track?.title]);

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

        <div className="flex items-center gap-2">
          {onOpenStudioPlayer && (
            <button
              type="button"
              onClick={() => {
                onOpenStudioPlayer({
                  ...track,
                  audioUrl: activePlaybackUrl,
                  karaokeLines: karaokeLines || track?.karaokeLines,
                  vtt: vtt || track?.vtt,
                  lrcContent: track?.lrcContent || "",
                  plainLyrics: lyrics || track?.plainLyrics || "",
                });
              }}
              title="Open with Studio Player (Equalizer & Waveform)"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
            >
              <Sliders className="w-3 h-3" />
              Studio Player
            </button>
          )}
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
                    line.tokens.map((token, tokenIndex) => {
                      const isTokenActive = tokenIndex === activeTokenIndex;
                      return (
                        <span
                          key={`${absIdx}-${tokenIndex}-${token.text}`}
                          ref={(el) => {
                            if (!fillRefsRef.current[absIdx]) fillRefsRef.current[absIdx] = [];
                            fillRefsRef.current[absIdx][tokenIndex] = el;
                          }}
                          onClick={() => {
                            if (audioRef.current && Number.isFinite(token.start)) {
                              audioRef.current.currentTime = token.start;
                              audioRef.current.play().catch(() => {});
                            }
                          }}
                          className="cursor-pointer select-none transition-transform inline-block mr-2"
                          style={{
                            backgroundImage: "linear-gradient(to right, #ec4899 0%, #ec4899 var(--fill, 0%), rgba(255,255,255,0.85) var(--fill, 0%), rgba(255,255,255,0.85) 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            textShadow: isTokenActive ? "0 0 20px rgba(236,72,153,0.7)" : "none",
                            transform: isTokenActive ? "scale(1.06)" : "scale(1)",
                          }}
                        >
                          {token.text}
                        </span>
                      );
                    })
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

      {/* Hidden audio element with word-timed VTT captions */}
      <audio
        ref={audioRef}
        src={activePlaybackUrl}
        loop
        onLoadedMetadata={handleLoaded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        {vttUrl && (
          <track kind="captions" src={vttUrl} srcLang="und" label="Word-timed captions" default />
        )}
      </audio>
    </div>
  );
}
