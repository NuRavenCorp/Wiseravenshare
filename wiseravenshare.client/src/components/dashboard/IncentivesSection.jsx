import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import {
  Award,
  TrendingUp,
  Loader2,
  Coins,
  Zap,
} from "lucide-react";
import { getTier, getNextTier } from "@/lib/wiseCoinTiers";

const EARNING_RATES = [
  { action: "Publish a post", rate: 5, icon: "✍️", category: "Productivity" },
  { action: "Write a comment", rate: 2, icon: "💬", category: "Participation" },
  { action: "Like a post", rate: 2, icon: "❤️", category: "Participation" },
  { action: "Gain a follower", rate: 3, icon: "👥", category: "Promotion" },
  { action: "Get a share", rate: 3, icon: "🔄", category: "Promotion" },
  { action: "High truth score", rate: "up to 100", icon: "🛡️", category: "Value" },
  { action: "Invite a friend who joins", rate: 25, icon: "📨", category: "Promotion" },
];

export default function IncentivesSection() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [badges, setBadges] = useState([]);
  const [userBadges, setUserBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [balAgg, txRes, badgeRes, ubRes] = await Promise.all([
          apiClient.entities.WiseCoinTransaction.aggregate({ sum: "amount" }),
          apiClient.entities.WiseCoinTransaction.filter(
            {},
            { sort: "-created_date", limit: 10 }
          ),
          apiClient.entities.Badge.filter({}, { sort: "threshold", limit: 50 }),
          apiClient.entities.UserBadge.filter({ user_id: user?.id }, { limit: 50 }),
        ]);
        setBalance(balAgg.rows[0]?.sum_amount || 0);
        setTransactions(txRes.items || []);
        setBadges(badgeRes.items || []);
        setUserBadges(ubRes.items || []);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user?.id]);

  const tier = getTier(balance);
  const nextTier = getNextTier(balance);
  const earnedBadgeIds = new Set(userBadges.map((ub) => ub.badge_id));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              WiseCoin Balance
            </p>
            <p className={`text-xs font-medium ${tier.color}`}>
              {tier.name} Tier
            </p>
          </div>
          <p className="text-2xl font-display text-accent text-glow-gold">
            {balance}
          </p>
        </div>
        {nextTier && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">
                Progress to {nextTier.name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {balance} / {nextTier.min}
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (balance / nextTier.min) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">
            How to Earn WiseCoins
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EARNING_RATES.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
            >
              <span className="text-lg">{e.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{e.action}</p>
                <p className="text-xs text-muted-foreground">{e.category}</p>
              </div>
              <p className="text-sm font-mono text-accent">+{e.rate}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-accent" />
          <p className="text-xs font-medium text-muted-foreground">Badges</p>
        </div>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : badges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No badges available yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {badges.map((b) => {
              const earned = earnedBadgeIds.has(b.id);
              return (
                <div
                  key={b.id}
                  className={`p-3 rounded-lg border text-center ${
                    earned
                      ? "border-accent/30 bg-accent/5"
                      : "border-border bg-card opacity-60"
                  }`}
                >
                  <div
                    className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2 ${
                      earned ? "bg-accent/15" : "bg-secondary"
                    }`}
                  >
                    <Award
                      className={`w-5 h-5 ${
                        earned ? "text-accent" : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <p className="text-xs font-medium text-foreground truncate">
                    {b.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {b.description}
                  </p>
                  {earned ? (
                    <p className="text-xs text-accent mt-1">Earned</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Threshold: {b.threshold}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">
            Recent Rewards
          </p>
        </div>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No rewards yet. Start engaging to earn WiseCoins!
          </p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{t.reason}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {t.category}
                  </p>
                </div>
                <p className="text-sm font-mono text-accent">+{t.amount}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}