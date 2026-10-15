import React from "react";

const FREQ_LABELS = ["31", "62", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"];

export default function RadioEqualizer({ gains, onChange }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs tracking-wider uppercase text-muted-foreground">10-Band EQ</span>
        <button onClick={() => onChange(new Array(10).fill(0))} className="text-xs text-muted-foreground hover:text-foreground">
          Reset
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {FREQ_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-8 shrink-0">{label}</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={gains[i] || 0}
              onChange={(e) => {
                const next = [...gains];
                next[i] = Number(e.target.value);
                onChange(next);
              }}
              className="flex-1 accent-primary"
            />
            <span className="text-[10px] text-muted-foreground w-6 tabular-nums shrink-0">
              {gains[i] > 0 ? "+" : ""}{gains[i] || 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}