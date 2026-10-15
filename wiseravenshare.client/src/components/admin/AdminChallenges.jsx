import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminChallenges() {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiClient.entities.Challenge
      .filter({ status: { $in: ["open", "under_review"] } }, { sort: "-created_date", limit: 50 })
      .then((page) => setChallenges(page.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const adjudicate = async (id, status) => {
    const verdict = status === "upheld" ? "Challenge upheld by admin" : "Challenge dismissed by admin";
    await apiClient.entities.Challenge.update(id, { status, verdict });
    load();
  };

  if (loading) return <div className="text-muted-foreground text-sm">Loading challenges…</div>;

  return (
    <div className="space-y-4">
      {challenges.length === 0 && (
        <p className="text-sm text-muted-foreground">No open challenges. The integrity of the flock holds.</p>
      )}
      {challenges.map((c) => (
        <div key={c.id} className="p-5 rounded-2xl border border-border bg-card/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs tracking-wider uppercase text-accent">{c.status}</span>
            <span className="text-xs text-muted-foreground">Post: {c.post_id?.slice(-8)}</span>
          </div>
          <p className="text-foreground mb-1">{c.reason}</p>
          {c.evidence && <p className="text-sm text-muted-foreground mb-3">Evidence: {c.evidence}</p>}
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => adjudicate(c.id, "upheld")} className="bg-primary text-primary-foreground">
              <Check className="w-4 h-4 mr-1" /> Uphold
            </Button>
            <Button size="sm" variant="outline" onClick={() => adjudicate(c.id, "dismissed")}>
              <X className="w-4 h-4 mr-1" /> Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}