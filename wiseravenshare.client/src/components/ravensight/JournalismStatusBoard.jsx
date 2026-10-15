import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Eye, ShieldCheck, XCircle, Newspaper, MapPin, ExternalLink } from "lucide-react";

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

  const byStatus = (status) =>
    reports.filter((r) => (r.verification_status || "under_review") === status);

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-heading text-2xl text-foreground flex items-center gap-2">
          <Newspaper className="w-6 h-6 text-primary" /> Report Status Board
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Verification progress across all journalism reports.
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
                      className="p-3 rounded-lg border border-border bg-card space-y-1.5"
                    >
                      <p className="text-sm font-medium text-foreground line-clamp-2">
                        {r.headline || r.description?.slice(0, 80) || "Untitled report"}
                      </p>
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
                        {r.post_id && (
                          <a
                            href={`/?post=${r.post_id}`}
                            target="_blank"
                            rel="noopener"
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="View original post"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
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
    </div>
  );
}