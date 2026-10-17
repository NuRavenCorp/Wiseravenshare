import React, { useMemo, useState } from "react";
import TuningDial, { stationToFrequency } from "@/components/media/TuningDial";

const FM_MIN = 88.0;
const FM_MAX = 108.0;

export default function FMTunerModule({ onFrequencyChange }) {
  const [frequency, setFrequency] = useState(98.5);
  const [stationName, setStationName] = useState("WISERAVENSHARE FM");

  const displayFrequency = useMemo(() => {
    const stationFreq = stationToFrequency(stationName);
    return Number.isFinite(stationFreq) ? stationFreq : frequency;
  }, [frequency, stationName]);

  const handleFrequencyChange = (event) => {
    const next = Number(event.target.value);
    setFrequency(next);
    if (typeof onFrequencyChange === "function") {
      onFrequencyChange(next);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/95 p-4">
      <TuningDial
        frequency={displayFrequency}
        playing={true}
        label={stationName}
        sourceType="local"
      />
      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-wider text-muted-foreground">Tune Frequency</label>
        <input
          type="range"
          min={FM_MIN}
          max={FM_MAX}
          step="0.1"
          value={frequency}
          onChange={handleFrequencyChange}
          className="w-full accent-primary"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{FM_MIN.toFixed(1)} MHz</span>
          <span className="text-foreground font-medium">{frequency.toFixed(1)} MHz</span>
          <span>{FM_MAX.toFixed(1)} MHz</span>
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Station Label</label>
        <input
          type="text"
          value={stationName}
          onChange={(event) => setStationName(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          placeholder="Station name"
        />
      </div>
    </div>
  );
}
