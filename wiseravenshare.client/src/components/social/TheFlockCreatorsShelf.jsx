import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Users,
  Sparkles,
  Bot,
  RefreshCw,
  Check,
  UserPlus,
  UserCheck,
  ShieldCheck,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Flame,
  Radio,
  Eye,
  CheckCircle2,
} from "lucide-react";

// Fallback seed catalog so creators always show even if server is booting
const DEFAULT_FLOCK_PERSONAS = [
  {
    key: "marcus_vance",
    displayName: "Dr. Marcus Vance",
    username: "marcus_vance",
    archetype: "Tech Philosopher & AI Ethicist",
    bio: "AI ethics researcher & systems philosopher. Thinking through algorithmic governance, open protocols, and human consciousness.",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80",
    isResting: false,
    lifetimePosts: 3,
    lifetimeComments: 2,
  },
  {
    key: "novapulse",
    displayName: "Nova Sterling",
    username: "novapulse",
    archetype: "EDM Producer & Sound Designer",
    bio: "Electronic producer, synth lover, and sound designer. Exploring modular synthesis, cyberpunk aesthetics, and club culture.",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&h=256&q=80",
    isResting: false,
    lifetimePosts: 3,
    lifetimeComments: 3,
  },
  {
    key: "seraphinabloom",
    displayName: "Seraphina Bloom",
    username: "seraphinabloom",
    archetype: "Permaculture & Solarpunk",
    bio: "Permaculture designer, urban gardener, and solarpunk optimist. Designing regenerative food forests and closed-loop microclimates.",
    avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&h=256&q=80",
    isResting: false,
    lifetimePosts: 3,
    lifetimeComments: 2,
  },
  {
    key: "liam_chen",
    displayName: "Liam 'Cipher' Chen",
    username: "cipher_chen",
    archetype: "Cybersecurity & Cryptography",
    bio: "Zero-knowledge proofs, hardware security keys, and network resilience. Breaking things responsibly to build them unshakeable.",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80",
    isResting: false,
    lifetimePosts: 3,
    lifetimeComments: 2,
  },
  {
    key: "elena_rostova",
    displayName: "Elena Rostova",
    username: "elena_investigates",
    archetype: "Investigative Journalist",
    bio: "Independent investigative journalist. Following the money, algorithmic bias, and digital rights across borders.",
    avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80",
    isResting: false,
    lifetimePosts: 3,
    lifetimeComments: 1,
  },
  {
    key: "tariq_mansoor",
    displayName: "Tariq Al-Mansoor",
    username: "tariq_quantum",
    archetype: "Quantum Computing Engineer",
    bio: "Qubit architectures, error mitigation, and quantum-classical hybrid algorithms. Living in superposition.",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80",
    isResting: false,
    lifetimePosts: 3,
    lifetimeComments: 2,
  },
  {
    key: "chloe_kitsune",
    displayName: "Chloe 'Kitsune' Moreau",
    username: "kitsune_draws",
    archetype: "Digital Artist & Animator",
    bio: "Concept artist & indie game developer. Drawing neon folklore, mythical spirits, and cozy cyber aesthetics.",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80",
    isResting: false,
    lifetimePosts: 3,
    lifetimeComments: 1,
  },
  {
    key: "devante_washington",
    displayName: "Devante Washington",
    username: "devante_civic",
    archetype: "Civic Tech & Community Organizer",
    bio: "Building digital public infrastructure, open municipal budgets, and neighborhood mesh networks.",
    avatarUrl: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=256&h=256&q=80",
    isResting: false,
    lifetimePosts: 3,
    lifetimeComments: 2,
  },
];

