import React, { useState, useRef } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EqualizerPanel({ audioRef }) {
  const [active, setActive] = useState(false);
  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);
  const [compressorOn, setCompressorOn] = useState(false);
  const ctxRef = useRef(null);
  const filtersRef = useRef(null);

  const initAudio = () => {
    if (ctxRef.current || !audioRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(audioRef.current);

      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 250;

      const midFilter = ctx.createBiquadFilter();
      midFilter.type = "peaking";
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 1;

      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = "highshelf";
      trebleFilter.frequency.value = 4000;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = 0;
      compressor.ratio.value = 1;

      source.connect(bassFilter);
      bassFilter.connect(midFilter);
      midFilter.connect(trebleFilter);
      trebleFilter.connect(compressor);
      compressor.connect(ctx.destination);

      ctxRef.current = ctx;
      filtersRef.current = { bass: bassFilter, mid: midFilter, treble: trebleFilter, compressor };
      setActive(true);
    } catch (e) {
      console.error(e);
    }
  };

  const updateEq = (band, value) => {
    const setters = { bass: setBass, mid: setMid, treble: setTreble };
    setters[band](value);
    if (filtersRef.current?.[band]) {
      filtersRef.current[band].gain.value = value;
    }
  };

  const reset = () => {
    updateEq("bass", 0);
    updateEq("mid", 0);
    updateEq("treble", 0);
  };

  const toggleCompressor = () => {
    const newState = !compressorOn;
    setCompressorOn(newState);
    if (filtersRef.current?.compressor) {
      if (newState) {
        filtersRef.current.compressor.threshold.value = -24;
        filtersRef.current.compressor.ratio.value = 12;
      } else {
        filtersRef.current.compressor.threshold.value = 0;
        filtersRef.current.compressor.ratio.value = 1;
      }
    }
  };

  if (!active) {
    return (
      <Button onClick={initAudio} variant="outline" size="sm">
        <SlidersHorizontal className="w-4 h-4" /> Enable Equalizer & Sound Correction
      </Button>
    );
  }

  const bands = [
    { band: "bass", label: "Bass", value: bass },
    { band: "mid", label: "Mid", value: mid },
    { band: "treble", label: "Treble", value: treble },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">Equalizer & Sound Correction</span>
        <div className="flex gap-2">
          <Button variant={compressorOn ? "default" : "outline"} size="sm" onClick={toggleCompressor} className="h-7 text-xs">
            Compressor {compressorOn ? "On" : "Off"}
          </Button>
          <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {bands.map(({ band, label, value }) => (
          <div key={band}>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs text-foreground">{value > 0 ? "+" : ""}{value} dB</span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={value}
              onChange={(e) => updateEq(band, Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        ))}
      </div>
    </div>
  );
}