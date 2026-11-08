import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Play, Pause, SkipBack, SkipForward, ArrowLeft, Music, Mic, Loader2, Sliders, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseLrc } from "@/lib/lrcParser";
import { apiClient } from "@/api/client";
import KaraokeTranscriber from "@/components/media/KaraokeTranscriber";

// ─── EQ presets ───────────────────────────────────────────────────────────────
const EQ_PRESETS = {
  Flat: [
    { type: "lowshelf",  frequency: 250,  gain: 0 },
    { type: "peaking",   frequency: 1000, gain: 0 },
    { type: "peaking",   frequency: 4000, gain: 0 },
    { type: "highshelf", frequency: 8000, gain: 0 },
  ],
  "Bass Boost": [
    { type: "lowshelf",  frequency: 250,  gain: 8 },
    { type: "peaking",   frequency: 1000, gain: 0 },
    { type: "peaking",   frequency: 4000, gain: -2 },
    { type: "highshelf", frequency: 8000, gain: -1 },
  ],
  "Concert Hall": [
    { type: "lowshelf",  frequency: 250,  gain: -2 },
    { type: "peaking",   frequency: 1000, gain: 3 },
    { type: "peaking",   frequency: 4000, gain: 5 },
    { type: "highshelf", frequency: 8000, gain: 4 },
  ],
  Warm: [
    { type: "lowshelf",  frequency: 250,  gain: 4 },
    { type: "peaking",   frequency: 1000, gain: 2 },
    { type: "peaking",   frequency: 4000, gain: -3 },
    { type: "highshelf", frequency: 8000, gain: -4 },
  ],
};

