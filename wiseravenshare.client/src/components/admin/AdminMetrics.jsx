import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import {
  Loader2,
  Users,
  Headphones,
  FileText,
  Eye,
  DollarSign,
  ShieldCheck,
} from "lucide-react";

export default function AdminMetrics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [
          userResult,
          podCount,
          postCount,
          postAgg,
          podAgg,
          payAgg,
        ] = await Promise.all([
          apiClient.entities.User.filter({}),
          apiClient.entities.Podcast.count({}),
          apiClient.entities.Post.count({}),
          apiClient.entities.Post.aggregate({
            groupBy: "truth_status",
            count: true,
          }),
          apiClient.entities.Podcast.aggregate({
            groupBy: "status",
            sum: "view_count",
          }),
          apiClient.entities.PodcastPayment.aggregate({
            groupBy: "status",
            sum: "amount",
          }),
        ]);

        const userArr = Array.isArray(userResult)
          ? userResult
          : userResult.items || [];
        const totalViews =
          podAgg.rows?.reduce((s, r) => s + (r.sum_view_count || 0), 0) || 0;
        const revenue =
          payAgg.rows?.reduce((s, r) => s + (r.sum_amount || 0), 0) || 0;
        const truthRows = postAgg.rows || [];

        setData({
          totalUsers: userArr.length,
          activeUsers: userArr.filter((u) => (u.status || "active") === "active").length,
          suspendedUsers: userArr.filter((u) => u.status === "suspended").length,
          blockedUsers: userArr.filter((u) => u.status === "blocked").length,
          totalPodcasts: podCount,
          totalPosts: postCount,
          totalViews,
          revenue,
          truthRows,
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
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">Unable to load metrics.</p>
    );
  }

  const cards = [
    { label: "Total Users", value: data.totalUsers, icon: Users, color: "text-primary" },
    { label: "Podcasts", value: data.totalPodcasts, icon: Headphones, color: "text-blue-400" },
    { label: "Posts", value: data.totalPosts, icon: FileText, color: "text-purple-400" },
    { label: "Total Views", value: data.totalViews, icon: Eye, color: "text-pink-400" },
    { label: "Revenue (cents)", value: data.revenue, icon: DollarSign, color: "text-green-400" },
    { label: "Active Users", value: data.activeUsers, icon: ShieldCheck, color: "text-green-400" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="p-6 rounded-2xl border border-border bg-card/50"
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-5 h-5 ${c.color}`} />
                <span className="text-3xl font-heading text-foreground">
                  {c.value}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl border border-border bg-card/50">
          <h3 className="font-heading text-lg text-foreground mb-4">
            User Status
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-500">Active</span>
              <span className="font-mono">{data.activeUsers}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-amber-500">Suspended</span>
              <span className="font-mono">{data.suspendedUsers}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-red-500">Blocked</span>
              <span className="font-mono">{data.blockedUsers}</span>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-border bg-card/50">
          <h3 className="font-heading text-lg text-foreground mb-4">
            Truth Score Distribution
          </h3>
          <div className="space-y-2">
            {data.truthRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No posts yet.</p>
            )}
            {data.truthRows.map((r) => (
              <div key={r.truth_status} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">
                  {r.truth_status}
                </span>
                <span className="font-mono text-accent">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}