import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminWiseCoins() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [result, setResult] = useState(null);
  const [evaluating, setEvaluating] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.entities.WiseCoinTransaction
      .aggregate({ groupBy: "category", sum: "amount" })
      .then((agg) => setRows(agg.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const evaluate = async () => {
    if (!userId.trim()) return;
    setEvaluating(true);
    try {
      const res = await apiClient.functions.invoke("EvaluateWiseCoins", { user_id: userId.trim() });
      setResult(res.data);
      load();
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="p-6 rounded-2xl border border-border bg-card/50">
        <h3 className="font-heading text-xl text-foreground mb-2 flex items-center gap-2">
          <Coins className="w-5 h-5 text-accent" /> Run Wise-Coin Evaluator
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Evaluates a creator's productivity, participation, promotion, and value — then mints their wise-coins.
        </p>
        <div className="flex gap-2">
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" className="bg-background/60" />
          <Button onClick={evaluate} disabled={evaluating} className="bg-primary text-primary-foreground">
            {evaluating ? "Evaluating…" : "Evaluate"}
          </Button>
        </div>
        {result && !result.error && (
          <div className="mt-4 p-4 rounded-xl border border-border bg-background/60 space-y-1 text-sm">
            <p className="text-foreground">Awarded: <span className="text-accent font-mono">{result.awarded.total}</span> coins</p>
            <p className="text-muted-foreground">Productivity: {result.awarded.productivity} · Participation: {result.awarded.participation}</p>
            <p className="text-muted-foreground">Promotion: {result.awarded.promotion} · Value: {result.awarded.value}</p>
            <p className="text-foreground">New balance: <span className="text-accent font-mono">{result.balance_after}</span></p>
          </div>
        )}
        {result?.error && <p className="mt-3 text-sm text-destructive">{result.error}</p>}
      </div>

      <div>
        <h3 className="font-heading text-xl text-foreground mb-4">Coins Minted by Category</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No coins minted yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.category} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/40">
                <span className="text-sm text-muted-foreground capitalize">{r.category}</span>
                <span className="font-mono text-accent text-lg">{r.sum_amount || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}