function fmt(s) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── KaraokePlayer ────────────────────────────────────────────────────────────
export default function KaraokePlayer({ song, onClose, onSaved, karaokeLines: karaokeLinesProp = null, vtt: vttProp = "" }) {
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const filtersRef = useRef([]);
  const lyricsContainerRef = useRef(null);
  const activeLineRef = useRef(null);
  const fillRefsRef = useRef({});
  const rafRef = useRef(null);
  const [vttUrl, setVttUrl] = useState(null);  // blob URL for the <track> element

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lrcData, setLrcData] = useState(null);
  const [fetchingLrc, setFetchingLrc] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const [eqPreset, setEqPreset] = useState("Flat");
  const [showEq, setShowEq] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [lrcSaved, setLrcSaved] = useState(false);
  const [extractingAi, setExtractingAi] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [dynamicKaraokeLines, setDynamicKaraokeLines] = useState(null);

  // karaokeLines: prefer dynamic (from AI extraction), then song-level data, fall back to prop
  const karaokeLines = useMemo(
    () => dynamicKaraokeLines || (Array.isArray(song?.karaokeLines) && song.karaokeLines.length > 0
      ? song.karaokeLines
      : karaokeLinesProp),
    [dynamicKaraokeLines, song?.karaokeLines, karaokeLinesProp]
  );

  // VTT blob URL for the <track> element (native browser word-timing captions).
  const vttContent = vttProp || song?.vtt || "";
  useEffect(() => {
    if (!vttContent) { setVttUrl(null); return; }
    const blob = new Blob([vttContent], { type: "text/vtt" });
    const url  = URL.createObjectURL(blob);
    setVttUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [vttContent]);

  // Parse LRC whenever song or fetched content changes
  const parsedLrc = useMemo(() => {
    const content = lrcData ?? song?.lrcContent ?? song?.plainLyrics ?? "";
    return parseLrc(content);
  }, [lrcData, song?.lrcContent, song?.plainLyrics]);

  const lines = parsedLrc.lines;

  // Audio source URL
  const audioUrl = useMemo(
    () => song?.audioUrl ?? apiClient.karaoke.songs.streamUrl(song?.id),
    [song]
  );

  // Fetch LRC from LRCLIB or server proxy if not present
  useEffect(() => {
    if (song?.lrcContent || !song?.title) return;
    setFetchingLrc(true);

    const tryFetchLyrics = async () => {
      // 1. Try public LRCLIB directly
      try {
        const artist = encodeURIComponent(song.artist ?? "");
        const title = encodeURIComponent(song.title ?? "");
        const res = await fetch(`https://lrclib.net/api/get?artist_name=${artist}&track_name=${title}`);
        if (res.ok) {
          const data = await res.json();
          const lrc = data?.syncedLyrics || "";
          const plain = data?.plainLyrics || "";
          if (lrc) {
            setLrcData(lrc);
            await apiClient.karaoke.songs.update(song.id, { lrcContent: lrc, plainLyrics: plain });
            setLrcSaved(true);
            onSaved?.({ ...song, lrcContent: lrc, plainLyrics: plain });
            return;
          }
        }
      } catch {
        // Continue to server proxy
      }

      // 2. Try server lyrics proxy
      try {
        const proxyRes = await apiClient.karaoke.getLyrics({
          artist: song.artist || "",
          title: song.title || "",
          album: song.album || undefined,
        });
        if (proxyRes?.found && proxyRes.lrc) {
          setLrcData(proxyRes.lrc);
          await apiClient.karaoke.songs.update(song.id, {
            lrcContent: proxyRes.lrc,
            plainLyrics: proxyRes.plainLyrics || "",
          });
          setLrcSaved(true);
          onSaved?.({ ...song, lrcContent: proxyRes.lrc, plainLyrics: proxyRes.plainLyrics || "" });
        }
      } catch {
        // Non-fatal
      }
    };

    tryFetchLyrics().finally(() => setFetchingLrc(false));
  }, [song, onSaved]);

  // Extract lyrics via AssemblyAI
  async function extractLyricsWithAi() {
    if (!audioUrl) return;
    setExtractingAi(true);
    setExtractError("");
    try {
      const normalizedAudioUrl = String(audioUrl).startsWith("/") && typeof window !== "undefined"
        ? `${window.location.origin}${audioUrl}`
        : String(audioUrl);

      let result = null;

      // Primary path: async job + polling (avoids reverse proxy timeouts)
      try {
        const submission = await apiClient.requestJson(
          "/api/podcast-audio/assemblyai/transcribe-url/jobs",
          {
            method: "POST",
            body: JSON.stringify({ audioUrl: normalizedAudioUrl, speechModel: "universal-3-5-pro", wordTimestamps: true }),
          }
        );
        if (submission?.job_id) {
          const maxMs = 600_000;
          const start = Date.now();
          while (Date.now() - start < maxMs) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const statusResp = await apiClient.requestJson(
              `/api/podcast-audio/assemblyai/transcribe/jobs/${encodeURIComponent(submission.job_id)}`,
              { method: "GET" }
            );
            if (statusResp?.status === "completed") {
              result = statusResp.result;
              break;
            }
            if (statusResp?.status === "failed") {
              throw new Error(statusResp.error || "Transcription job failed.");
            }
          }
        }
      } catch (jobErr) {
        console.warn("Async transcribe job failed or unavailable, falling back to sync endpoint", jobErr);
      }

      // Sync fallback
      if (!result) {
        result = await apiClient.podcastAudio.transcribeUrl(normalizedAudioUrl, {
          wordTimestamps: true,
        });
      }

      const lrc = result?.lrc || "";
      const text = result?.text || result?.lyrics || "";
      const kLines = result?.karaoke_lines || null;

      if (!lrc && !text) {
        throw new Error("AI transcription produced empty lyrics.");
      }

      setLrcData(lrc || text);
      if (kLines) setDynamicKaraokeLines(kLines);

      // Save to server
      if (song?.id) {
        await apiClient.karaoke.songs.update(song.id, {
          lrcContent: lrc,
          plainLyrics: text,
        });
        setLrcSaved(true);
        onSaved?.({ ...song, lrcContent: lrc, plainLyrics: text, karaokeLines: kLines });
      }
    } catch (err) {
      setExtractError(err?.message || "AI extraction failed. Please check your audio file or retry.");
    } finally {
      setExtractingAi(false);
    }
  }

  // Sync active line/word
  useEffect(() => {
    if (!lines.length) return;
    let idx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].time) {
        idx = i;
        break;
      }
    }
    setActiveLineIdx(idx);

    if (idx >= 0 && lines[idx].words) {
      const ws = lines[idx].words;
      let wi = -1;
      for (let j = ws.length - 1; j >= 0; j--) {
        if (currentTime >= ws[j].time) {
          wi = j;
          break;
        }
      }
      setActiveWordIdx(wi);
    } else {
      setActiveWordIdx(-1);
    }
  }, [currentTime, lines]);

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeLineRef.current && lyricsContainerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeLineIdx]);

  // ── rAF word-fill loop (only when karaokeLines are available) ───────────────
  useEffect(() => {
    if (!karaokeLines) return;
    const audio = audioRef.current;
    if (!audio) return;

    function frame() {
      const nowMs = audio.currentTime * 1000;
      for (let li = 0; li < karaokeLines.length; li++) {
        const kLine = karaokeLines[li];
        for (let wi = 0; wi < kLine.words.length; wi++) {
          const kw = kLine.words[wi];
          const dur = Math.max(1, kw.end - kw.start);
          const progress = Math.max(0, Math.min(1, (nowMs - kw.start) / dur));
          const el = fillRefsRef.current[`${li}-${wi}`];
          if (el) el.style.width = `${progress * 100}%`;
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [karaokeLines]);

  // Lazy Web Audio API setup
  function ensureAudioContext() {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaElementSource(audio);

    const nodes = EQ_PRESETS["Flat"].map((band) => {
      const f = ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.frequency;
      f.gain.value = band.gain;
      return f;
    });
    filtersRef.current = nodes;

    // Chain: src → filter0 → filter1 → … → destination
    let prev = src;
    for (const node of nodes) {
      prev.connect(node);
      prev = node;
    }
    prev.connect(ctx.destination);
  }

  function applyEqPreset(name) {
    setEqPreset(name);
    const preset = EQ_PRESETS[name];
    if (!preset || !filtersRef.current.length) return;
    preset.forEach((band, i) => {
      if (filtersRef.current[i]) {
        filtersRef.current[i].gain.value = band.gain;
      }
    });
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    ensureAudioContext();
    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    if (playing) {
      audio.pause();
    } else {
      await audio.play();
    }
  }

  function seek(e) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = parseFloat(e.target.value);
  }

  function seekToLine(lineTime) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = lineTime;
    if (!playing) audio.play();
  }

  function skipBack() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }

  function skipForward() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080818] text-white overflow-hidden">
      <style>{`
        @keyframes wordPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .word-active { animation: wordPop 0.25s ease; }
      `}</style>

      {/* Hidden audio element with optional word-timed VTT caption track */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onDurationChange={(e) => setDuration(e.target.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      >
        {vttUrl && (
          <track kind="captions" src={vttUrl} srcLang="und" label="Word-timed captions" default />
        )}
      </audio>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur border-b border-white/10 shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="text-center min-w-0 flex-1 px-4">
          <p className="font-bold text-sm truncate">{song?.title ?? "Unknown"}</p>
          <p className="text-xs text-white/50 truncate">{song?.artist ?? ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {fetchingLrc && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
          {lrcSaved && <span className="text-xs text-green-400">Lyrics saved</span>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowScoring((p) => !p)}
            className={`gap-1.5 text-xs rounded-full border transition-colors ${
              showScoring
                ? "border-primary bg-primary/20 text-primary"
                : "border-white/20 text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            {showScoring ? "Scoring On" : "Sing & Score"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowEq((p) => !p)}
            className={`text-white hover:bg-white/10 ${showEq ? "bg-white/20" : ""}`}
            title="Audio Equalizer"
          >
            <Sliders className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* EQ panel */}
      {showEq && (
        <div className="flex items-center justify-center gap-2 py-2 bg-black/60 border-b border-white/10 shrink-0 flex-wrap px-4">
          {Object.keys(EQ_PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => applyEqPreset(name)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                eqPreset === name
                  ? "bg-yellow-400 text-black"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Main stage — lyrics */}
      <div
        ref={lyricsContainerRef}
        className="flex-1 overflow-y-auto px-4 py-8 flex flex-col items-center gap-2 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-white/40 px-4 text-center my-auto">
            <Mic className="w-12 h-12 text-white/25" />
            <p className="text-sm font-medium">
              {fetchingLrc ? "Searching for lyrics on LRCLIB…" : "No synchronized lyrics found for this song."}
            </p>
            {!fetchingLrc && (
              <div className="flex flex-col items-center gap-2 max-w-sm">
                <Button
                  onClick={extractLyricsWithAi}
                  disabled={extractingAi}
                  variant="outline"
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 gap-2"
                >
                  {extractingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 text-yellow-400" />}
                  {extractingAi ? "Extracting lyrics with AI (1-2 min)…" : "Extract Lyrics with AI (AssemblyAI)"}
                </Button>
                {extractError && <p className="text-xs text-red-400">{extractError}</p>}
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Transcribes sung vocals into word-by-word synchronized LRC lyrics and saves them to your song.
                </p>
              </div>
            )}
          </div>
        ) : (
          lines.map((line, i) => {
            const isActive = i === activeLineIdx;
            const dist = Math.abs(i - activeLineIdx);
            const opacity =
              isActive ? 1 : dist === 1 ? 0.45 : dist === 2 ? 0.25 : 0.12;

            // Find matching karaokeLines entry by time proximity for fill animation.
            const kLine = karaokeLines && isActive
              ? karaokeLines.find((kl) => Math.abs(kl.start / 1000 - line.time) < 0.5)
              : null;

            return (
              <div
                key={i}
                ref={isActive ? activeLineRef : null}
                onClick={() => seekToLine(line.time)}
                className={`cursor-pointer text-center transition-all duration-300 select-none px-2 ${
                  isActive
                    ? "text-white text-2xl md:text-4xl font-bold leading-tight"
                    : "text-white/60 text-base md:text-lg font-medium"
                }`}
                style={{ opacity }}
              >
                {isActive && kLine ? (
                  /* Word-fill + click-to-seek + keyboard accessibility */
                  kLine.words.map((kw, wi) => {
                    const kLineIdx = karaokeLines.indexOf(kLine);
                    return (
                      <span
                        key={wi}
                        role="button"
                        tabIndex={0}
                        title={`${(kw.start / 1000).toFixed(2)}s`}
                        aria-label={`Seek to ${kw.text}`}
                        onClick={(e) => { e.stopPropagation(); if (audioRef.current) audioRef.current.currentTime = kw.start / 1000; }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (audioRef.current) audioRef.current.currentTime = kw.start / 1000;
                          }
                        }}
                        style={{ display: "inline-block", marginRight: "0.28em", position: "relative", color: "#555", cursor: "pointer", borderRadius: "0.2em" }}
                        className="hover:text-[#a995ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8c6cff]"
                      >
                        {kw.text}
                        <span
                          ref={(el) => {
                            if (el) fillRefsRef.current[`${kLineIdx}-${wi}`] = el;
                            else delete fillRefsRef.current[`${kLineIdx}-${wi}`];
                          }}
                          style={{
                            position: "absolute", inset: 0, width: "0%", overflow: "hidden",
                            color: "#fff", whiteSpace: "nowrap",
                            pointerEvents: "none",
                            textShadow: "0 0 12px #8c6cff",
                          }}
                        >
                          {kw.text}
                        </span>
                      </span>
                    );
                  })
                ) : isActive && line.words ? (
                  line.words.map((w, wi) => (
                    <span
                      key={wi}
                      className={`transition-colors duration-100 ${
                        wi <= activeWordIdx ? "text-yellow-300 word-active" : "text-white"
                      }`}
                    >
                      {w.text}{" "}
                    </span>
                  ))
                ) : (
                  line.text || "♪"
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Docked live mic scoring panel */}
      {showScoring && (
        <div className="shrink-0 border-t border-white/10 px-4 py-3 bg-black/75 backdrop-blur max-h-56 overflow-y-auto">
          <KaraokeTranscriber
            sessionId={song?.id}
            songMetadata={{
              trackId: song?.id,
              language: song?.language || "en",
              languageCodes: song?.language ? [song.language] : ["en"],
            }}
          />
        </div>
      )}

      {/* Bottom controls */}
      <div className="shrink-0 bg-black/60 backdrop-blur border-t border-white/10 px-4 pt-3 pb-5 space-y-3">
        {/* Seek bar */}
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span>{fmt(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="flex-1 h-1 accent-yellow-400 cursor-pointer"
          />
          <span>{fmt(duration)}</span>
        </div>

        {/* Playback buttons */}
        <div className="flex items-center justify-center gap-6">
          <button onClick={skipBack} className="text-white/60 hover:text-white transition-colors" title="Rewind 5s">
            <SkipBack className="w-6 h-6" />
          </button>
          <button
            onClick={togglePlay}
            className="w-14 h-14 rounded-full bg-yellow-400 flex items-center justify-center text-black hover:bg-yellow-300 transition-colors shadow-lg"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7 ml-1" />
            )}
          </button>
          <button onClick={skipForward} className="text-white/60 hover:text-white transition-colors" title="Forward 5s">
            <SkipForward className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
