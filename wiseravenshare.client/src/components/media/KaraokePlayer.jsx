import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Play, Pause, SkipBack, SkipForward, ArrowLeft, Music, Mic, Loader2, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseLrc } from "@/lib/lrcParser";
import { apiClient } from "@/api/client";

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
export default function KaraokePlayer({ song, onClose, onSaved }) {
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const filtersRef = useRef([]);
  const lyricsContainerRef = useRef(null);
  const activeLineRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lrcData, setLrcData] = useState(null);
  const [fetchingLrc, setFetchingLrc] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const [eqPreset, setEqPreset] = useState("Flat");
  const [showEq, setShowEq] = useState(false);
  const [lrcSaved, setLrcSaved] = useState(false);

  // Parse LRC whenever song or fetched content changes
  const parsedLrc = useMemo(() => {
    const content = lrcData ?? song?.lrcContent ?? "";
    return parseLrc(content);
  }, [lrcData, song?.lrcContent]);

  const lines = parsedLrc.lines;

  // Fetch LRC from LRCLIB if not present
  useEffect(() => {
    if (song?.lrcContent || !song?.title) return;
    setFetchingLrc(true);
    const artist = encodeURIComponent(song.artist ?? "");
    const title = encodeURIComponent(song.title ?? "");
    fetch(`https://lrclib.net/api/get?artist_name=${artist}&track_name=${title}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (!data) return;
        const lrc = data.syncedLyrics ?? "";
        const plain = data.plainLyrics ?? "";
        if (lrc) {
          setLrcData(lrc);
          // Save back to server
          try {
            await apiClient.karaoke.songs.update(song.id, {
              lrcContent: lrc,
              plainLyrics: plain,
            });
            setLrcSaved(true);
            onSaved?.({ ...song, lrcContent: lrc, plainLyrics: plain });
          } catch (_) {
            // Best-effort
          }
        }
      })
      .catch(() => {})
      .finally(() => setFetchingLrc(false));
  }, [song]);

  // Audio source URL
  const audioUrl = useMemo(
    () => song?.audioUrl ?? apiClient.karaoke.songs.streamUrl(song?.id),
    [song]
  );

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

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onDurationChange={(e) => setDuration(e.target.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />

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
            size="icon"
            onClick={() => setShowEq((p) => !p)}
            className={`text-white hover:bg-white/10 ${showEq ? "bg-white/20" : ""}`}
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
          <div className="flex flex-col items-center justify-center h-full gap-4 text-white/30">
            <Mic className="w-12 h-12" />
            <p className="text-sm">
              {fetchingLrc ? "Fetching lyrics…" : "No lyrics available"}
            </p>
          </div>
        ) : (
          lines.map((line, i) => {
            const isActive = i === activeLineIdx;
            const dist = Math.abs(i - activeLineIdx);
            const opacity =
              isActive ? 1 : dist === 1 ? 0.45 : dist === 2 ? 0.25 : 0.12;

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
                {isActive && line.words ? (
                  line.words.map((w, wi) => (
                    <span
                      key={wi}
                      className={`transition-colors duration-100 ${
                        wi <= activeWordIdx
                          ? "text-yellow-300 word-active"
                          : "text-white"
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
          <button onClick={skipBack} className="text-white/60 hover:text-white transition-colors">
            <SkipBack className="w-6 h-6" />
          </button>
          <button
            onClick={togglePlay}
            className="w-14 h-14 rounded-full bg-yellow-400 flex items-center justify-center text-black hover:bg-yellow-300 transition-colors shadow-lg"
          >
            {playing ? (
              <Pause className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7 ml-1" />
            )}
          </button>
          <button onClick={skipForward} className="text-white/60 hover:text-white transition-colors">
            <SkipForward className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
