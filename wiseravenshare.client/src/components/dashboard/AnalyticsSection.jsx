import React, { useState, useEffect } from "react";
import {
  Loader2,
  Eye,
  Heart,
  MessageSquare,
  Shield,
  Headphones,
  TrendingUp,
  Award,
} from "lucide-react";
import { apiClient } from "@/api/client";
import GoogleTrafficWidget from "@/components/dashboard/GoogleTrafficWidget";

export default function AnalyticsSection() {
  const [loading, setLoading] = useState(true);
  const [podcasts, setPodcasts] = useState([]);
  const [totalViews, setTotalViews] = useState(0);
  const [postStats, setPostStats] = useState({
    likes: 0,
    comments: 0,
    challenges: 0,
    avgScore: 0,
    totalPosts: 0,
    verified: 0,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiClient.auth.me();
        if (!me) return;

        const [podPage, podAgg, postAgg] = await Promise.all([
          apiClient.entities.Podcast.filter(
            { created_by_id: me.id },
            { sort: "-view_count", limit: 50 }
          ),
          apiClient.entities.Podcast.aggregate({
            query: { created_by_id: me.id },
            groupBy: "status",
            sum: "view_count",
          }),
          apiClient.entities.Post.aggregate({
            query: { created_by_id: me.id },
            groupBy: "truth_status",
            count: true,
            sum: ["like_count", "comment_count", "challenge_count"],
            avg: "truth_score",
          }),
        ]);

        setPodcasts(podPage.items || []);

        const views =
          podAgg.rows?.reduce((s, r) => s + (r.sum_view_count || 0), 0) || 0;
        setTotalViews(views);

        const rows = postAgg.rows || [];
        let likes = 0,
          comments = 0,
          challenges = 0,
          totalPosts = 0,
          verified = 0,
          scoreSum = 0,
          scoreCount = 0;
        rows.forEach((r) => {
          likes += r.sum_like_count || 0;
          comments += r.sum_comment_count || 0;
          challenges += r.sum_challenge_count || 0;
          totalPosts += r.count || 0;
          if (r.truth_status === "verified") verified = r.count || 0;
          if (r.avg_truth_score) {
            scoreSum += r.avg_truth_score * (r.count || 0);
            scoreCount += r.count || 0;
          }
        });
        setPostStats({
          likes,
          comments,
          challenges,
          avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
          totalPosts,
          verified,
        });
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
    {
      icon: Eye,
      label: "Podcast Views",
      value: totalViews,
      color: "text-primary",
    },
    {
      icon: Heart,
      label: "Total Likes",
      value: postStats.likes,
      color: "text-pink-400",
    },
    {
      icon: MessageSquare,
      label: "Comments",
      value: postStats.comments,
      color: "text-blue-400",
    },
    {
      icon: Shield,
      label: "Challenges",
      value: postStats.challenges,
      color: "text-amber-400",
    },
  ];

  return (
    <div className="space-y-6">
      <GoogleTrafficWidget />

      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="p-4 rounded-xl border border-border bg-card"
            >
              <Icon className={`w-5 h-5 ${s.color} mb-2`} />
              <p className="text-2xl font-heading text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Truth score summary */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-accent" />
          <h3 className="font-heading text-lg text-foreground">
            Truth Content Performance
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-heading text-foreground">
              {postStats.avgScore}
            </p>
            <p className="text-xs text-muted-foreground">Avg Truth Score</p>
          </div>
          <div>
            <p className="text-2xl font-heading text-green-500">
              {postStats.verified}
            </p>
            <p className="text-xs text-muted-foreground">Verified Posts</p>
          </div>
          <div>
            <p className="text-2xl font-heading text-foreground">
              {postStats.totalPosts}
            </p>
            <p className="text-xs text-muted-foreground">Total Posts</p>
          </div>
          <div>
            <p className="text-2xl font-heading text-foreground">
              {postStats.likes + postStats.comments + postStats.challenges}
            </p>
            <p className="text-xs text-muted-foreground">Total Interactions</p>
          </div>
        </div>
      </div>

      {/* Podcast views breakdown */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Headphones className="w-5 h-5 text-primary" />
          <h3 className="font-heading text-lg text-foreground">
            Podcast Views by Episode
          </h3>
        </div>
        {podcasts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No podcast episodes yet.
          </p>
        ) : (
          <div className="space-y-3">
            {podcasts.map((p) => {
              const maxViews = Math.max(
                ...podcasts.map((pp) => pp.view_count || 0),
                1
              );
              const pct = ((p.view_count || 0) / maxViews) * 100;
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground truncate">
                      EP {p.episode_number}: {p.title}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1 ml-3">
                      <Eye className="w-3 h-3" />
                      {p.view_count || 0}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
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