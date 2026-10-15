import React, { useState, useEffect } from "react";
import {
  Loader2, Heart, MessageSquare, Share2, Repeat2, Award,
  ShieldCheck, TrendingUp, FileText, Music, Video, Image as ImageIcon,
  Newspaper, Mic, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend,
  LineChart, Line,
} from "recharts";
import { apiClient } from "@/api/client";
import { format, parseISO } from "date-fns";

const PALETTE = [
  "hsl(265 70% 60%)", "hsl(280 60% 55%)", "hsl(43 80% 64%)",
  "hsl(220 70% 55%)", "hsl(320 60% 58%)", "hsl(190 70% 55%)",
];

const TYPE_META = {
  text: { icon: FileText, label: "Text" },
  photo: { icon: ImageIcon, label: "Photo" },
  video: { icon: Video, label: "Video" },
  music: { icon: Music, label: "Music" },
  journalism: { icon: Newspaper, label: "Journalism" },
  karaoke: { icon: Mic, label: "Karaoke" },
};

const TRUTH_COLORS = {
  verified: "text-green-500",
  unverified: "text-muted-foreground",
  flagged: "text-red-400",
  challenged: "text-amber-400",
};

const STATUS_COLORS = {
  verified: "hsl(142 70% 45%)",
  unverified: "hsl(270 12% 62%)",
  flagged: "hsl(0 72% 55%)",
  challenged: "hsl(43 80% 64%)",
};

const METRIC_KEYS = new Set([
  "count", "sum_like_count", "sum_comment_count", "sum_share_count",
  "sum_repost_count", "sum_challenge_count", "avg_truth_score",
]);

function scoreColor(score) {
  if (score >= 75) return "text-green-500";
  if (score >= 50) return "text-accent";
  if (score >= 25) return "text-amber-400";
  return "text-red-400";
}

