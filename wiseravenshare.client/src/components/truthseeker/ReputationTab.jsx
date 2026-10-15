import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Crown, ShieldCheck, Award } from "lucide-react";
import { Image } from "@/components/ui/image";

export default function ReputationTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.entities.UserProfile
      .filter({}, { sort: "-truth_reputation", limit: 20 })
      .then((page) => setUsers(page.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getMedal = (i) => {
    if (i === 0) return { icon: Crown, color: "text-accent" };
    if (i === 1) return { icon: Award, color: "text-blue-400" };
    if (i === 2) return { icon: Award, color: "text-orange-400" };
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="font-heading text-lg text-foreground">
            Truth Reputation Leaderboard
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Creators ranked by their accumulated truth reputation from verified,
          high-integrity content.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No profiles yet.
        </p>
      ) : (
        <div className="space-y-2">
          {users.map((u, i) => {
            const medal = getMedal(i);
            const MedalIcon = medal?.icon;
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <div className="w-8 text-center">
                  {MedalIcon ? (
                    <MedalIcon className={`w-5 h-5 mx-auto ${medal.color}`} />
                  ) : (
                    <span className="text-sm text-muted-foreground font-mono">
                      {i + 1}
                    </span>
                  )}
                </div>
                {u.avatar_uri ? (
                  <Image
                    src={u.avatar_uri}
                    alt={u.display_name}
                    className="w-8 h-8 rounded-full"
                    fittingType="fill"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs text-muted-foreground">
                    {u.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate flex items-center gap-1.5">
                    {u.display_name}
                    {u.verified && (
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u.post_count || 0} posts
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-accent">
                    {u.truth_reputation || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">rep</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}