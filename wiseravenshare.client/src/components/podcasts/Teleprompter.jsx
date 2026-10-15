import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  Gauge,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Maximize,
  Minimize,
  Type,
} from "lucide-react";

export default function Teleprompter({ script, autoScrollOnRecord }) {
  const [scrolling, setScrolling] = useState(false);
  const [speed, setSpeed] = useState(1.5);
  const [fontSize, setFontSize] = useState(28);
  const [fullscreen, setFullscreen] = useState(false);
  const scrollRef = useRef(null);
  const rafRef = useRef(null);

  // Start auto-scroll when recording begins (if autoScrollOnRecord is set)
  useEffect(() => {
    if (autoScrollOnRecord) setScrolling(true);
  }, [autoScrollOnRecord]);

  const tick = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += speed * 0.6;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
      setScrolling(false);
    }
    if (scrolling) rafRef.current = requestAnimationFrame(tick);
  }, [speed, scrolling]);

  useEffect(() => {
    if (scrolling) {
      rafRef.current = requestAnimationFrame(tick);
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrolling, tick]);

  const reset = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrolling(false);
  };

  const nudge = (dir) => {
    if (scrollRef.current) scrollRef.current.scrollTop += dir * 60;
  };

  const toggleFullscreen = () => {
    const el = scrollRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const lines = (script || "").split("\n");

  return (
    <div className={`flex flex-col rounded-lg border border-border bg-black overflow-hidden ${fullscreen ? "h-screen" : "h-[320px]"}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-border gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Type className="w-4 h-4 text-primary" />
          <span className="font-medium">Teleprompter</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={scrolling ? "default" : "outline"}
            onClick={() => setScrolling((s) => !s)}
            disabled={!script?.trim()}
          >
            {scrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {scrolling ? "Pause" : "Scroll"}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={!script?.trim()}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => nudge(-1)}>
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => nudge(1)}>
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-8 py-6 scroll-smooth"
        style={{ scrollBehavior: "auto" }}
      >
        {script?.trim() ? (
          <div style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }} className="text-center font-body text-foreground/95 max-w-2xl mx-auto">
            {lines.map((line, i) => (
              <p key={i} className="mb-3">
                {line || "\u00A0"}
              </p>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No script yet. Write one in the Script tab.
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 px-3 py-2 bg-card border-t border-border">
        <div className="flex items-center gap-2 flex-1">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Speed</span>
          <Slider
            value={[speed]}
            onValueChange={([v]) => setSpeed(v)}
            min={0.5}
            max={4}
            step={0.25}
            className="flex-1 max-w-[120px]"
          />
          <span className="text-xs text-muted-foreground w-8">{speed}x</span>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Type className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Size</span>
          <Slider
            value={[fontSize]}
            onValueChange={([v]) => setFontSize(v)}
            min={18}
            max={48}
            step={2}
            className="flex-1 max-w-[120px]"
          />
          <span className="text-xs text-muted-foreground w-8">{fontSize}px</span>
        </div>
      </div>
    </div>
  );
}