export default function ContentPerformance() {
  const [loading, setLoading] = useState(true);
  const [typeRows, setTypeRows] = useState([]);
  const [timeRows, setTimeRows] = useState([]);
  const [topPosts, setTopPosts] = useState([]);
  const [truthTrend, setTruthTrend] = useState([]);
  const [statusRows, setStatusRows] = useState([]);
  const [totals, setTotals] = useState({
    posts: 0, likes: 0, comments: 0, shares: 0, reposts: 0, avgScore: 0, verified: 0,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiClient.auth.me();
        if (!me) return;
        const query = { created_by_id: me.id };
        const [typeAgg, timeAgg, postPage, truthTimeAgg, statusAgg] = await Promise.all([
          apiClient.entities.Post.aggregate({
            query,
            groupBy: "post_type",
            count: true,
            sum: ["like_count", "comment_count", "share_count", "repost_count"],
            avg: "truth_score",
          }),
          apiClient.entities.Post.aggregate({
            query,
            dateBucket: { field: "created_date", unit: "month" },
            count: true,
            sum: ["like_count", "comment_count"],
          }),
          apiClient.entities.Post.filter(query, {
            sort: "-like_count",
            limit: 25,
            fields: [
              "content", "post_type", "like_count", "comment_count",
              "share_count", "repost_count", "truth_score", "truth_status", "created_date",
            ],
          }),
          apiClient.entities.Post.aggregate({
            query,
            dateBucket: { field: "created_date", unit: "month" },
            avg: "truth_score",
            count: true,
          }),
          apiClient.entities.Post.aggregate({
            query,
            groupBy: "truth_status",
            count: true,
          }),
        ]);

        const tRows = typeAgg.rows || [];
        setTypeRows(tRows);

        const statusData = (statusAgg.rows || []).map((r) => ({
          name: r.truth_status || "unverified",
          value: r.count || 0,
        }));
        setStatusRows(statusData);
        const verifiedCount = statusData.find((d) => d.name === "verified")?.value || 0;

        let likes = 0, comments = 0, shares = 0, reposts = 0, posts = 0;
        let scoreSum = 0, scoreCount = 0;
        tRows.forEach((r) => {
          likes += r.sum_like_count || 0;
          comments += r.sum_comment_count || 0;
          shares += r.sum_share_count || 0;
          reposts += r.sum_repost_count || 0;
          posts += r.count || 0;
          if (r.avg_truth_score) {
            scoreSum += r.avg_truth_score * (r.count || 0);
            scoreCount += r.count || 0;
          }
        });
        setTotals({
          posts, likes, comments, shares, reposts,
          avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
          verified: verifiedCount,
        });

        const timeData = (timeAgg.rows || []).map((r) => {
          const dateKey = Object.keys(r).find((k) => !METRIC_KEYS.has(k));
          let label = dateKey ? String(r[dateKey]) : "";
          try { label = format(parseISO(label + "-01"), "MMM yy"); } catch { /* keep raw */ }
          return {
            label,
            likes: r.sum_like_count || 0,
            comments: r.sum_comment_count || 0,
          };
        });
        setTimeRows(timeData);

        const items = (postPage.items || []).map((p) => ({
          ...p,
          engagement: (p.like_count || 0) + (p.comment_count || 0) + (p.share_count || 0) + (p.repost_count || 0),
        })).sort((a, b) => b.engagement - a.engagement);
        setTopPosts(items);

        const truthTrendData = (truthTimeAgg.rows || []).map((r) => {
          const dateKey = Object.keys(r).find((k) => !METRIC_KEYS.has(k));
          let label = dateKey ? String(r[dateKey]) : "";
          try { label = format(parseISO(label + "-01"), "MMM yy"); } catch { /* keep raw */ }
          return { label, score: Math.round(r.avg_truth_score || 0), posts: r.count || 0 };
        });
        setTruthTrend(truthTrendData);
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

  const statCards = [
    { icon: FileText, label: "Total Posts", value: totals.posts, color: "text-primary" },
    { icon: Heart, label: "Total Likes", value: totals.likes, color: "text-pink-400" },
    { icon: MessageSquare, label: "Comments", value: totals.comments, color: "text-blue-400" },
    { icon: Share2, label: "Shares", value: totals.shares, color: "text-purple-400" },
    { icon: Repeat2, label: "Reposts", value: totals.reposts, color: "text-cyan-400" },
    { icon: Award, label: "Avg Truth Score", value: totals.avgScore, color: "text-accent" },
  ];

  const pieData = typeRows.map((r) => ({
    name: (TYPE_META[r.post_type]?.label) || r.post_type,
    value: (r.sum_like_count || 0) + (r.sum_comment_count || 0) + (r.sum_share_count || 0) + (r.sum_repost_count || 0),
  })).filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="p-4 rounded-xl border border-border bg-card">
              <Icon className={`w-5 h-5 ${s.color} mb-2`} />
              <p className="text-2xl font-heading text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Engagement over time */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-heading text-lg text-foreground">Engagement Over Time</h3>
        </div>
        {timeRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No engagement data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={timeRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(270 22% 16%)" />
              <XAxis dataKey="label" tick={{ fill: "hsl(270 12% 62%)", fontSize: 12 }} />
              <YAxis tick={{ fill: "hsl(270 12% 62%)", fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(270 26% 7%)", border: "1px solid hsl(270 22% 16%)", borderRadius: 8 }}
                labelStyle={{ color: "hsl(270 18% 93%)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="likes" name="Likes" fill="hsl(265 70% 60%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="comments" name="Comments" fill="hsl(43 80% 64%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Engagement by type + Truth summary */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-accent" />
            <h3 className="font-heading text-lg text-foreground">Engagement by Content Type</h3>
          </div>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No engagement yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(270 26% 7%)", border: "1px solid hsl(270 22% 16%)", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="p-5 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            <h3 className="font-heading text-lg text-foreground">Truth Performance</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <span className="text-sm text-muted-foreground">Average Truth Score</span>
              <span className={`text-xl font-heading ${scoreColor(totals.avgScore)}`}>{totals.avgScore}</span>
            </div>
            <div className="space-y-2">
              {typeRows.map((r) => {
                const meta = TYPE_META[r.post_type] || { label: r.post_type, icon: FileText };
                const Icon = meta.icon;
                const avg = Math.round(r.avg_truth_score || 0);
                return (
                  <div key={r.post_type} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      {meta.label}
                      <span className="text-xs text-muted-foreground">({r.count || 0})</span>
                    </span>
                    <span className={`font-medium ${scoreColor(avg)}`}>{avg}</span>
                  </div>
                );
              })}
              {typeRows.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No posts yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Truth score trend + status breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            <h3 className="font-heading text-lg text-foreground">Truth Score Trend</h3>
          </div>
          {truthTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No truth score data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={truthTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(270 22% 16%)" />
                <XAxis dataKey="label" tick={{ fill: "hsl(270 12% 62%)", fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "hsl(270 12% 62%)", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(270 26% 7%)", border: "1px solid hsl(270 22% 16%)", borderRadius: 8 }}
                  labelStyle={{ color: "hsl(270 18% 93%)" }}
                />
                <Line type="monotone" dataKey="score" name="Avg Truth Score" stroke="hsl(43 80% 64%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="p-5 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-accent" />
            <h3 className="font-heading text-lg text-foreground">Truth Status Breakdown</h3>
          </div>
          {statusRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No posts yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusRows} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusRows.map((row, i) => (
                    <Cell key={i} fill={STATUS_COLORS[row.name] || PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(270 26% 7%)", border: "1px solid hsl(270 22% 16%)", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top performing posts */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Heart className="w-5 h-5 text-pink-400" />
          <h3 className="font-heading text-lg text-foreground">Top Performing Posts</h3>
        </div>
        {topPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No posts yet. Share content to start tracking performance.
          </p>
        ) : (
          <div className="space-y-2">
            {topPosts.map((p, i) => {
              const meta = TYPE_META[p.post_type] || { label: p.post_type, icon: FileText };
              const Icon = meta.icon;
              let dateStr = "";
              try { dateStr = format(parseISO(p.created_date), "MMM d, yyyy"); } catch { /* skip */ }
              return (
                <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                  <span className="text-xs text-muted-foreground font-mono pt-0.5 w-5 shrink-0">#{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground line-clamp-2">
                      {p.content || `(${meta.label} post)`}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 text-primary">
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                      <span className="flex items-center gap-1 text-pink-400">
                        <Heart className="w-3 h-3" /> {p.like_count || 0}
                      </span>
                      <span className="flex items-center gap-1 text-blue-400">
                        <MessageSquare className="w-3 h-3" /> {p.comment_count || 0}
                      </span>
                      <span className="flex items-center gap-1 text-purple-400">
                        <Share2 className="w-3 h-3" /> {p.share_count || 0}
                      </span>
                      <span className="flex items-center gap-1 text-cyan-400">
                        <Repeat2 className="w-3 h-3" /> {p.repost_count || 0}
                      </span>
                      {dateStr && <span>{dateStr}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-heading ${scoreColor(p.truth_score || 0)}`}>
                      {p.truth_score || 0}
                    </p>
                    <p className={`text-[10px] uppercase tracking-wide ${TRUTH_COLORS[p.truth_status] || "text-muted-foreground"}`}>
                      {p.truth_status || "unverified"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}