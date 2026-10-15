import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Trophy, ShieldCheck, TrendingUp, Award, MapPin, Heart, MessageCircle } from "lucide-react";

const STATUS_BADGES = {
  verified: { label: "Verified", class: "bg-green-500/15 text-green-500" },
  unverified: { label: "Unverified", class: "bg-muted text-muted-foreground" },
  flagged: { label: "Flagged", class: "bg-destructive/15 text-destructive" },
  challenged: { label: "Challenged", class: "bg-accent/15 text-accent" },
};

const REPORT_STATUS_BADGES = {
  verified: { label: "Verified", class: "bg-green-500/15 text-green-500" },
  under_review: { label: "Under Review", class: "bg-accent/15 text-accent" },
  rejected: { label: "Rejected", class: "bg-destructive/15 text-destructive" },
};

function scoreBg(score) {
  if (score >= 80) return "bg-green-500/15 text-green-500 border-green-500/30";
  if (score >= 60) return "bg-accent/15 text-accent border-accent/30";
  if (score >= 50) return "bg-primary/15 text-primary border-primary/30";
  return "bg-muted text-muted-foreground border-border";
}

function rankMeta(idx) {
  if (idx === 0) return { icon: Trophy, class: "text-yellow-500" };
  if (idx === 1) return { icon: Award, class: "text-gray-400" };
  if (idx === 2) return { icon: Award, class: "text-orange-600" };
  return null;
}

export default function TruthLeaderboard() {
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("posts");

  useEffect(() => {
    const load = async () => {
      try {
        const [postPage, reportPage] = await Promise.all([
          apiClient.entities.Post.filter(
            { status: "published", truth_score: { $gte: 50 } },
            { sort: "-truth_score", limit: 20 }
          ),
          apiClient.entities.JournalismReport.filter(
            { truth_score: { $gte: 50 } },
            { sort: "-truth_score", limit: 20 }
          ),
        ]);
        setPosts(postPage.items || []);
        setReports(reportPage.items || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Trophy className="w-5 h-5 text-accent" />
        <h2 className="font-heading text-xl text-foreground">Truth Leaderboard</h2>
        <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">Most reliable &amp; verified content</span>
      </div>

      <div className="flex gap-1 px-4 pt-3 border-b border-border">
        <button
          onClick={() => setTab("posts")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
            tab === "posts" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> Posts ({posts.length})
        </button>
        <button
          onClick={() => setTab("reports")}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
            tab === "reports" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Journalism ({reports.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : tab === "posts" ? (
        posts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No high-scoring content yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {posts.map((post, idx) => {
              const badge = STATUS_BADGES[post.truth_status] || STATUS_BADGES.unverified;
              const rank = rankMeta(idx);
              const RankIcon = rank?.icon;
              return (
                <div key={post.id} className="flex items-start gap-3 p-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center justify-center w-8 shrink-0">
                    {RankIcon ? (
                      <RankIcon className={`w-5 h-5 ${rank.class}`} />
                    ) : (
                      <span className="text-sm text-muted-foreground font-medium">{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${scoreBg(post.truth_score)}`}>
                        {post.truth_score} truth
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.class}`}>{badge.label}</span>
                      {post.region && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" /> {post.region}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Heart className="w-3 h-3" /> {post.like_count || 0}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageCircle className="w-3 h-3" /> {post.comment_count || 0}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No verified journalism reports yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {reports.map((report, idx) => {
              const badge = REPORT_STATUS_BADGES[report.verification_status] || REPORT_STATUS_BADGES.under_review;
              const rank = rankMeta(idx);
              const RankIcon = rank?.icon;
              return (
                <div key={report.id} className="flex items-start gap-3 p-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center justify-center w-8 shrink-0">
                    {RankIcon ? (
                      <RankIcon className={`w-5 h-5 ${rank.class}`} />
                    ) : (
                      <span className="text-sm text-muted-foreground font-medium">{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{report.headline || "Untitled report"}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${scoreBg(report.truth_score)}`}>
                        {report.truth_score} truth
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.class}`}>{badge.label}</span>
                      {report.region && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" /> {report.region}
                        </span>
                      )}
                      {report.reviewer_name && (
                        <span className="text-xs text-muted-foreground">Reviewed by {report.reviewer_name}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}