import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Gavel, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ChallengesTab() {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postId, setPostId] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = async () => {
    try {
      const page = await apiClient.entities.Challenge.filter(
        {},
        { sort: "-created_date", limit: 20 }
      );
      setChallenges(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!postId.trim() || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.entities.Challenge.create({
        post_id: postId.trim(),
        reason: reason.trim(),
        evidence: evidence.trim() || undefined,
      });
      setSuccess("Challenge submitted. It will be reviewed by our team.");
      setPostId("");
      setReason("");
      setEvidence("");
      load();
    } catch (e) {
      setError(e?.message || "Failed to submit challenge");
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case "upheld":
        return "bg-green-500/15 text-green-500";
      case "dismissed":
        return "bg-destructive/15 text-destructive";
      case "under_review":
        return "bg-yellow-500/15 text-yellow-500";
      default:
        return "bg-secondary text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Gavel className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium text-foreground">
            Challenge a Post
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Flag misleading or false content. Provide evidence to support your
          claim.
        </p>
        <Input
          value={postId}
          onChange={(e) => setPostId(e.target.value)}
          placeholder="Post ID"
        />
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this post misleading or false?"
          rows={2}
        />
        <Textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Supporting evidence (links, facts, sources)"
          rows={2}
        />
        <Button
          onClick={submit}
          disabled={submitting || !postId.trim() || !reason.trim()}
          className="w-full"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Submit Challenge
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {success && <p className="text-xs text-green-500">{success}</p>}
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Recent Challenges
        </h3>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : challenges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No challenges filed yet.
          </p>
        ) : (
          <div className="space-y-2">
            {challenges.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-lg border border-border bg-card space-y-1"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs text-foreground">
                    Post {c.post_id?.slice(-8)}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor(
                      c.status
                    )}`}
                  >
                    {c.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{c.reason}</p>
                {c.verdict && (
                  <p className="text-xs text-foreground italic">
                    Verdict: {c.verdict}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}