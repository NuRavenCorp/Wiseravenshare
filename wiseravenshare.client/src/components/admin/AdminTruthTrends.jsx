import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function formatDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildThirtyDayRows(rows) {
  const byDate = {};
  for (const r of rows) {
    const key = (r._id || "").slice(0, 10);
    if (key) byDate[key] = r;
  }
  const today = new Date();
  const result = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const r = byDate[dateStr];
    result.push({
      date: dateStr,
      label: formatDay(dateStr),
      avgScore: r ? Math.round((r.avg_truth_score || 0) * 10) / 10 : null,
      count: r?.count || 0,
    });
  }
  return result;
}

export default function AdminTruthTrends() {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
        const result = await apiClient.entities.Post.aggregate({
          dateBucket: { field: "created_date", unit: "day" },
          avg: "truth_score",
          query: { created_date: { $gte: since } },
          limit: 30,
        });
        setChartData(buildThirtyDayRows(result.rows || []));
      } catch (err) {
        setError(err.message || "Failed to load truth-score trends.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const scoredDays = chartData.filter((d) => d.avgScore !== null);
  const overallAvg =
    scoredDays.length > 0
      ? Math.round(
          (scoredDays.reduce((s, d) => s + d.avgScore, 0) / scoredDays.length) * 10
        ) / 10
      : null;
  const totalPosts = chartData.reduce((s, d) => s + d.count, 0);

  // Trend direction: compare last 7 days avg vs previous 7 days
  const last7 = chartData.slice(-7).filter((d) => d.avgScore !== null);
  const prev7 = chartData.slice(-14, -7).filter((d) => d.avgScore !== null);
  let trendDir = "flat";
  let trendDelta = 0;
  if (last7.length > 0 && prev7.length > 0) {
    const last7Avg = last7.reduce((s, d) => s + d.avgScore, 0) / last7.length;
    const prev7Avg = prev7.reduce((s, d) => s + d.avgScore, 0) / prev7.length;
    trendDelta = Math.round((last7Avg - prev7Avg) * 10) / 10;
    if (trendDelta > 1) trendDir = "up";
    else if (trendDelta < -1) trendDir = "down";
  }

  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  const trendColor =
    trendDir === "up" ? "text-green-500" : trendDir === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-border bg-card/50">
          <p className="text-sm text-muted-foreground mb-1">30-Day Average</p>
          <p className="text-3xl font-heading text-foreground">
            {overallAvg !== null ? `${overallAvg}/100` : "—"}
          </p>
        </div>
        <div className="p-5 rounded-2xl border border-border bg-card/50">
          <p className="text-sm text-muted-foreground mb-1">Week-over-Week Trend</p>
          <div className="flex items-center gap-2">
            <TrendIcon className={`w-6 h-6 ${trendColor}`} />
            <span className={`text-2xl font-heading ${trendColor}`}>
              {trendDelta > 0 ? "+" : ""}
              {trendDelta}
            </span>
          </div>
        </div>
        <div className="p-5 rounded-2xl border border-border bg-card/50">
          <p className="text-sm text-muted-foreground mb-1">Posts in Period</p>
          <p className="text-3xl font-heading text-foreground">{totalPosts}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="p-6 rounded-2xl border border-border bg-card/50">
        <h3 className="font-heading text-lg text-foreground mb-4">
          Average Truth Score — Last 30 Days
        </h3>
        {scoredDays.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            No scored content in the last 30 days.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                interval={3}
                stroke="hsl(var(--border))"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                stroke="hsl(var(--border))"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}
                formatter={(value) => [value !== null ? `${value}/100` : "No data", "Avg Truth Score"]}
                labelFormatter={(label, payload) => {
                  const p = payload?.[0]?.payload;
                  return p ? `${p.label} (${p.count} posts)` : label;
                }}
              />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}