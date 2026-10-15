import React, { useState } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Radar,
  AlertTriangle,
  TrendingDown,
  Users,
  RefreshCw,
} from "lucide-react";

export default function AdminCrawler() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const runCrawler = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.functions.invoke("SiteCrawler", {});
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        setData(res.data);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Crawler failed");
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 rounded-2xl border border-border bg-card/50 text-center">
          <Radar className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="font-heading text-xl text-foreground mb-2">
            Site Health Crawler
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Scans all content, podcasts, and teams to identify trouble spots
            (flagged content, open challenges), weak spots (zero views, no
            engagement, pending episodes), and collaboration breaks (solo
            teams, unlinked premium podcasts).
          </p>
          <Button onClick={runCrawler} className="mx-auto">
            <Radar className="w-4 h-4" /> Run Crawler
          </Button>
        </div>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Scanning site health...</p>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-xl text-foreground">Crawler Results</h3>
        <Button onClick={runCrawler} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className="w-4 h-4" /> Re-run
        </Button>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Flagged Posts" value={s.flagged_count} color="text-red-400" />
        <SummaryCard label="Low Truth" value={s.low_truth_count} color="text-amber-400" />
        <SummaryCard label="Open Challenges" value={s.open_challenges_count} color="text-orange-400" />
        <SummaryCard label="Zero-View Podcasts" value={s.zero_view_count} color="text-blue-400" />
        <SummaryCard label="No Engagement" value={s.no_engagement_count} color="text-purple-400" />
        <SummaryCard label="Pending Episodes" value={s.pending_count} color="text-cyan-400" />
        <SummaryCard label="Solo Teams" value={s.solo_team_count} color="text-pink-400" />
        <SummaryCard label="Unlinked Premium" value={s.unlinked_premium_count} color="text-yellow-400" />
      </div>

      {/* Trouble spots */}
      <Section
        icon={AlertTriangle}
        title="Trouble Spots"
        color="text-red-400"
        items={[
          ...data.trouble_spots.flagged_posts.map((p) => ({
            id: p.id,
            label: `Flagged post (score: ${p.truth_score || 0})`,
            detail: p.content?.slice(0, 80) + (p.content?.length > 80 ? "..." : ""),
          })),
          ...data.trouble_spots.low_truth_posts.map((p) => ({
            id: p.id,
            label: `Low truth score: ${p.truth_score || 0}`,
            detail: p.content?.slice(0, 80) + (p.content?.length > 80 ? "..." : ""),
          })),
          ...data.trouble_spots.open_challenges.map((c) => ({
            id: c.id,
            label: `Challenge: ${c.status}`,
            detail: c.reason?.slice(0, 80) + (c.reason?.length > 80 ? "..." : ""),
          })),
        ]}
        emptyText="No trouble spots detected."
      />

      {/* Weak spots */}
      <Section
        icon={TrendingDown}
        title="Weak Spots"
        color="text-amber-400"
        items={[
          ...data.weak_spots.zero_view_podcasts.map((p) => ({
            id: p.id,
            label: `Zero views: EP ${p.episode_number} - ${p.title}`,
            detail: "No one has watched this episode yet",
          })),
          ...data.weak_spots.no_engagement_posts.map((p) => ({
            id: p.id,
            label: `No engagement post`,
            detail: p.content?.slice(0, 80) + (p.content?.length > 80 ? "..." : ""),
          })),
          ...data.weak_spots.pending_podcasts.map((p) => ({
            id: p.id,
            label: `EP ${p.episode_number}: ${p.title}`,
            detail: `Script: ${p.script_status || "draft"}, Line-up: ${p.lineup_status || "pending"}`,
          })),
        ]}
        emptyText="No weak spots detected."
      />

      {/* Collaboration breaks */}
      <Section
        icon={Users}
        title="Collaboration Breaks"
        color="text-pink-400"
        items={[
          ...data.collaboration_breaks.solo_teams.map((t) => ({
            id: t.id,
            label: `Solo team: ${t.team_name}`,
            detail: `${t.members?.length || 0} member(s) — no collaborators`,
          })),
          ...data.collaboration_breaks.unlinked_premium_podcasts.map((p) => ({
            id: p.id,
            label: `Premium without team: ${p.title}`,
            detail: "No collaboration team linked to this premium episode",
          })),
        ]}
        emptyText="No collaboration breaks detected."
      />
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="p-3 rounded-xl border border-border bg-card/50">
      <p className={`text-2xl font-heading ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function Section({ icon: Icon, title, color, items, emptyText }) {
  return (
    <div className="p-5 rounded-2xl border border-border bg-card/50">
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${color}`} />
        <h4 className="font-heading text-lg text-foreground">{title}</h4>
        <span className="text-xs text-muted-foreground ml-auto">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 15).map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-lg border border-border/60 bg-background/40"
            >
              <p className="text-sm text-foreground">{item.label}</p>
              {item.detail && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.detail}
                </p>
              )}
            </div>
          ))}
          {items.length > 15 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              + {items.length - 15} more...
            </p>
          )}
        </div>
      )}
    </div>
  );
}