import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Send, Sparkles, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const MOODS = [
  { id: "inspired", emoji: "✨", label: "Inspired", color: "text-accent", bar: "bg-accent" },
  { id: "fired_up", emoji: "🔥", label: "Fired Up", color: "text-orange-400", bar: "bg-orange-400" },
  { id: "chill", emoji: "😌", label: "Chill", color: "text-blue-300", bar: "bg-blue-300" },
  { id: "curious", emoji: "🤔", label: "Curious", color: "text-purple-300", bar: "bg-purple-300" },
  { id: "loved", emoji: "💜", label: "Loved", color: "text-pink-400", bar: "bg-pink-400" },
  { id: "tired", emoji: "😴", label: "Tired", color: "text-slate-400", bar: "bg-slate-400" },
  { id: "creative", emoji: "🎨", label: "Creative", color: "text-emerald-300", bar: "bg-emerald-300" },
  { id: "reflective", emoji: "🌊", label: "Reflective", color: "text-cyan-300", bar: "bg-cyan-300" },
];

const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.id, m]));

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export default function TodaysVibe() {
  const { isAuthenticated } = useAuth();
  const [user, setUser] = useState(null);
  const [distribution, setDistribution] = useState([]);
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState([]);
  const [myVibe, setMyVibe] = useState(null);
  const [selectedMood, setSelectedMood] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
      setDistribution(rows);
      setTotal(rows.reduce((s, r) => s + r.count, 0));
      const items = feedPage.items || [];
      setRecent(items.slice(0, 8));
      if (isAuthenticated) {
        const me = await apiClient.auth.me().catch(() => null);
        if (me) {
          setUser(me);
          const mine = items.find((v) => v.created_by_id === me.id);
          if (mine) {
            setMyVibe(mine);
            setSelectedMood(mine.mood);
            setNote(mine.note || "");
          }
        }
      }
    } catch {
      // soft fail — widget degrades to empty state
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!selectedMood || !user) return;
    setSubmitting(true);
    try {
      if (myVibe) {
        const updated = await apiClient.entities.Vibe.update(myVibe.id, {
          mood: selectedMood,
          note: note.trim() || undefined,
        });
        setMyVibe(updated);
      } else {
        const created = await apiClient.entities.Vibe.create({
          mood: selectedMood,
          note: note.trim() || undefined,
        });
        setMyVibe(created);
      }
      setNote("");
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const topMood = distribution[0] ? MOOD_MAP[distribution[0].mood] : null;
  const maxCount = distribution[0]?.count || 1;

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Community pulse */}
      <div className="rounded-2xl border border-border bg-card/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-foreground">The Flock Today</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {total} {total === 1 ? "vibe" : "vibes"} shared
          </span>
        </div>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No vibes yet today — be the first to share how you're feeling.
          </p>
        ) : (
          <>
            {topMood && (
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                <span className="text-3xl">{topMood.emoji}</span>
                <div>
                  <p className="text-xs text-muted-foreground">Dominant mood</p>
                  <p className={`text-lg font-heading ${topMood.color}`}>
                    {topMood.label}
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {distribution.map((row) => {
                const mood = MOOD_MAP[row.mood];
                if (!mood) return null;
                return (
                  <div key={row.mood} className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center">{mood.emoji}</span>
                    <span className="text-xs text-muted-foreground w-20 shrink-0">
                      {mood.label}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${mood.bar} transition-all duration-500`}
                        style={{ width: `${(row.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right tabular-nums">
                      {row.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Mood picker */}
      {isAuthenticated ? (
        <div className="rounded-2xl border border-border bg-card/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {myVibe ? "Update your vibe" : "How are you feeling?"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {MOODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMood(m.id)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all ${
                  selectedMood === m.id
                    ? "border-primary bg-primary/15 scale-105"
                    : "border-border bg-secondary/30 hover:bg-secondary/60"
                }`}
              >
                <span className="text-2xl">{m.emoji}</span>
                <span className={`text-xs ${selectedMood === m.id ? m.color : "text-muted-foreground"}`}>
                  {m.label}
                </span>
              </button>
            ))}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)..."
            maxLength={280}
            className="mb-3 resize-none"
            rows={2}
          />
          <Button
            onClick={submit}
            disabled={!selectedMood || submitting}
            className="w-full rounded-full"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {myVibe ? "Update Vibe" : "Share Vibe"}
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card/60 p-5 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Sign in to share your vibe and join the flock's pulse.
          </p>
          <Button asChild className="rounded-full">
            <a href="/login">Enter the Flock</a>
          </Button>
        </div>
      )}

      {/* Recent vibes */}
      {recent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 tracking-wide uppercase">
            Recent Vibes
          </p>
          <div className="space-y-2">
            {recent.map((v) => {
              const mood = MOOD_MAP[v.mood];
              if (!mood) return null;
              return (
                <div
                  key={v.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/40"
                >
                  <span className="text-xl shrink-0">{mood.emoji}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${mood.color}`}>{mood.label}</p>
                    {v.note && (
                      <p className="text-sm text-muted-foreground mt-0.5 break-words">
                        {v.note}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}