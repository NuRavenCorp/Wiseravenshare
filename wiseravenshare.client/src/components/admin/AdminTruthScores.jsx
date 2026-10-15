import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminTruthScores() {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postId, setPostId] = useState("");
  const [result, setResult] = useState(null);
  const [scoring, setScoring] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.entities.TruthScore
      .filter({}, { sort: "-created_date", limit: 20 })
      .then((page) => setScores(page.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const runScore = async () => {
    if (!postId.trim()) return;
    setScoring(true);
    try {
      const res = await apiClient.functions.invoke("ScoreTruth", { post_id: postId.trim() });
      setResult(res.data);
      load();
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="p-6 rounded-2xl border border-border bg-card/50">
        <h3 className="font-heading text-xl text-foreground mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" /> Run Integrity Scoring
        </h3>
        <p className="text-sm text-muted-foreground mb-4">Enter a post ID to run it through the truth and AI-detection engine.</p>
        <div className="flex gap-2">
          <Input value={postId} onChange={(e) => setPostId(e.target.value)} placeholder="Post ID" className="bg-background/60" />
          <Button onClick={runScore} disabled={scoring} className="bg-primary text-primary-foreground">
            {scoring ? "Scoring…" : "Score"}
          </Button>
        </div>
        {result && (
          <div className="mt-4 p-4 rounded-xl border border-border bg-background/60">
            {result.error ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-foreground">Score: <span className="text-accent font-mono">{result.truth_score}</span> · Status: <span className="text-primary">{result.status}</span></p>
                <p className="text-muted-foreground">Confidence: {result.confidence}</p>
                {result.ai_detection_flags?.length > 0 && (
                  <p className="text-destructive">AI flags: {result.ai_detection_flags.join(", ")}</p>
                )}
                {result.factors?.map((f, i) => <p key={i} className="text-muted-foreground">• {f}</p>)}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-heading text-xl text-foreground mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Recent Truth Scores
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : scores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scores yet. Run the engine on a post to begin.</p>
        ) : (
          <div className="space-y-2">
            {scores.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/40">
                <div>
                  <p className="text-sm text-foreground">Target: {s.target_id?.slice(-8)}</p>
                  <p className="text-xs text-muted-foreground">{s.target_type}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-accent text-lg">{s.score}</p>
                  <p className="text-xs text-muted-foreground capitalize">{s.notes}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}