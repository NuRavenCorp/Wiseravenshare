import React, { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient, resolveMediaUrl } from "@/api/client";
import {
  Clock,
  LayoutGrid,
  User,
  Users,
  Sparkles,
  RefreshCw,
  Search,
  Pin,
  ChevronDown,
  ChevronUp,
  Feather,
  Loader2,
  Calendar,
  Compass,
  ArrowRight,
  Check,
} from "lucide-react";
import PostCard from "./PostCard";
import PostTimeline from "./PostTimeline";

const normalizePost = (post) => ({
  ...post,
  created_by_id: post.userId || post.created_by_id,
  author: post.user || post.author,
  created_date: post.createdAt || post.created_date,
  like_count: post.likesCount ?? post.like_count ?? 0,
  repost_count: post.repostsCount ?? post.repost_count ?? 0,
  comment_count: post.commentsCount ?? post.comment_count ?? 0,
  share_count: post.sharesCount ?? post.share_count ?? 0,
  media_uris: post.mediaUrls || post.media_uris || (post.mediaUrl ? [post.mediaUrl] : []),
  is_liked: post.isLiked ?? post.is_liked,
  is_reposted: post.isReposted ?? post.is_reposted,
  hashtags: post.hashtags || [...new Set((post.content?.match(/#[\p{L}\p{N}_-]+/gu) || []).map((tag) => tag.slice(1)))],
});

export default function UserPersonalFeedTimeline({
  currentUser,
  allPosts = [],
  onAuthRequired,
  onHashtagClick,
  onAuthorClick,
  blockedIds = [],
}) {
  const [selectedUser, setSelectedUser] = useState(() => currentUser || null);
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "grid"
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPinned, setIsPinned] = useState(() => {
    try {
      return localStorage.getItem("wiseravenshare_timeline_pinned") !== "false";
    } catch {
      return true;
    }
  });

  // Keep selected user updated if currentUser changes and nothing selected yet
  useEffect(() => {
    if (currentUser && (!selectedUser || selectedUser.id === "me" || selectedUser.id === "visitor")) {
      setSelectedUser(currentUser);
    }
  }, [currentUser]);

  // Featured creator personas for fast 1-click timeline inspection
  const featuredCreators = useMemo(() => [
    { id: "marcus_vance", name: "Dr. Marcus Vance", handle: "marcus_vance", role: "AI Ethicist" },
    { id: "novapulse", name: "Nova Sterling", handle: "novapulse", role: "EDM Producer" },
    { id: "seraphinabloom", name: "Seraphina Bloom", handle: "seraphinabloom", role: "Permaculture" },
    { id: "elena_quantum", name: "Dr. Elena Rostova", handle: "elena_quantum", role: "Astrobiologist" },
    { id: "cipher_privacy", name: "Lucas Vance", handle: "cipher_privacy", role: "Cryptographer" },
    { id: "mayaspace", name: "Maya Lin", handle: "mayaspace", role: "Architect" },
    { id: "tariq_grid", name: "Tariq Al-Mansoor", handle: "tariq_grid", role: "Clean Grid" },
    { id: "chefdante", name: "Chef Dante Rossi", handle: "chefdante", role: "Heritage Baker" },
  ], []);

  // Fetch or filter posts for the selected user
  const fetchUserPosts = useCallback(async () => {
    if (!selectedUser) {
      // Fallback to current user or first creator
      if (currentUser) {
        setSelectedUser(currentUser);
      } else {
        setSelectedUser(featuredCreators[0]);
      }
      return;
    }

    setLoading(true);
    const userIdOrHandle = selectedUser.id || selectedUser.handle || selectedUser.username || "me";

    try {
      // Try fetching direct user posts from server API
      let serverPosts = [];
      try {
        serverPosts = await apiClient.posts.userPosts(userIdOrHandle, 1, 50);
      } catch {
        // Fallback to filtering from loaded allPosts snapshot
      }

      let resolved = Array.isArray(serverPosts) && serverPosts.length > 0 ? serverPosts : [];

      if (resolved.length === 0 && Array.isArray(allPosts) && allPosts.length > 0) {
        resolved = allPosts.filter((p) => {
          const author = p.author || p.user;
          const matchId = p.userId === selectedUser.id || p.created_by_id === selectedUser.id || author?.id === selectedUser.id;
          const matchHandle =
            (selectedUser.handle && author?.username && author.username.toLowerCase().includes(selectedUser.handle.toLowerCase())) ||
            (selectedUser.username && author?.username && author.username.toLowerCase().includes(selectedUser.username.toLowerCase()));
          const matchName = selectedUser.name && author?.name && author.name.toLowerCase() === selectedUser.name.toLowerCase();
          return matchId || matchHandle || matchName;
        });
      }

      setUserPosts(resolved.map(normalizePost));
    } catch (err) {
      console.warn("Could not load personal timeline posts:", err);
      // Filter from available local posts
      if (allPosts.length > 0) {
        const localMatches = allPosts.filter((p) => {
          const author = p.author || p.user;
          return (
            p.userId === selectedUser?.id ||
            author?.id === selectedUser?.id ||
            (selectedUser?.handle && author?.username?.toLowerCase().includes(selectedUser.handle.toLowerCase()))
          );
        });
        setUserPosts(localMatches.map(normalizePost));
      }
    } finally {
      setLoading(false);
    }
  }, [selectedUser, currentUser, allPosts, featuredCreators]);

  useEffect(() => {
    fetchUserPosts();
  }, [fetchUserPosts]);

  const togglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    try {
      localStorage.setItem("wiseravenshare_timeline_pinned", String(next));
    } catch {}
  };

  const handleSelectCreator = (creator) => {
    setSelectedUser(creator);
    setSearchQuery("");
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const cleanQuery = searchQuery.trim().replace(/^@/, "");
    // Check if matching featured creator
    const foundCreator = featuredCreators.find(
      (c) => c.handle.toLowerCase() === cleanQuery.toLowerCase() || c.name.toLowerCase().includes(cleanQuery.toLowerCase())
    );
    if (foundCreator) {
      setSelectedUser(foundCreator);
    } else {
      setSelectedUser({
        id: cleanQuery,
        name: `@${cleanQuery}`,
        handle: cleanQuery,
        username: cleanQuery,
      });
    }
  };

  const currentDisplayName =
    selectedUser?.id === currentUser?.id || (!selectedUser?.id && currentUser)
      ? `${currentUser?.name || currentUser?.username || "My"} Timeline`
      : `${selectedUser?.name || selectedUser?.displayName || `@${selectedUser?.handle || "User"}`}'s Timeline`;

  const activeAvatar =
    selectedUser?.avatar ||
    selectedUser?.avatarUrl ||
    (selectedUser?.id === currentUser?.id ? currentUser?.avatar || currentUser?.avatarUrl : "");

  return (
    <section
      id="personal-feed-timeline-section"
      className="mt-12 rounded-2xl border border-primary/25 bg-gradient-to-b from-card/95 via-card/85 to-background shadow-xl backdrop-blur-md overflow-hidden transition-all duration-300"
    >
      {/* Header Banner */}
      <div className="border-b border-border/60 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-inner">
              <Clock className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-lg font-bold text-foreground tracking-tight">
                  Personal Feed & Timeline
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/20 text-primary border border-primary/30">
                  <Sparkles className="w-2.5 h-2.5" /> Extended Feed
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Every creator gets their own chronological timeline & personal stream.
              </p>
            </div>
          </div>

          {/* Quick Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-border bg-background/80 p-0.5 text-xs">
              <button
                onClick={() => setViewMode("timeline")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
                  viewMode === "timeline" ? "bg-primary text-primary-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                title="View as Chronological Timeline"
              >
                <Clock className="w-3.5 h-3.5" /> Timeline
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
                  viewMode === "grid" ? "bg-primary text-primary-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                title="View as Post Cards Feed"
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Grid Feed
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchUserPosts}
              disabled={loading}
              className="p-1.5 rounded-lg border border-border bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Refresh timeline"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-primary" : ""}`} />
            </button>

            {/* Pin / Dock Toggle */}
            <button
              onClick={togglePin}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                isPinned
                  ? "border-primary/40 bg-primary/15 text-primary font-medium"
                  : "border-border bg-background/80 text-muted-foreground hover:text-foreground"
              }`}
              title={isPinned ? "Timeline pinned to bottom of feed" : "Pin timeline to bottom"}
            >
              <Pin className={`w-3.5 h-3.5 ${isPinned ? "rotate-45 text-primary" : ""}`} />
              <span className="hidden sm:inline">{isPinned ? "Pinned" : "Pin"}</span>
            </button>

            {/* Expand / Collapse */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg border border-border bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
              title={isExpanded ? "Collapse Timeline" : "Expand Timeline"}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Creator Navigation Strip */}
        {isExpanded && (
          <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              <span className="text-muted-foreground mr-1 font-medium flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-primary" /> View Creator:
              </span>

              {/* Current User's Timeline */}
              {currentUser && (
                <button
                  onClick={() => setSelectedUser(currentUser)}
                  className={`px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                    selectedUser?.id === currentUser?.id
                      ? "border-primary bg-primary text-primary-foreground font-medium shadow-sm"
                      : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  <User className="w-3 h-3" /> My Timeline
                </button>
              )}

              {/* Quick Persona Chips */}
              {featuredCreators.map((creator) => {
                const isSelected = selectedUser?.handle === creator.handle || selectedUser?.id === creator.id;
                return (
                  <button
                    key={creator.id}
                    onClick={() => handleSelectCreator(creator)}
                    className={`px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground font-medium shadow-sm"
                        : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <span>{creator.name}</span>
                    <span className="opacity-60 text-[10px]">· {creator.role}</span>
                  </button>
                );
              })}
            </div>

            {/* Search Creator Form */}
            <form onSubmit={handleSearchSubmit} className="relative flex items-center min-w-[200px]">
              <input
                type="text"
                placeholder="Find @user or handle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 rounded-full bg-background/80 border border-border/80 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </form>
          </div>
        )}
      </div>

      {/* Timeline / Feed Content Body */}
      {isExpanded && (
        <div className="p-5 sm:p-6">
          {/* Active Profile Info Banner */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/50 p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                {activeAvatar ? (
                  <img
                    src={resolveMediaUrl(activeAvatar)}
                    alt={selectedUser?.name || "User Avatar"}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/40"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-bold text-lg">
                    {(selectedUser?.name || selectedUser?.username || "U")[0].toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-1 ring-background">
                  <Check className="h-2.5 w-2.5" />
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-heading text-base font-bold text-foreground">
                    {currentDisplayName}
                  </h4>
                  {selectedUser?.handle && (
                    <span className="text-xs text-muted-foreground">@{selectedUser.handle.replace(/^@/, "")}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {selectedUser?.bio || selectedUser?.role || "Sharing ideas, milestones, and perspectives across the open creative protocol."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="text-right">
                <span className="font-bold text-foreground text-sm">{userPosts.length}</span>
                <span className="text-muted-foreground ml-1">posts recorded</span>
              </div>
            </div>
          </div>

          {/* Posts View */}
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Loading personalized timeline and posts...</p>
            </div>
          ) : userPosts.length === 0 ? (
            <div className="py-14 text-center rounded-xl border border-dashed border-border/80 bg-background/40">
              <Feather className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
              <h5 className="font-heading text-sm font-semibold text-foreground mb-1">
                No timeline posts found for this creator yet
              </h5>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                {selectedUser?.id === currentUser?.id
                  ? "You haven't posted to your personal timeline yet. Share your first thought, milestone, or creative work!"
                  : "Explore other creator timelines above to discover perspectives across the network."}
              </p>

              {selectedUser?.id === currentUser?.id ? (
                <button
                  onClick={() => {
                    const anchor = document.getElementById("posts-feed-anchor");
                    if (anchor) anchor.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <Feather className="w-3.5 h-3.5" /> Create Your First Post
                </button>
              ) : (
                <button
                  onClick={() => handleSelectCreator(featuredCreators[0])}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  <Compass className="w-3.5 h-3.5" /> Explore {featuredCreators[0].name}'s Timeline
                </button>
              )}
            </div>
          ) : viewMode === "timeline" ? (
            <div className="relative pl-2 sm:pl-4">
              <PostTimeline
                posts={userPosts}
                currentUser={currentUser}
                blockedIds={blockedIds}
                onHashtagClick={onHashtagClick}
                onAuthorClick={onAuthorClick}
                onAuthRequired={onAuthRequired}
              />
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {userPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUser={currentUser}
                  blockedIds={blockedIds}
                  onHashtagClick={onHashtagClick}
                  onAuthorClick={onAuthorClick}
                  onAuthRequired={onAuthRequired}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
