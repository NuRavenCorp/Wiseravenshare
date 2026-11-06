import React from "react";
import { usePlayer } from "@/lib/PlayerContext";
import {
  Play, Pause, SkipBack, SkipForward, X, Volume2, VolumeX,
  Shuffle, Repeat, Repeat1, Music, Loader2,
} from "lucide-react";

const fmt = (s) => {
  if (!s || isNaN(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export default function MiniPlayerBar() {
  const {
    currentTrack, isPlaying, progress, duration,
    volume, muted, shuffle, repeat, loading, error,
    playPause, next, prev, seek, stop, setVolume, toggleMute, toggleShuffle, cycleRepeat,
  } = usePlayer();

  if (!currentTrack) return null;

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md shadow-2xl"
      role="region"
      aria-label="Music player"
    >
      {/* Progress bar — full width, hairline */}
      <div className="relative h-1 bg-secondary overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-primary transition-none"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={progress}
          step={0.1}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={loading || !duration}
          aria-label="Seek"
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2">
        {/* Track info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
              : <Music className="w-4 h-4 text-primary" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-foreground leading-tight">
              {currentTrack.title}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">
              {error
                ? <span className="text-destructive">{error}</span>
                : <>{fmt(progress)} / {fmt(duration)}</>}
            </p>
          </div>
        </div>

        {/* Core controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            onClick={toggleShuffle}
            title="Shuffle"
            className={`p-1.5 rounded transition-colors ${shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={prev}
            disabled={loading}
            title="Previous"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={playPause}
            disabled={loading}
            title={isPlaying ? "Pause" : "Play"}
            className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-sm"
          >
            {isPlaying
              ? <Pause className="w-4 h-4" />
              : <Play className="w-4 h-4 translate-x-px" />}
          </button>

          <button
            onClick={() => next()}
            disabled={loading}
            title="Next"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            onClick={cycleRepeat}
            title={`Repeat: ${repeat}`}
            className={`p-1.5 rounded transition-colors ${repeat !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <RepeatIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Volume + Stop */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleMute}
            title={muted ? "Unmute" : "Mute"}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              if (muted && v > 0) toggleMute();
            }}
            aria-label="Volume"
            className="w-16 accent-primary cursor-pointer"
          />
        </div>

        <button
          onClick={stop}
          title="Stop & dismiss"
          className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
