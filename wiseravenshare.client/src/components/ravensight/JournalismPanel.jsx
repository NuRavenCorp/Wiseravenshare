import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import {
  Loader2,
  ShieldCheck,
  Shield,
  ShieldAlert,
  AlertTriangle,
  Newspaper,
  TrendingUp,
  MapPin,
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import JournalismReportForm from "@/components/journalism/JournalismReportForm";
import JournalismReportMedia from "@/components/journalism/JournalismReportMedia";

const STATUS_CONFIG = {
  verified: {
    icon: ShieldCheck,
    color: "text-green-500",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    label: "Verified",
  },
  unverified: {
    icon: Shield,
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/30",
    label: "Unverified",
  },
  flagged: {
    icon: ShieldAlert,
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    label: "Flagged",
  },
  challenged: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    label: "Challenged",
  },
};

const FILTER_TABS = [
  { key: "all", label: "All Reports" },
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
  { key: "flagged", label: "Flagged" },
  { key: "challenged", label: "Challenged" },
];

function getScoreColor(score) {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-accent";
  if (score >= 40) return "text-orange-500";
  return "text-destructive";
}

function getScoreBar(score) {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-accent";
  if (score >= 40) return "bg-orange-500";
  return "bg-destructive";
}

export default function JournalismPanel() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const query = { post_type: "journalism", status: "published" };
      if (filter !== "all") {
        query.truth_status = filter;
      }
      const page = await apiClient.entities.Post.filter(query, {
        sort: "-truth_score",
        limit: 50,
      });
      setPosts(page.items || []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadPosts();
    apiClient.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        try { setCurrentUser(await apiClient.auth.me()); } catch {}
      }
    });
  }, [loadPosts]);

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl text-foreground flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-primary" /> Amateur Journalism
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Reports ranked by AI-verified truth score. Find high-integrity
            stories first.
          </p>
        </div>
        <Button
          onClick={() => setShowForm((s) => !s)}
          variant={showForm ? "outline" : "default"}
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Cancel" : "New Report"}
        </Button>
      </div>

      {showForm && (
        <div className="mb-8">
          <JournalismReportForm
            onPublished={() => {
              setShowForm(false);
              loadPosts();
            }}
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
              filter === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20">
          <Newspaper className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No journalism reports found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, idx) => {
            const statusConfig =
              STATUS_CONFIG[post.truth_status] || STATUS_CONFIG.unverified;
            const StatusIcon = statusConfig.icon;
            return (
              <div
                key={post.id}
                className="p-5 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading text-lg">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border} border`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                      {post.region && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" /> {post.region}
                        </span>
                      )}
                      {post.external_source && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[200px]">
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {post.external_source}
                          </span>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed line-clamp-3 mb-3">
                      {post.content}
                    </p>
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> Truth Score
                        </span>
                        <span
                          className={`text-sm font-semibold ${getScoreColor(
                            post.truth_score
                          )}`}
                        >
                          {post.truth_score || 0}/100
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getScoreBar(
                            post.truth_score || 0
                          )} transition-all`}
                          style={{
                            width: `${post.truth_score || 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" />
                        {post.like_count || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {post.comment_count || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Share2 className="w-3 h-3" />
                        {post.share_count || 0}
                      </span>
                      {post.challenge_count > 0 && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <AlertTriangle className="w-3 h-3" />
                          {post.challenge_count} challenges
                        </span>
                      )}
                    </div>
                    <JournalismReportMedia
                      post={post}
                      isAuthor={currentUser?.id === post.created_by_id}
                      onMediaChange={loadPosts}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}