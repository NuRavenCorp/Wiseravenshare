import React, { useEffect, useState } from "react";

/**
 * TuningDial — FM-style frequency dial with a moving needle.
 * Simulates analog tuning by sweeping the needle to the target frequency.
 * Preset stations map to real FM-style frequencies; digitized stations
 * get a pseudo-frequency derived from their name hash.
 */

const FREQ_MIN = 88.0;
const FREQ_MAX = 108.0;
const SWEEP_DURATION = 900; // ms

// Hash a station name to a pseudo-frequency in the FM band
export function stationToFrequency(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const range = FREQ_MAX - FREQ_MIN;
  const offset = (hash % 1000) / 1000 * range;
  return Math.round((FREQ_MIN + offset) * 10) / 10;
}

export default function TuningDial({ frequency, playing, label, sourceType }) {
  const [needle, setNeedle] = useState(frequency || FREQ_MIN);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!frequency) return;
    setScanning(true);
    const start = needle;
    const end = frequency;
    const startTime = performance.now();

    let raf;
    const tick = (now) => {
      const t = Math.min((now - startTime) / SWEEP_DURATION, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const val = start + (end - start) * eased;
      setNeedle(val);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setScanning(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
     
  }, [frequency]);

  const pct = ((needle - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * 100;
  const ticks = [];
  for (let f = FREQ_MIN; f <= FREQ_MAX; f += 2) {
    ticks.push(f);
  }

  return (
    <div
      className="relative rounded-lg border border-border p-4"
      style={{
        background: "linear-gradient(180deg, #0b090e, #17121c)",
        boxShadow: "inset 0 2px 6px #000b",
      }}
    >
      {/* Frequency display */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <div
            className="font-mono text-2xl tabular-nums tracking-tight"
            style={{ color: scanning ? "#e8c46a" : "#a36be8", textShadow: "0 0 12px currentColor" }}
          >
            {needle.toFixed(1)}
          </div>
          <div className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase">MHz</div>
        </div>
        <div className="text-right">
          <div className={`text-xs font-semibold ${playing ? "text-green-400" : "text-muted-foreground"}`}>
            {scanning ? "TUNING…" : playing ? "LOCKED" : "STANDBY"}
          </div>
          {playing && !scanning && sourceType && (
            <div className={`text-[10px] font-semibold tracking-wider ${sourceType === "internet" ? "text-accent" : "text-primary"}`}>
              {sourceType === "internet" ? "● INTERNET" : "● LOCAL FM"}
            </div>
          )}
          {label && <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{label}</div>}
        </div>
      </div>

      {/* Dial scale */}
      <div className="relative h-12" style={{ background: "linear-gradient(180deg, #1a1422, #100c14)", borderRadius: "6px", border: "1px solid #3a2f44" }}>
        {/* Tick marks */}
        <div className="absolute inset-0 flex items-end justify-between px-1 pb-1">
          {ticks.map((f) => {
            const tickPct = ((f - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * 100;
            const isMajor = f % 4 === 0;
            return (
              <div
                key={f}
                className="absolute flex flex-col items-center"
                style={{ left: `${tickPct}%`, transform: "translateX(-50%)" }}
              >
                <div
                  style={{
                    width: 1,
                    height: isMajor ? 14 : 8,
                    background: isMajor ? "#8d52e0" : "#594b62",
                  }}
                />
                {isMajor && (
                  <span className="text-[8px] text-muted-foreground mt-0.5 font-mono">{f.toFixed(0)}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Needle */}
        <div
          className="absolute top-0 bottom-0 transition-none"
          style={{
            left: `${pct}%`,
            transform: "translateX(-50%)",
            transition: scanning ? "none" : "left 0.3s ease-out",
          }}
        >
          <div
            className="w-[2px] h-full mx-auto"
            style={{
              background: scanning ? "#e8c46a" : "#a36be8",
              boxShadow: `0 0 8px ${scanning ? "#e8c46a" : "#8d52e0"}`,
            }}
          />
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: `6px solid ${scanning ? "#e8c46a" : "#a36be8"}`,
            }}
          />
        </div>

        {/* Signal strength bars (right side) */}
        <div className="absolute right-2 top-2 flex items-end gap-[2px]">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-[3px] rounded-sm transition-all"
              style={{
                height: 4 + i * 3,
                background: playing && !scanning && i < 3 ? "#4ade80" : "#594b62",
                boxShadow: playing && !scanning && i < 3 ? "0 0 4px #4ade80" : "none",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}