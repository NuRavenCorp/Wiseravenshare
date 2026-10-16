import React, { useState, useRef, useEffect, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";

export default function MultitrackEditor({ tracks = [], onTracksChange, projectId }) {
  const [playing, setPlaying] = useState(false);
  const wavesurfersRef = useRef({});
  const fileInputRef = useRef(null);

  // Create/destroy WaveSurfer instances when tracks change
  useEffect(() => {
    const currentIds = new Set(tracks.map((t) => t.id));

    // Remove instances for tracks that no longer exist
    Object.keys(wavesurfersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        wavesurfersRef.current[id]?.destroy();
        delete wavesurfersRef.current[id];
      }
    });
  }, [tracks]);

  const initWaveSurfer = useCallback((track, container) => {
    if (!container || wavesurfersRef.current[track.id]) return;
    if (!track.blobUrl) return;

    const ws = WaveSurfer.create({
      container,
      waveColor: "#7c3aed",
      progressColor: "#4c1d95",
      height: 80,
      interact: true,
      normalize: true,
    });

    ws.load(track.blobUrl);
    ws.setVolume(track.volume ?? 1);
    if (track.muted) ws.setMuted(true);

    wavesurfersRef.current[track.id] = ws;
  }, []);

  const handlePlay = () => {
    const wsList = Object.values(wavesurfersRef.current);
    if (wsList.length === 0) return;
    wsList.forEach((ws) => ws.play());
    setPlaying(true);
  };

  const handleStop = () => {
    Object.values(wavesurfersRef.current).forEach((ws) => {
      ws.stop();
    });
    setPlaying(false);
  };

  const handleSeek = (e) => {
    const pct = Number(e.target.value) / 100;
    Object.values(wavesurfersRef.current).forEach((ws) => {
      ws.seekTo(pct);
    });
  };

  const handleToggleMute = (trackId) => {
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;
      const muted = !t.muted;
      wavesurfersRef.current[trackId]?.setMuted(muted);
      return { ...t, muted };
    });
    onTracksChange?.(updated);
  };

  const handleToggleSolo = (trackId) => {
    const isSoloed = !tracks.find((t) => t.id === trackId)?.soloed;
    const updated = tracks.map((t) => {
      const solo = t.id === trackId ? isSoloed : false;
      const muted = isSoloed ? t.id !== trackId : false;
      wavesurfersRef.current[t.id]?.setMuted(muted);
      return { ...t, soloed: solo, muted };
    });
    onTracksChange?.(updated);
  };

  const handleVolume = (trackId, vol) => {
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;
      wavesurfersRef.current[trackId]?.setVolume(Number(vol));
      return { ...t, volume: Number(vol) };
    });
    onTracksChange?.(updated);
  };

  const handleAddTrack = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    const newTrack = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^/.]+$/, ""),
      blobUrl,
      volume: 1,
      muted: false,
      soloed: false,
    };
    onTracksChange?.([...tracks, newTrack]);
    e.target.value = "";
  };

  const handleRemoveTrack = (trackId) => {
    wavesurfersRef.current[trackId]?.destroy();
    delete wavesurfersRef.current[trackId];
    onTracksChange?.(tracks.filter((t) => t.id !== trackId));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-sm">Multitrack Editor</span>
        <div className="flex gap-2 items-center">
          <Button size="sm" onClick={playing ? handleStop : handlePlay} variant={playing ? "destructive" : "default"}>
            {playing ? "■ Stop" : "▶ Play All"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            + Add Track
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={handleAddTrack}
          />
        </div>
      </div>

      {/* Global seek */}
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Seek</span>
        <input type="range" min={0} max={100} step={0.1} defaultValue={0} onChange={handleSeek} className="w-full accent-primary" />
      </div>

      {/* Tracks */}
      <div className="space-y-3">
        {tracks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No tracks yet. Click &quot;Add Track&quot; to load an audio file.
          </p>
        )}
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            onInit={initWaveSurfer}
            onMute={handleToggleMute}
            onSolo={handleToggleSolo}
            onVolume={handleVolume}
            onRemove={handleRemoveTrack}
          />
        ))}
      </div>
    </div>
  );
}

function TrackRow({ track, onInit, onMute, onSolo, onVolume, onRemove }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      onInit(track, containerRef.current);
    }
  }, [track.id, track.blobUrl]);

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{track.name}</span>
        <button
          onClick={() => onMute(track.id)}
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            track.muted ? "bg-yellow-500 text-black" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          M
        </button>
        <button
          onClick={() => onSolo(track.id)}
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            track.soloed ? "bg-green-500 text-black" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          S
        </button>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={track.volume ?? 1}
            onChange={(e) => onVolume(track.id, e.target.value)}
            className="w-20 accent-primary"
          />
        </div>
        <button
          onClick={() => onRemove(track.id)}
          className="text-xs text-destructive hover:underline"
        >
          Remove
        </button>
      </div>
      {track.blobUrl ? (
        <div ref={containerRef} />
      ) : (
        <div className="h-20 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
          No audio loaded
        </div>
      )}
    </div>
  );
}
