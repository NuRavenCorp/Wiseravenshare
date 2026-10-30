import React, { useEffect, useRef, useState, useCallback } from "react";
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

  const [activeIndex,      setActiveIndex]      = useState(-1);
  const [playing,          setPlaying]           = useState(false);
  const [progress,         setProgress]          = useState(0);     // 0-100
  const [currentTime,      setCurrentTime]       = useState(0);
  const [duration,         setDuration]          = useState(0);
  const [transcribeMode,   setTranscribeMode]    = useState(false);

  // Auto-scroll the active lyric line into view centre
  useEffect(() => {
    const el = lineRefs.current[activeIndex];
    if (el && lyricsRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  const handleTimeUpdate = useCallback((e) => {
    const ct = e.currentTarget.currentTime;
    const dur = e.currentTarget.duration;
    setCurrentTime(ct);
    if (dur && Number.isFinite(dur)) setProgress((ct / dur) * 100);

    if (!timedLyrics.length) return;
    let next = -1;
    for (let i = 0; i < timedLyrics.length; i++) {
      if (ct >= timedLyrics[i].timeSeconds) next = i;
      else break;
    }
    setActiveIndex(next);
  }, [timedLyrics]);

  const handleLoaded = useCallback((e) => {
    const dur = e.currentTarget.duration;
    if (dur && Number.isFinite(dur)) setDuration(dur);
    e.currentTarget.play().catch(() => {});
    setPlaying(true);
  }, []);

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
  const windowLines = timedLyrics.length > 0 ? timedLyrics : (
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
                  {line.text}
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
        src={playbackUrl}
        onLoadedMetadata={handleLoaded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </div>
  );
}
