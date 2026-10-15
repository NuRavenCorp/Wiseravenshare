import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { MOODS } from "@/components/vibe/TodaysVibe";
import { Loader2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.id, m]));

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export default function VibeSidebarWidget() {
  const { isAuthenticated } = useAuth();
  const [myVibe, setMyVibe] = useState(null);
  const [flockTop, setFlockTop] = useState(null);
  const [flockCount, setFlockCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const since = startOfToday();
    try {
      const [agg, feedPage] = await Promise.all([
        apiClient.entities.Vibe.aggregate({
          query: { created_date: { $gte: since } },
          groupBy: "mood",
          count: true,
        }),
        apiClient.entities.Vibe.filter(
          { created_date: { $gte: since } },
          { sort: "-created_date", limit: 50 }
        ),
      ]);
      const rows = (agg.rows || []).sort((a, b) => b.count - a.count);
      setFlockCount(rows.reduce((s, r) => s + r.count, 0));
      if (rows[0]) setFlockTop(MOOD_MAP[rows[0].mood]);
      const items = feedPage.items || [];
      if (isAuthenticated) {
        const me = await apiClient.auth.me().catch(() => null);
        if (me) {
          const mine = items.find((v) => v.created_by_id === me.id);
          if (mine) setMyVibe(mine);
        }
      }
    } catch {
      // soft fail
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  const pickMood = async (moodId) => {
    setSubmitting(true);
    try {
      if (myVibe) {
        const updated = await apiClient.entities.Vibe.update(myVibe.id, { mood: moodId });
        setMyVibe(updated);
      } else {
        const created = await apiClient.entities.Vibe.create({ mood: moodId });
        setMyVibe(created);
      }
      setExpanded(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mb-4 p-3 rounded-lg border border-accent/20 bg-accent/5 text-center">
        <Sparkles className="w-4 h-4 text-accent mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">Sign in to share your vibe</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-4 p-3 rounded-lg border border-border bg-secondary/30 flex justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const myMood = myVibe ? MOOD_MAP[myVibe.mood] : null;

  return (
    <div className="mb-4 p-3 rounded-lg border border-border bg-secondary/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{myMood ? myMood.emoji : "🪶"}</span>
          <div className="text-left min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Your Vibe</p>
            <p className={`text-xs font-medium truncate ${myMood ? myMood.color : "text-muted-foreground"}`}>
              {myMood ? myMood.label : "Not set"}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m.id}
              onClick={() => pickMood(m.id)}
              disabled={submitting}
              title={m.label}
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-md border transition-all disabled:opacity-50 ${
                myVibe?.mood === m.id
                  ? "border-primary bg-primary/15"
                  : "border-transparent hover:bg-secondary/60"
              }`}
            >
              <span className="text-base">{m.emoji}</span>
            </button>
          ))}
        </div>
      )}

      {flockTop && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Flock</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span>{flockTop.emoji}</span>
            <span className="tabular-nums">{flockCount}</span>
          </span>
        </div>
      )}
    </div>
  );
}