import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import {
  Loader2,
  Eye,
  ShieldCheck,
  XCircle,
  Newspaper,
  MapPin,
  ExternalLink,
  Calendar,
  Maximize2,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const COLUMNS = [
  {
    key: "under_review",
    label: "Under Review",
    icon: Eye,
    color: "text-amber-300",
    bg: "bg-amber-500/5",
    border: "border-amber-500/30",
    accent: "bg-amber-400",
  },
  {
    key: "verified",
    label: "Verified",
    icon: ShieldCheck,
    color: "text-emerald-300",
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/30",
    accent: "bg-emerald-400",
  },
  {
    key: "rejected",
    label: "Rejected",
    icon: XCircle,
    color: "text-rose-300",
    bg: "bg-rose-500/5",
    border: "border-rose-500/30",
    accent: "bg-rose-400",
  },
];

export default function JournalismStatusBoard() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [storyPost, setStoryPost] = useState(null);
  const [loadingStoryBody, setLoadingStoryBody] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.entities.JournalismReport.filter(
          {},
          { sort: "-created_date", limit: 100 }
        );
        setReports(res.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Handle URL deep-linking like /journalism?story=xxx or /journalism?post=xxx
  useEffect(() => {
    if (typeof window === "undefined" || reports.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get("story") || params.get("post") || params.get("report");
    if (!targetId) return;

    const matched = reports.find(
      (r) => String(r.id) === targetId || String(r.post_id) === targetId
    );
    if (matched) {
      handleOpenStory(matched);
    }
  }, [reports]);

  const handleOpenStory = async (report) => {
    setSelectedReport(report);
    setStoryPost(null);

    if (report.post_id) {
      setLoadingStoryBody(true);
      try {
        const post = await apiClient.requestJson(`/api/posts/${encodeURIComponent(report.post_id)}`);
        setStoryPost(post);
      } catch {
        // If single post fetch failed, fallback to report description
      } finally {
        setLoadingStoryBody(false);
      }
    }
  };

  const scrollToStoryOnPage = (report) => {
    if (!report) return;
    const postId = report.post_id;
    const reportId = report.id;

    const el =
      (postId ? document.getElementById(`post-${postId}`) : null) ||
      document.getElementById(`post-${reportId}`) ||
      document.getElementById(`story-${reportId}`) ||
      document.querySelector(`[data-story-id="${postId}"]`);

    if (el) {
      setSelectedReport(null);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "bg-primary/10");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "bg-primary/10");
      }, 3000);
    } else {
      // Element not currently mounted on page; open in social feed if post exists
      if (postId) {
        window.open(`/social?post=${encodeURIComponent(postId)}`, "_blank");
      }
    }
  };

  const byStatus = (status) =>
    reports.filter((r) => (r.verification_status || "under_review") === status);

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );

  const selectedCol = selectedReport
    ? COLUMNS.find((c) => c.key === (selectedReport.verification_status || "under_review")) || COLUMNS[0]
    : COLUMNS[0];
  const SelectedColIcon = selectedCol.icon;

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-heading text-2xl text-foreground flex items-center gap-2">
          <Newspaper className="w-6 h-6 text-primary" /> Report Status Board
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Verification progress across all journalism reports. Click any report to view and expand the story.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const items = byStatus(col.key);
          const ColIcon = col.icon;
          return (
            <div
              key={col.key}
              className={`rounded-xl border ${col.border} ${col.bg} p-4 min-h-[280px] flex flex-col`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                  <ColIcon className={`w-4 h-4 ${col.color}`} />
                  <span className={`text-sm font-medium ${col.color}`}>{col.label}</span>
                </div>
                <span className="text-xs text-muted-foreground bg-background/60 rounded-full px-2 py-0.5 border border-border">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 flex-1">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-10">
                    No reports here
                  </p>
                ) : (
                  items.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => handleOpenStory(r)}
                      className="group p-3 rounded-lg border border-border bg-card space-y-2 cursor-pointer hover:border-primary/50 hover:bg-card/90 transition-all shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors flex-1">
                          {r.headline || r.description?.slice(0, 80) || "Untitled report"}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenStory(r);
                          }}
                          className="shrink-0 p-1 rounded text-muted-foreground group-hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Expand and read story"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {r.region && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" /> {r.region}
                          </span>
                        )}
                        {typeof r.truth_score === "number" && (
                          <span className="text-xs text-muted-foreground">
                            Truth: {r.truth_score}/100
                          </span>
                        )}
                        <span className="text-[11px] text-primary/80 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <BookOpen className="w-3 h-3" /> Read Story
                        </span>
                      </div>

                      {r.reviewer_name && (
                        <p className="text-[11px] text-muted-foreground/70">
                          Reviewed by {r.reviewer_name}
                          {r.reviewed_at &&
                            ` · ${new Date(r.reviewed_at).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Story Reader Dialog */}
      <Dialog open={Boolean(selectedReport)} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border ${selectedCol.border} ${selectedCol.bg} ${selectedCol.color} font-medium`}
              >
                <SelectedColIcon className="w-3.5 h-3.5" />
                {selectedCol.label}
              </span>
              {selectedReport?.region && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 text-muted-foreground" /> {selectedReport.region}
                </span>
              )}
              {selectedReport?.created_date && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3 text-muted-foreground" />{" "}
                  {new Date(selectedReport.created_date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
            <DialogTitle className="text-xl font-heading text-foreground leading-snug">
              {selectedReport?.headline || "Untitled Story"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Verification progress report and full story dossier
            </DialogDescription>
          </DialogHeader>

          {/* Truth Score meter */}
          <div className="p-3.5 rounded-lg border border-border bg-secondary/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-4 h-4 text-primary" /> Truth Verification Score
              </span>
              <span className="font-semibold text-foreground">
                {typeof selectedReport?.truth_score === "number"
                  ? `${selectedReport.truth_score}/100`
                  : "Under Review"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{
                  width: `${typeof selectedReport?.truth_score === "number" ? selectedReport.truth_score : 50}%`,
                }}
              />
            </div>
          </div>

          {/* Story Body */}
          <div className="space-y-4 text-sm leading-relaxed text-foreground/90 py-2">
            {storyPost?.content ? (
              <div className="whitespace-pre-wrap">{storyPost.content}</div>
            ) : selectedReport?.description ? (
              <div className="whitespace-pre-wrap">{selectedReport.description}</div>
            ) : loadingStoryBody ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Loading full story content...</span>
              </div>
            ) : (
              <p className="italic text-muted-foreground">No additional report body recorded for this story.</p>
            )}
          </div>

          {/* Evidence Image */}
          {(selectedReport?.image_url || storyPost?.mediaUrl) && (
            <div className="rounded-lg overflow-hidden border border-border bg-muted/20">
              <img
                src={selectedReport?.image_url || storyPost?.mediaUrl}
                alt={selectedReport?.headline || "Story Evidence"}
                className="w-full max-h-80 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}

          {/* Reviewer Status */}
          {selectedReport?.reviewer_name && (
            <div className="text-xs text-muted-foreground border-t border-border pt-3">
              Reviewed by <span className="font-medium text-foreground">{selectedReport.reviewer_name}</span>
              {selectedReport.reviewed_at &&
                ` on ${new Date(selectedReport.reviewed_at).toLocaleDateString()}`}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => scrollToStoryOnPage(selectedReport)}
                className="gap-1.5 text-xs"
              >
                <Newspaper className="w-3.5 h-3.5" />
                Scroll to Story on Page
              </Button>
              {selectedReport?.post_id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/social?post=${encodeURIComponent(selectedReport.post_id)}`, "_blank")}
                  className="gap-1.5 text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View in Social Feed
                </Button>
              )}
            </div>
            <Button size="sm" onClick={() => setSelectedReport(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
