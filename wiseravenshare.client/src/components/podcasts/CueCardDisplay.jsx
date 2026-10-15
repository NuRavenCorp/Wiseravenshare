import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Megaphone,
  Send,
  X,
  Clock,
  CheckCircle,
  AlertTriangle,
  Volume2,
} from "lucide-react";

const PRESETS = [
  { label: "STARTING SOON", icon: Clock, color: "text-accent" },
  { label: "ON AIR", icon: Volume2, color: "text-green-500" },
  { label: "WRAP UP", icon: AlertTriangle, color: "text-orange-400" },
  { label: "COMMERCIAL BREAK", icon: Clock, color: "text-blue-400" },
  { label: "GOOD TO GO", icon: CheckCircle, color: "text-green-500" },
];

export default function CueCardDisplay({
  canDirect,
  scriptCues = [],
  activeScriptCueIndex = -1,
  onAdvanceScriptCue,
}) {
  const [cue, setCue] = useState("");
  const [activeCue, setActiveCue] = useState(null);
  const [audio, setAudio] = useState(false);

  useEffect(() => {
    if (!activeCue) return;
    const t = setTimeout(() => setActiveCue(null), 8000);
    return () => clearTimeout(t);
  }, [activeCue]);

  useEffect(() => {
    if (
      activeScriptCueIndex >= 0 &&
      activeScriptCueIndex < scriptCues.length &&
      scriptCues[activeScriptCueIndex]
    ) {
      setActiveCue(scriptCues[activeScriptCueIndex].toUpperCase());
    }
  }, [activeScriptCueIndex, scriptCues]);

  const sendCue = (text) => {
    if (!text?.trim()) return;
    setActiveCue(text.toUpperCase());
    setCue("");
    if (audio) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch {
        // audio not available
      }
    }
  };

  return (
    <div className="space-y-3">
      {canDirect && (
        <div className="p-3 rounded-lg border border-border bg-card space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Megaphone className="w-4 h-4 text-primary" /> Director Cue Cards
          </div>
          <div className="flex gap-2">
            <Input
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCue(cue)}
              placeholder="Type a cue for the host..."
              maxLength={60}
            />
            <Button onClick={() => sendCue(cue)} disabled={!cue.trim()} size="sm">
              <Send className="w-3.5 h-3.5" /> Send
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.label}
                  onClick={() => sendCue(p.label)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border bg-secondary/40 hover:bg-primary/10 hover:border-primary/30 transition-colors ${p.color}`}
                >
                  <Icon className="w-3 h-3" /> {p.label}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={audio}
              onChange={(e) => setAudio(e.target.checked)}
              className="accent-primary"
            />
            Play audio chime on send
          </label>
          {scriptCues.length > 0 && (
            <div className="pt-2 border-t border-border/60 space-y-2">
              <p className="text-xs text-muted-foreground">
                Script cue sync:{" "}
                {activeScriptCueIndex >= 0
                  ? `${activeScriptCueIndex + 1} / ${scriptCues.length}`
                  : `0 / ${scriptCues.length}`}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAdvanceScriptCue?.()}
                disabled={
                  !onAdvanceScriptCue ||
                  scriptCues.length === 0 ||
                  activeScriptCueIndex >= scriptCues.length - 1
                }
              >
                Next Script Cue
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Big cue display for host */}
      <div className="relative rounded-lg border border-border bg-black overflow-hidden min-h-[140px] flex items-center justify-center">
        {activeCue ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary/15 animate-[fadeIn_0.15s_ease-out]">
            <button
              onClick={() => setActiveCue(null)}
              className="absolute top-2 right-2 text-foreground/50 hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <Megaphone className="w-8 h-8 text-primary mb-2 animate-pulse" />
            <p className="font-display text-3xl md:text-4xl tracking-wide text-foreground text-center px-6">
              {activeCue}
            </p>
          </div>
        ) : (
          <div className="text-muted-foreground/40 text-sm flex items-center gap-2">
            <Megaphone className="w-4 h-4" /> Cue cards appear here
          </div>
        )}
      </div>
    </div>
  );
}