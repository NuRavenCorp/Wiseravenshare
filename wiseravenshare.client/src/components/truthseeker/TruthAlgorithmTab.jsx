import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import {
  ShieldCheck,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Eye,
  Trash2,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TruthAlgorithmTab() {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postId, setPostId] = useState("");
  const [result, setResult] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const res = await apiClient.functions.invoke("ListTruthScores", {
        limit: 20,
      });
      let items = res.data?.items || [];
      if (statusFilter === "verified") {
        items = items.filter((s) => s.notes === "verified");
      } else if (statusFilter === "flagged") {
        items = items.filter((s) => s.notes === "flagged");
      } else if (statusFilter === "unverified") {
        items = items.filter((s) => s.notes === "unverified");
      }
      setScores(items);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await apiClient.functions.invoke("ManageTruthScore", {
        action: "delete",
        score_id: id,
      });
      load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const runScore = async () => {
    if (!postId.trim()) return;
    setScoring(true);
    setResult(null);
    try {
      const res = await apiClient.functions.invoke("ScoreTruth", {
        post_id: postId.trim(),
      });
      setResult(res.data);
      load();
    } catch (e) {
      setResult({ error: e?.response?.data?.error || e?.message });
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-accent" />
          <h3 className="font-heading text-lg text-foreground">
            The TruthSeeker Engine
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Every post is evaluated by our AI integrity engine for factual
          verifiability, misleading framing, and AI-generated content. Scores
          range from 0 to 100.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <CheckCircle className="w-4 h-4 text-green-500 mb-1" />
            <p className="text-xs font-medium text-foreground">Verified</p>
            <p className="text-xs text-muted-foreground">Score 70+, high confidence</p>
          </div>
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
            <Eye className="w-4 h-4 text-yellow-500 mb-1" />
            <p className="text-xs font-medium text-foreground">Unverified</p>
            <p className="text-xs text-muted-foreground">Needs more evidence</p>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <AlertTriangle className="w-4 h-4 text-destructive mb-1" />
            <p className="text-xs font-medium text-foreground">Flagged</p>
            <p className="text-xs text-muted-foreground">Misleading or AI-generated</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-medium text-foreground mb-3">
          Score Your Post
        </h3>
        <div className="flex gap-2">
          <Input
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
            placeholder="Enter your post ID"
          />
          <Button onClick={runScore} disabled={scoring || !postId.trim()}>
            {scoring ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            Score
          </Button>
        </div>
        {result && (
          <div className="mt-4 p-4 rounded-lg border border-border bg-background/50">
            {result.error ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-display text-accent">
                    {result.truth_score}
                  </span>
                  <span className="text-xs text-muted-foreground">/ 100</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded capitalize ${
                      result.status === "verified"
                        ? "bg-green-500/15 text-green-500"
                        : result.status === "flagged"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-yellow-500/15 text-yellow-500"
                    }`}
                  >
                    {result.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Confidence: {(result.confidence * 100).toFixed(0)}%
                </p>
                {result.ai_detection_flags?.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5" />
                    <p className="text-xs text-destructive">
                      {result.ai_detection_flags.join(", ")}
                    </p>
                  </div>
                )}
                {result.factors?.map((f, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    • {f}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Recent Truth Scores
          </h3>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            >
              <option value="">All</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
              <option value="flagged">Flagged</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : scores.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No scores yet.
          </p>
        ) : (
          <div className="space-y-2">
            {scores.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-mono font-medium ${
                    s.score >= 70
                      ? "bg-green-500/15 text-green-500"
                      : s.score < 40
                      ? "bg-destructive/15 text-destructive"
                      : "bg-yellow-500/15 text-yellow-500"
                  }`}
                >
                  {s.score}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">
                    Post {s.target_id?.slice(-8)}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {s.notes} - {s.ai_detection_flags?.length || 0} AI flags
                  </p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {(s.confidence * 100).toFixed(0)}%
                </span>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={deleting === s.id}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  {deleting === s.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}