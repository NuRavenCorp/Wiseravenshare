import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Users, UserPlus, Heart, TrendingUp, Flame, Bell } from "lucide-react";

function StatPill({ icon: Icon, label, count, accent, newCount = 0, animate = false }) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center px-6 py-5 rounded-2xl border transition-all group overflow-hidden
        ${accent === "emerald"
          ? "bg-emerald-500/8 border-emerald-500/25 hover:border-emerald-500/50 hover:bg-emerald-500/12"
          : accent === "red"
          ? "bg-red-500/8 border-red-500/25 hover:border-red-500/50 hover:bg-red-500/12"
          : accent === "primary"
          ? "bg-primary/8 border-primary/25 hover:border-primary/40 hover:bg-primary/12"
          : "bg-amber-500/8 border-amber-500/25 hover:border-amber-500/50 hover:bg-amber-500/12"
        }`}
    >
      {/* Glow blob */}
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none blur-2xl rounded-2xl
          ${accent === "emerald" ? "bg-emerald-500/10"
            : accent === "red" ? "bg-red-500/10"
            : accent === "primary" ? "bg-primary/10"
            : "bg-amber-500/10"}`}
      />

      {/* Icon badge */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 shrink-0
        ${accent === "emerald" ? "bg-emerald-500/15 text-emerald-400"
          : accent === "red" ? "bg-red-500/15 text-red-400"
          : accent === "primary" ? "bg-primary/15 text-primary"
          : "bg-amber-500/15 text-amber-400"}`}
      >
        <Icon className="w-5 h-5" />
      </div>

      {/* Count */}
      <p className={`text-4xl font-heading font-bold leading-none tabular-nums tracking-tight
        ${accent === "emerald" ? "text-emerald-300"
          : accent === "red" ? "text-red-300"
          : accent === "primary" ? "text-foreground"
          : "text-amber-300"}`}
      >
        {typeof count === "number" ? count.toLocaleString() : count}
      </p>

      {/* Label */}
      <p className="text-xs text-muted-foreground font-medium mt-1 uppercase tracking-wider">{label}</p>

      {/* New badge */}
      {newCount > 0 && (
        <span className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold
          ${animate ? "animate-pulse" : ""}
          ${accent === "emerald" ? "bg-emerald-500 text-white"
            : accent === "red" ? "bg-red-500 text-white"
            : accent === "primary" ? "bg-primary text-primary-foreground"
            : "bg-amber-500 text-black"}`}
        >
          +{newCount}
        </span>
      )}
    </div>
  );
}

export default function FollowStatsHero() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    followers: 0,
    following: 0,
    likes: 0,
    newFollowers: 0,
    newLikes: 0,
  });
  const [loaded, setLoaded] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [followingRes, followersRes, notifsRes] = await Promise.allSettled([
        apiClient.follows.following(),
        apiClient.follows.followers(user.id),
        apiClient.notifications.list(1, 50, ""),
      ]);

      const following = followingRes.status === "fulfilled" ? (followingRes.value?.followingCount ?? 0) : 0;
      const followers = followersRes.status === "fulfilled" ? (followersRes.value?.followersCount ?? 0) : 0;

      let newFollowers = 0;
      let newLikes = 0;
      let totalLikes = 0;

      if (notifsRes.status === "fulfilled") {
        const items = notifsRes.value?.items || [];
        const unread = items.filter((n) => !(n.IsRead ?? n.isRead));
        newFollowers = unread.filter((n) => {
          const t = n.type || n.Type || "";
          return t === "follow" || t === "Follow";
        }).length;
        newLikes = unread.filter((n) => {
          const t = n.type || n.Type || "";
          return t === "like" || t === "Like";
        }).length;
        totalLikes = items.filter((n) => {
          const t = n.type || n.Type || "";
          return t === "like" || t === "Like";
        }).length;
      }

      setStats({ followers, following, likes: totalLikes, newFollowers, newLikes });
      setLoaded(true);
    } catch { /* best effort */ }
  }, [user?.id]);

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 30_000);
    return () => clearInterval(timer);
  }, [fetchStats]);

  if (!user) return null;

  return (
    <div className="relative mb-8 rounded-2xl overflow-hidden border border-border/60 bg-card shadow-sm">
      {/* Background gradient mesh */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-emerald-500/8 blur-3xl" />
        <div className="absolute -bottom-10 right-12 w-64 h-64 rounded-full bg-primary/6 blur-3xl" />
        <div className="absolute top-4 right-4 w-48 h-48 rounded-full bg-amber-500/6 blur-2xl" />
      </div>

      {/* Header row */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground leading-tight">
              Your Flock &amp; Reach
            </h2>
            <p className="text-xs text-muted-foreground">Live community stats · updates every 30s</p>
          </div>
        </div>
        {(stats.newFollowers > 0 || stats.newLikes > 0) && (
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-xs text-primary font-semibold">
              {stats.newFollowers + stats.newLikes} new alerts
            </span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
        <StatPill
          icon={Users}
          label="Followers"
          count={loaded ? stats.followers : "—"}
          accent="emerald"
          newCount={stats.newFollowers}
          animate
        />
        <StatPill
          icon={UserPlus}
          label="Following"
          count={loaded ? stats.following : "—"}
          accent="primary"
        />
        <StatPill
          icon={Heart}
          label="Likes Received"
          count={loaded ? stats.likes : "—"}
          accent="red"
          newCount={stats.newLikes}
          animate
        />
        <StatPill
          icon={Flame}
          label="New Activity"
          count={loaded ? (stats.newFollowers + stats.newLikes) : "—"}
          accent="amber"
          animate={stats.newFollowers + stats.newLikes > 0}
        />
      </div>

      {/* Footer micro-labels */}
      {(stats.newFollowers > 0) && (
        <div className="relative z-10 px-6 pb-4 flex flex-wrap items-center gap-3">
          {stats.newFollowers > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 animate-pulse">
              <Users className="w-3 h-3" /> {stats.newFollowers} new follower{stats.newFollowers !== 1 ? "s" : ""} since last check
            </span>
          )}
          {stats.newLikes > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse">
              <Heart className="w-3 h-3" /> {stats.newLikes} new like{stats.newLikes !== 1 ? "s" : ""} since last check
            </span>
          )}
        </div>
      )}
    </div>
  );
}
