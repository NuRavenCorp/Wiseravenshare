import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Users, ShieldCheck, Heart, MessageCircle, Share2, Swords, Activity, FileText, RefreshCw, Database, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminPgAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.functions.invoke("GetPgAnalytics", {});
      setData(res.data);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const stats = data
    ? [
        { label: "Daily Active Users", value: data.dailyActiveUsers, icon: Users, hint: "Last 24 hours" },
        { label: "Avg Truth Score", value: data.truthScoreAverage, icon: ShieldCheck, hint: `${data.totalPublishedPosts} published posts` },
        { label: "Total Interactions", value: data.totalInteractions, icon: Activity, hint: "Likes + comments + shares + challenges" },
        { label: "Total Likes", value: data.totalLikes, icon: Heart, hint: `${data.totalLikeRecords ?? 0} like records` },
        { label: "Total Comments", value: data.totalComments, icon: MessageCircle, hint: "Across all posts" },
        { label: "Total Shares", value: data.totalShares, icon: Share2, hint: "Across all posts" },
        { label: "Total Challenges", value: data.totalChallenges, icon: Swords, hint: "Across all posts" },
        { label: "Published Posts", value: data.totalPublishedPosts, icon: FileText, hint: "In PostgreSQL backup" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Database className="w-4 h-4 text-primary" />
          <span>Data source: PostgreSQL backup</span>
          {lastRefresh && !loading && <span className="text-muted-foreground/60">· Updated {lastRefresh}</span>}
        </div>
        <Button variant="outline" size="sm" onClick={loadAnalytics} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Unable to load analytics</p>
            <p className="text-muted-foreground mt-1">{error}</p>
            <p className="text-muted-foreground/70 mt-2">
              Make sure the proxy <code className="text-foreground">/query</code> endpoint is deployed and the sync has run at least once.
            </p>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card/40 p-5 animate-pulse">
              <div className="h-4 w-24 bg-muted/40 rounded mb-3" />
              <div className="h-8 w-16 bg-muted/40 rounded" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {data.errors?.length > 0 && (
            <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="w-4 h-4 text-accent" />
              Partial data — some queries failed: {data.errors.join(", ")}. Run a sync first.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-card/40 p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                  <stat.icon className="w-4 h-4 text-primary/70" />
                </div>
                <p className="font-heading text-3xl text-foreground">{stat.value ?? "—"}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">{stat.hint}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}