import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Metronome({ initialBpm = 120, onBpmChange }) {
  const [bpm, setBpm] = useState(initialBpm);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const ctxRef = useRef(null);
  const timerRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerMeasure);

  useEffect(() => {
    bpmRef.current = bpm;
    onBpmChange?.(bpm);
  }, [bpm, onBpmChange]);

  useEffect(() => {
    beatsRef.current = beatsPerMeasure;
  }, [beatsPerMeasure]);

  const scheduleNote = useCallback((beat, time) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (beat === 0) {
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.4, time);
    } else {
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.25, time);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.05);
    const delay = Math.max(0, (time - ctx.currentTime) * 1000);
    setTimeout(() => setCurrentBeat(beat), delay);
  }, []);

  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      scheduleNote(beatRef.current, nextNoteTimeRef.current);
      const secondsPerBeat = 60.0 / bpmRef.current;
      nextNoteTimeRef.current += secondsPerBeat;
      beatRef.current = (beatRef.current + 1) % beatsRef.current;
    }
    timerRef.current = setTimeout(scheduler, 25);
  }, [scheduleNote]);

  const start = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    beatRef.current = 0;
    nextNoteTimeRef.current = ctxRef.current.currentTime + 0.05;
    setIsPlaying(true);
    scheduler();
  };

  const stop = () => {
    setIsPlaying(false);
    clearTimeout(timerRef.current);
    setCurrentBeat(-1);
  };

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      if (ctxRef.current) ctxRef.current.close();
    };
  }, []);

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-muted-foreground">Metronome</span>
        <Button size="icon" onClick={isPlaying ? stop : start}>
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
      </div>
      <div className="flex justify-center gap-2 mb-4">
        {Array.from({ length: beatsPerMeasure }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-all duration-100 ${
              currentBeat === i ? "bg-accent scale-125" : "bg-secondary"
            }`}
          />
        ))}
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-muted-foreground">Tempo</span>
            <span className="text-xs text-foreground font-medium">{bpm} BPM</span>
          </div>
          <input
            type="range"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div>
          <span className="text-xs text-muted-foreground block mb-1">Time Signature</span>
          <div className="flex gap-2">
            {[3, 4, 6].map((b) => (
              <button
                key={b}
                onClick={() => setBeatsPerMeasure(b)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  beatsPerMeasure === b
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {b}/{b === 6 ? 8 : 4}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}