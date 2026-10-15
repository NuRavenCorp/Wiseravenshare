import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/api/client";
import { MOODS } from "@/components/vibe/TodaysVibe";
import { Sparkles } from "lucide-react";

const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.id, m]));

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export default function VibePill() {
  const [top, setTop] = useState(null);

  useEffect(() => {
    let active = true;
    apiClient.entities.Vibe.aggregate({
      query: { created_date: { $gte: startOfToday() } },
      groupBy: "mood",
      count: true,
    })
      .then((agg) => {
        if (!active) return;
        const rows = (agg.rows || []).sort((a, b) => b.count - a.count);
        if (rows[0]) setTop({ mood: MOOD_MAP[rows[0].mood], count: rows[0].count });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <Link
      to="/#vibe"
      className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-accent/25 bg-accent/10 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0"
      title="Today's Vibe"
    >
      <Sparkles className="w-3 h-3" />
      {top ? (
        <>
          <span className="text-sm">{top.mood.emoji}</span>
          <span className="tabular-nums">{top.count}</span>
        </>
      ) : (
        <span>Vibe</span>
      )}
    </Link>
  );
}