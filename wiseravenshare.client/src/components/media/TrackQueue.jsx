import React from "react";
import { Play, Pause, Star, X, ChevronUp, ChevronDown, Trash2, ListRestart } from "lucide-react";

export default function TrackQueue({ tracks, currentId, playing, favorites, onPlay, onToggleFav, onRemove, onReorder, onClear, onReset }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs tracking-wider uppercase text-muted-foreground">Queue ({tracks.length})</span>
        <div className="flex gap-3">
          <button onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ListRestart className="w-3 h-3" /> Reset
          </button>
          <button onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Queue is empty</p>
        ) : (
          tracks.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center gap-2 p-2 rounded-md text-sm transition-colors ${
                currentId === t.id ? "bg-primary/15 border border-primary/30" : "hover:bg-secondary/50"
              }`}
            >
              <button onClick={() => onPlay(t.id)} className="shrink-0 text-muted-foreground hover:text-primary">
                {currentId === t.id && playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <span className="flex-1 truncate text-foreground">{t.title}</span>
              <button onClick={() => onToggleFav(t.id)} className={`shrink-0 ${favorites.includes(t.id) ? "text-accent" : "text-muted-foreground hover:text-accent"}`}>
                <Star className="w-3.5 h-3.5" fill={favorites.includes(t.id) ? "currentColor" : "none"} />
              </button>
              <button onClick={() => onReorder(i, -1)} disabled={i === 0} className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onReorder(i, 1)} disabled={i === tracks.length - 1} className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onRemove(t.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}