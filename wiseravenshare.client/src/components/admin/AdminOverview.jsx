import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { FileText, MessageSquare, Swords, ShieldCheck, Coins, Award } from "lucide-react";

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.entities.Post.count({}),
      apiClient.entities.Comment.count({}),
      apiClient.entities.Challenge.count({ status: "open" }),
      apiClient.entities.TruthScore.count({}),
      apiClient.entities.WiseCoinTransaction.aggregate({ groupBy: "category", sum: "amount" }),
      apiClient.entities.Badge.count({}),
    ])
      .then(([posts, comments, challenges, truth, coinAgg, badges]) => {
        const totalCoins = (coinAgg.rows || []).reduce((s, r) => s + (r.sum_amount || 0), 0);
        setData({ posts, comments, challenges, truth, badges, totalCoins, coinRows: coinAgg.rows || [] });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="text-muted-foreground text-sm">Loading overview…</div>;
  if (!data) return <div className="text-muted-foreground text-sm">Unable to load overview.</div>;

  const cards = [
    { label: "Posts", value: data.posts, icon: FileText },
    { label: "Comments", value: data.comments, icon: MessageSquare },
    { label: "Open Challenges", value: data.challenges, icon: Swords },
    { label: "Truth Scores", value: data.truth, icon: ShieldCheck },
    { label: "Badges", value: data.badges, icon: Award },
    { label: "Wise-Coins Minted", value: data.totalCoins, icon: Coins },
  ];

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="p-6 rounded-2xl border border-border bg-card/50">
            <div className="flex items-center justify-between mb-3">
              <c.icon className="w-5 h-5 text-primary" />
              <span className="text-3xl font-heading text-foreground">{c.value}</span>
            </div>
            <p className="text-sm text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="p-6 rounded-2xl border border-border bg-card/50">
        <h3 className="font-heading text-xl text-foreground mb-4">Wise-Coin Economy by Category</h3>
        <div className="space-y-3">
          {data.coinRows.length === 0 && <p className="text-sm text-muted-foreground">No coins minted yet.</p>}
          {data.coinRows.map((r) => (
            <div key={r.category} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground capitalize">{r.category}</span>
              <span className="font-mono text-accent">{r.sum_amount || 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}