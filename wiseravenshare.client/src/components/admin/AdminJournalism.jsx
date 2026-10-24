import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ShieldCheck, Eye, XCircle, Newspaper, MapPin,
  CheckCircle2, X, ExternalLink, LayoutGrid, List, ShieldAlert
} from "lucide-react";
import JournalismBoard from "@/components/admin/JournalismBoard";

const STATUSES = ["under_review", "verified", "rejected"];

const statusConfig = {
  under_review: {
    icon: Eye,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "Under Review",
  },
  verified: {
    icon: ShieldCheck,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    label: "Verified",
  },
  rejected: {
    icon: XCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    label: "Rejected",
  },
};

export default function AdminJournalism() {
  const { toast } = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("list");

  const reviewerName = currentUser?.full_name || currentUser?.email || "Admin";

  const fetchReports = async () => {
    try {
      const query = filter === "all" ? {} : { verification_status: filter };
      const res = await apiClient.entities.JournalismReport.filter(query, {
        sort: "-created_date",
        limit: 100,
      });
      setReports(res.items || []);
    } catch (e) {
      toast({ title: "Failed to load reports", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    apiClient.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        try { setCurrentUser(await apiClient.auth.me()); } catch {}
      }
    });
  }, [filter]);

  const setStatus = async (report, status, customReviewNotes = null) => {
    setSaving(true);
    try {
      await apiClient.entities.JournalismReport.update(report.id, {
        verification_status: status,
        reviewer_id: currentUser?.id,
        reviewer_name: reviewerName,
        reviewed_at: new Date().toISOString(),
        review_notes: customReviewNotes ?? notes ?? report.review_notes ?? undefined,
      });
      toast({ title: `Marked as ${statusConfig[status].label}` });
      setEditingId(null);
      setNotes("");
      fetchReports();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const flagForReview = async (report) => {
    const reviewStamp = `Flagged by ${reviewerName} on ${new Date().toLocaleString()}.`;
    const existing = (report.review_notes || "").trim();
    const mergedNotes = existing ? `${existing}\n${reviewStamp}` : reviewStamp;
    await setStatus(report, "under_review", mergedNotes);
  };

  const openNotes = (report) => {
    setEditingId(editingId === report.id ? null : report.id);
    setNotes(report.review_notes || "");
  };

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border ${
                filter === s
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
              view === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
          <button
            onClick={() => setView("board")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
              view === "board" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Board
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Reports publish by default. Admin can flag a report into <strong>Under Review</strong>, then accept (Verified) or reject.
      </p>

      {view === "board" ? (
        <JournalismBoard />
      ) : (
        <>
      {/* Reports list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Newspaper className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No journalism reports to review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const cfg = statusConfig[r.verification_status] || statusConfig.under_review;
            const StatusIcon = cfg.icon;
            return (
              <div key={r.id} className="p-5 rounded-2xl border border-border bg-card/50 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
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
                    </div>
                    <h3 className="font-heading text-lg text-foreground">
                      {r.headline || r.description?.slice(0, 80) || "Untitled report"}
                    </h3>
                    {r.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    )}
                  </div>
                  {r.post_id && (
                    <a
                      href={`/?post=${r.post_id}`}
                      target="_blank"
                      rel="noopener"
                      className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="View original post"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {/* Reviewer info */}
                {r.reviewer_name && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed by {r.reviewer_name}
                    {r.reviewed_at && ` · ${new Date(r.reviewed_at).toLocaleDateString()}`}
                  </p>
                )}

                {/* Notes */}
                {editingId === r.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add review notes (optional)..."
                      rows={2}
                      className="bg-background text-sm"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      {STATUSES.map((s) => {
                        const sc = statusConfig[s];
                        const SIcon = sc.icon;
                        return (
                          <Button
                            key={s}
                            size="sm"
                            variant={r.verification_status === s ? "default" : "outline"}
                            onClick={() => setStatus(r, s)}
                            disabled={saving}
                            className={`capitalize ${r.verification_status === s ? "" : `${sc.color} ${sc.border} border`}`}
                          >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SIcon className="w-3.5 h-3.5" />}
                            {sc.label}
                          </Button>
                        );
                      })}
                      <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); setNotes(""); }}>
                        <X className="w-3.5 h-3.5" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {r.review_notes && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-sm text-foreground/80">{r.review_notes}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {r.verification_status !== "under_review" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => flagForReview(r)}
                          disabled={saving}
                          className="text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                          Flag for Review
                        </Button>
                      )}
                      {r.verification_status === "under_review" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setStatus(r, "verified")} disabled={saving} className="text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                            Accept
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setStatus(r, "rejected")} disabled={saving} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Reject
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openNotes(r)}>
                        <Eye className="w-3.5 h-3.5" /> Review & Set Status
                      </Button>
                      {r.verification_status === "verified" && (
                        <span className="flex items-center gap-1 text-xs text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}