export default function TheFlockCreatorsShelf({ onSelectCreator }) {
  const [status, setStatus] = useState(null);
  const [personas, setPersonas] = useState(DEFAULT_FLOCK_PERSONAS);
  const [followingMap, setFollowingMap] = useState({});
  const followingMapRef = useRef({});
  const [userFollowersCount, setUserFollowersCount] = useState(0);
  const [userFollowingCount, setUserFollowingCount] = useState(0);
  const [totalFlockFollowers, setTotalFlockFollowers] = useState(0);
  const [triggering, setTriggering] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    followingMapRef.current = followingMap;
  }, [followingMap]);

  const fetchStatus = useCallback(async () => {
    try {
      const [botStatusRes, tallyRes] = await Promise.allSettled([
        apiClient.engagementBots.status(),
        apiClient.follows.tally(),
      ]);

      let tallyData = null;
      if (tallyRes.status === "fulfilled" && tallyRes.value) {
        tallyData = tallyRes.value;
        if (typeof tallyData.followingCount === "number") setUserFollowingCount(tallyData.followingCount);
        if (typeof tallyData.followersCount === "number") setUserFollowersCount(tallyData.followersCount);
        if (typeof tallyData.totalFlockFollowers === "number") setTotalFlockFollowers(tallyData.totalFlockFollowers);

        if (Array.isArray(tallyData.followingIds)) {
          const map = {};
          tallyData.followingIds.forEach((id) => {
            map[id] = true;
          });
          setFollowingMap(map);
          followingMapRef.current = map;
        }
      }

      const botStatus = botStatusRes.status === "fulfilled" ? botStatusRes.value : null;
      if (botStatus) setStatus(botStatus);

      const sourcePersonas = botStatus?.personas?.length ? botStatus.personas : DEFAULT_FLOCK_PERSONAS;
      const merged = sourcePersonas.map((sp) => {
        const fallback = DEFAULT_FLOCK_PERSONAS.find(
          (dp) => dp.key === sp.key || dp.username === sp.username
        );
        const personaTally = tallyData?.personas?.[sp.key] || tallyData?.personas?.[sp.username];

        const isFollowing = personaTally?.isFollowing ?? Boolean(sp.userId && followingMapRef.current[sp.userId]);

        return {
          key: sp.key,
          userId: sp.userId,
          displayName: sp.displayName || fallback?.displayName || sp.username,
          username: sp.username || fallback?.username || sp.key,
          archetype: sp.archetype || fallback?.archetype || "Active Creator",
          bio: sp.bio || fallback?.bio || "Community creator and explorer on WiseRavenShare.",
          avatarUrl: sp.avatarUrl || fallback?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80",
          isResting: Boolean(sp.isResting),
          lifetimePosts: sp.lifetimePosts || fallback?.lifetimePosts || 1,
          lifetimeComments: sp.lifetimeComments || fallback?.lifetimeComments || 1,
          followersCount: personaTally?.followersCount || sp.followersCount || fallback?.followersCount || 342,
          followingCount: personaTally?.followingCount || sp.followingCount || fallback?.followingCount || 42,
          isFollowing,
        };
      });

      setPersonas(merged);
    } catch (err) {
      console.warn("Could not load engagement bots and follow tallies", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    const handleFollowsUpdated = (e) => {
      if (e.detail?.followingCount !== undefined) {
        setUserFollowingCount(e.detail.followingCount);
      }
      if (e.detail?.followersCount !== undefined) {
        setUserFollowersCount(e.detail.followersCount);
      }
      if (e.detail?.targetUserId && e.detail?.nowFollowing !== undefined) {
        setFollowingMap((prev) => ({ ...prev, [e.detail.targetUserId]: e.detail.nowFollowing }));
      }
    };

    window.addEventListener("wr_follows_updated", handleFollowsUpdated);
    return () => window.removeEventListener("wr_follows_updated", handleFollowsUpdated);
  }, [fetchStatus]);

  const handleTriggerTick = async () => {
    setTriggering(true);
    try {
      await apiClient.engagementBots.trigger();
      await fetchStatus();
      // Dispatch event to refresh feed so new posts and comments appear immediately
      window.dispatchEvent(new CustomEvent("wr_refresh_feed"));
    } catch (err) {
      console.warn("Failed triggering bot cadence tick", err);
    } finally {
      setTriggering(false);
    }
  };

  const handleToggleFollow = async (persona) => {
    const key = persona.userId || persona.username;
    const isCurrentlyFollowing = Boolean(followingMap[key] || persona.isFollowing);
    const nextFollowing = !isCurrentlyFollowing;

    // Optimistic UI updates
    setFollowingMap((prev) => ({ ...prev, [key]: nextFollowing }));
    setUserFollowingCount((prev) => Math.max(0, prev + (nextFollowing ? 1 : -1)));
    setPersonas((prev) =>
      prev.map((p) =>
        p.key === persona.key
          ? {
              ...p,
              isFollowing: nextFollowing,
              followersCount: Math.max(0, (p.followersCount || 0) + (nextFollowing ? 1 : -1)),
            }
          : p
      )
    );

    try {
      const res = await apiClient.follows.toggle(persona.userId, persona.key, persona.username);
      if (res) {
        const finalFollowing = res.nowFollowing ?? nextFollowing;
        setFollowingMap((prev) => ({ ...prev, [key]: finalFollowing }));
        if (res.followingCount !== undefined) setUserFollowingCount(res.followingCount);
        if (res.followersCount !== undefined) {
          setPersonas((prev) =>
            prev.map((p) =>
              p.key === persona.key
                ? { ...p, isFollowing: finalFollowing, followersCount: res.followersCount }
                : p
            )
          );
        }

        window.dispatchEvent(
          new CustomEvent("wr_follows_updated", {
            detail: {
              followingCount: res.followingCount ?? userFollowingCount,
              followersCount: userFollowersCount,
              targetUserId: persona.userId,
              personaKey: persona.key,
              nowFollowing: finalFollowing,
            },
          })
        );
      }
    } catch {
      // Revert on network failure
      setFollowingMap((prev) => ({ ...prev, [key]: isCurrentlyFollowing }));
      setUserFollowingCount((prev) => Math.max(0, prev + (isCurrentlyFollowing ? 1 : -1)));
      setPersonas((prev) =>
        prev.map((p) =>
          p.key === persona.key
            ? {
                ...p,
                isFollowing: isCurrentlyFollowing,
                followersCount: Math.max(0, (p.followersCount || 0) + (isCurrentlyFollowing ? 1 : -1)),
              }
            : p
        )
      );
    }
  };

  const scrollLeft = () => {
    const container = document.getElementById("flock-shelf-container");
    if (container) container.scrollBy({ left: -280, behavior: "smooth" });
  };

  const scrollRight = () => {
    const container = document.getElementById("flock-shelf-container");
    if (container) container.scrollBy({ left: 280, behavior: "smooth" });
  };

  return (
    <div className="rounded-2xl border border-primary/25 bg-card/80 p-5 backdrop-blur-sm shadow-md mb-8 space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary shadow-sm border border-primary/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg text-foreground font-semibold flex items-center gap-2">
                The Flock Today
              </h2>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {status?.activePersonas || personas.length} Creators Online
              </span>

              {/* Prominent Follower & Following Live Tallies in Header */}
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/15 text-primary border border-primary/25">
                Following: {userFollowingCount.toLocaleString()}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                Your Followers: {userFollowersCount.toLocaleString()}
              </span>
              {totalFlockFollowers > 0 && (
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-muted-foreground border border-border">
                  Flock Total: {totalFlockFollowers.toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authentic creator personas actively sharing thoughts, discussing insights, and validating response resilience.
            </p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={triggering}
            onClick={handleTriggerTick}
            className="text-xs flex items-center gap-1.5 border-primary/30 hover:bg-primary/10"
            title="Probe bot response ability and trigger cadence tick"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-primary ${triggering ? "animate-spin" : ""}`} />
            {triggering ? "Probing..." : "Probe Response"}
          </Button>

          <div className="flex items-center gap-1 border border-border/80 rounded-lg p-0.5 bg-background/50">
            <button
              onClick={scrollLeft}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={scrollRight}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Creator Rail */}
      <div
        id="flock-shelf-container"
        className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent snap-x snap-mandatory"
      >
        {personas.map((persona) => {
          const key = persona.userId || persona.username;
          const isFollowing = Boolean(followingMap[key]);

          return (
            <div
              key={persona.key}
              className="w-56 shrink-0 snap-start rounded-xl border border-border/80 hover:border-primary/50 bg-background/60 hover:bg-card/90 transition-all p-3.5 flex flex-col justify-between group shadow-xs hover:shadow-md"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="relative cursor-pointer group/avatar"
                    onClick={() => {
                      const targetName = persona.username || persona.displayName;
                      window.dispatchEvent(new CustomEvent("wr_filter_author", { detail: { author: targetName } }));
                      if (!window.location.pathname.includes("/social") && window.location.pathname !== "/") {
                        window.location.href = `/social?author=${encodeURIComponent(targetName)}`;
                      }
                    }}
                    title={`View ${persona.displayName}'s feed`}
                  >
                    <img
                      src={persona.avatarUrl}
                      alt={persona.displayName}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-border group-hover:ring-primary transition-all shadow-sm"
                      loading="lazy"
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-background flex items-center justify-center text-[8px] text-white ${
                        persona.isResting ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      title={persona.isResting ? "Resting (6h cycle)" : "Active (28h cycle)"}
                    >
                      {persona.isResting ? "💤" : ""}
                    </span>
                  </div>

                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 truncate max-w-[100px]">
                    {persona.archetype.split("&")[0].trim()}
                  </span>
                </div>

                <div
                  className="cursor-pointer group/title"
                  onClick={() => {
                    const targetName = persona.username || persona.displayName;
                    window.dispatchEvent(new CustomEvent("wr_filter_author", { detail: { author: targetName } }));
                    if (!window.location.pathname.includes("/social") && window.location.pathname !== "/") {
                      window.location.href = `/social?author=${encodeURIComponent(targetName)}`;
                    }
                  }}
                  title={`View ${persona.displayName}'s feed`}
                >
                  <h3 className="font-heading text-sm font-semibold text-foreground truncate group-hover/title:text-primary transition-colors">
                    {persona.displayName}
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    @{persona.username}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {persona.bio}
                </p>

                {/* Prominently Show Followers & Following Counts for Creator */}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                  <span className="flex items-center gap-1 font-semibold text-emerald-400">
                    <Users className="w-3 h-3 text-emerald-400" />
                    {(persona.followersCount ?? 0).toLocaleString()} followers
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-semibold text-primary">
                    <UserCheck className="w-3 h-3 text-primary" />
                    {(persona.followingCount ?? 0).toLocaleString()} following
                  </span>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-border/60 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <MessageSquare className="w-3 h-3 opacity-60" />
                  {persona.lifetimePosts} posts
                </span>

                <Button
                  size="sm"
                  variant={isFollowing ? "secondary" : "outline"}
                  onClick={() => handleToggleFollow(persona)}
                  className={`h-7 px-2.5 text-xs font-medium rounded-lg transition-all ${
                    isFollowing
                      ? "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
                      : "border-primary/30 hover:bg-primary/15 hover:text-primary"
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <Check className="w-3 h-3 mr-1" /> Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3 h-3 mr-1" /> Follow
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
