import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { apiClient } from "@/api/client";
import { Loader2, Feather, LayoutGrid, Clock, TrendingUp, Users, X, ShieldBan, ShieldCheck } from "lucide-react";
import PostCard from "./PostCard";
import PostComposer from "./PostComposer";
import PostTimeline from "./PostTimeline";
import UserPersonalFeedTimeline from "./UserPersonalFeedTimeline";

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
  engagement_users: (post.engagementUsers || post.engagement_users || []).map((entry) => ({
    ...entry,
    type: entry.type || entry.engagementType || "engaged",
    engaged_at: entry.engagedAt || entry.engaged_at || null,
    user: entry.user || null,
  })),
  hashtags: post.hashtags || [...new Set((post.content?.match(/#[\p{L}\p{N}_-]+/gu) || []).map((tag) => tag.slice(1)))],
  partials: post.partials || [...new Set((post.content?.match(/%[\p{L}\p{N}_-]+/gu) || []).map((tag) => tag.slice(1)))],
});

const getAgeHours = (createdDate) => {
  const millis = Date.parse(createdDate || "");
  if (Number.isNaN(millis)) return 24;
  return Math.max(0, (Date.now() - millis) / 3_600_000);
};

export default function PostsFeed() {
  const location = useLocation();
  const [posts, setPosts] = useState(() => {
    try {
      const cached = localStorage.getItem("wiseravenshare_cached_posts");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [bookmarkMap, setBookmarkMap] = useState({});
  const [blockedIds, setBlockedIds] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [showComposer, setShowComposer] = useState(true);
  const [view, setView] = useState("feed");
  const [mode, setMode] = useState("following");
  const [tag, setTag] = useState("");
  const [authorFilter, setAuthorFilter] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("author") || "";
    } catch {
      return "";
    }
  });
  const [followingCount, setFollowingCount] = useState(0);
  const [notificationTarget, setNotificationTarget] = useState({ postId: "", commentId: "" });

  // Sync author filter with URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authorParam = params.get("author");
    if (authorParam !== null && authorParam !== authorFilter) {
      setAuthorFilter(authorParam);
    }
  }, [location.search, authorFilter]);

  // Listen for global author filter requests from PostCard or Flock Creators
  useEffect(() => {
    const handleAuthorFilterEvent = (e) => {
      const target = e.detail?.author || "";
      if (target) {
        setAuthorFilter(target);
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("author", target.replace(/^@/, ""));
          window.history.pushState(null, "", url.toString());
        } catch {}
        const anchor = document.getElementById("posts-feed-anchor");
        if (anchor) {
          anchor.scrollIntoView({ behavior: "smooth" });
        }
      }
    };
    window.addEventListener("wr_filter_author", handleAuthorFilterEvent);
    return () => window.removeEventListener("wr_filter_author", handleAuthorFilterEvent);
  }, []);

  // Track optimistically-added posts so they survive server re-fetches.
  const optimisticPostsRef = React.useRef(new Map());

  // Load and listen to follow count
  useEffect(() => {
    apiClient.follows.following().then((res) => {
      if (res?.followingCount !== undefined) setFollowingCount(res.followingCount);
    }).catch(() => {});

    const handleFollows = (e) => {
      if (e.detail?.followingCount !== undefined) setFollowingCount(e.detail.followingCount);
    };
    window.addEventListener("wr_follows_updated", handleFollows);
    return () => window.removeEventListener("wr_follows_updated", handleFollows);
  }, []);

  // Handle URL hash changes (#following, #trending, #feed, #timeline)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === "#trending") {
        setMode("trending");
      } else if (hash === "#following") {
        setMode("following");
      } else if (hash === "#timeline") {
        setView("timeline");
      } else if (hash === "#feed") {
        setView("feed");
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const applyRankedOrder = useCallback((feedItems, rankedPayload) => {
    const items = Array.isArray(feedItems) ? [...feedItems] : [];
    const rankedRows = Array.isArray(rankedPayload?.posts) ? rankedPayload.posts : [];
    if (rankedRows.length === 0 || items.length === 0) {
      return items;
    }

    const byId = new Map(items.map((item) => [String(item?.id || ""), item]));
    const rankedScoreById = new Map(
      rankedRows
        .map((entry) => [String(entry?.post_id || entry?.postId || ""), Number(entry?.resurfacing_score ?? 0)])
        .filter(([id]) => id)
    );

    const ordered = [];
    for (const row of rankedRows) {
      const postId = String(row?.post_id || row?.postId || "");
      if (!postId || !byId.has(postId)) continue;
      const post = byId.get(postId);
      byId.delete(postId);
      ordered.push({
        ...post,
        matrix_rank_score: rankedScoreById.get(postId) ?? null,
        matrix_rank_trigger: row?.trigger || null,
      });
    }

    for (const leftover of byId.values()) {
      ordered.push(leftover);
    }

    return ordered;
  }, []);

  const fetchPosts = useCallback(async ({ preserveExistingOnEmpty = false } = {}) => {
    setLoading(true);
    try {
      let user = null;
      try { user = await apiClient.auth.me(); } catch { /* proceed with non-ranked following feed */ }
      setCurrentUser(user);
      let nextBookmarkMap = {};
      if (user) {
        const bookmarkResult = await apiClient.entities.Bookmark.filter({}, { sort: "-created_date", limit: 200 }).catch(() => ({ items: [] }));
        nextBookmarkMap = (bookmarkResult?.items || []).reduce((acc, bookmark) => {
          const postId = String(bookmark?.post_id || "");
          const id = String(bookmark?.id || "");
          if (postId && id) {
            acc[postId] = id;
          }
          return acc;
        }, {});
        setBookmarkMap(nextBookmarkMap);

        const blocks = await apiClient.social.myBlocks().catch(() => []);
        const blockProfiles = await Promise.all((blocks || []).map(async (block) => {
          try { return { ...(await apiClient.social.getUser(block.userId)), id: String(block.userId) }; }
          catch { return { id: String(block.userId), name: "Unavailable account" }; }
        }));
        setBlockedUsers(blockProfiles);
        setBlockedIds(blockProfiles.map((user) => user.id));
      } else {
        setBookmarkMap({});
        setBlockedUsers([]);
        setBlockedIds([]);
      }
      let feedResult;
      if (mode === "following") {
        let rankedFeed = null;
        if (user?.id) {
          try {
            rankedFeed = await apiClient.posts.rankedFeed(user.id, 40, 30);
          } catch {
            rankedFeed = null;
          }
        }

        feedResult = await apiClient.posts.feed(1, 40);
        let feedItems = Array.isArray(feedResult) ? feedResult : (feedResult?.items || []);
        if (rankedFeed) {
          feedItems = applyRankedOrder(feedItems, rankedFeed);
        }
        if (feedItems.length === 0) {
          if (user?.id) {
            const ownPostsResult = await apiClient.posts.userPosts(user.id, 1, 40).catch(() => []);
            const ownPosts = Array.isArray(ownPostsResult) ? ownPostsResult : (ownPostsResult?.items || []);
            if (ownPosts.length > 0) {
              feedItems = ownPosts;
            }
          }
        }
        if (feedItems.length === 0) {
          feedResult = await apiClient.posts.trending(40);
          feedItems = Array.isArray(feedResult) ? feedResult : (feedResult?.items || []);
        }
        feedResult = feedItems;
      } else {
        feedResult = await apiClient.posts.trending(40);
      }
      const normalized = (Array.isArray(feedResult) ? feedResult : feedResult?.items || []).map((post) => {
        const normalizedPost = normalizePost(post);
        const postId = String(normalizedPost.id || "");
        if (postId && nextBookmarkMap[postId]) {
          normalizedPost._bookmarkId = nextBookmarkMap[postId];
        }
        return normalizedPost;
      });
      // Merge optimistic posts (created this session) that the server hasn't returned yet.
      const optimisticIds = new Set(normalized.map((p) => String(p.id)));
      const survivingOptimistic = Array.from(optimisticPostsRef.current.values())
        .filter((p) => !optimisticIds.has(String(p.id)));
      const merged = [...survivingOptimistic, ...normalized];
      setPosts((current) => {
        const next = (preserveExistingOnEmpty && merged.length === 0 && current.length > 0)
          ? current
          : (merged.length > 0 ? merged : current);
        if (next.length > 0) {
          try {
            localStorage.setItem("wiseravenshare_cached_posts", JSON.stringify(next.slice(0, 50)));
          } catch {}
        }
        return next;
      });
      setShowComposer(true);
      return merged;
    } catch (error) {
      console.error("Could not load social feed", error);
      // Retain existing posts from state or cache
      setPosts((current) => {
        if (current.length > 0) return current;
        try {
          const cached = localStorage.getItem("wiseravenshare_cached_posts");
          return cached ? JSON.parse(cached) : [];
        } catch {
          return [];
        }
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [applyRankedOrder, mode]);

  useEffect(() => {
    fetchPosts();
    const handleRefresh = () => fetchPosts();
    window.addEventListener("wr_refresh_feed", handleRefresh);
    return () => window.removeEventListener("wr_refresh_feed", handleRefresh);
  }, [fetchPosts]);

  const handleAuthRequired = () => apiClient.auth.redirectToLogin(window.location.pathname + window.location.hash);

  const matchesAuthor = (post, filter) => {
    if (!filter) return true;
    const f = String(filter).trim().toLowerCase().replace(/^@/, "");
    const author = post.author || post.user || {};
    const postUserId = String(post.created_by_id || post.userId || "").toLowerCase();
    const authorId = String(author.id || author.userId || "").toLowerCase();
    const username = String(author.username || author.handle || "").toLowerCase().replace(/^@/, "");
    const name = String(author.name || author.display_name || author.displayName || "").toLowerCase();
    return (
      postUserId === f ||
      authorId === f ||
      username === f ||
      name === f ||
      (f.length >= 2 && (name.includes(f) || username.includes(f)))
    );
  };

  const handleAuthorClick = async (authorTarget) => {
    const targetName = authorTarget?.username || authorTarget?.name || authorTarget?.displayName || authorTarget?.display_name || authorTarget?.id || "";
    if (!targetName) return;
    setAuthorFilter(targetName);

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("author", targetName.replace(/^@/, ""));
      window.history.pushState(null, "", url.toString());
    } catch {}

    const anchor = document.getElementById("posts-feed-anchor");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo({ top: 350, behavior: "smooth" });
    }

    const userId = authorTarget?.id || authorTarget?.userId;
    if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      try {
        const res = await apiClient.posts.userPosts(userId, 1, 50);
        const userItems = Array.isArray(res) ? res : (res?.items || []);
        if (userItems.length > 0) {
          const normalizedUserPosts = userItems.map(normalizePost);
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => String(p.id)));
            const newPosts = normalizedUserPosts.filter((p) => !existingIds.has(String(p.id)));
            return [...newPosts, ...prev];
          });
        }
      } catch {}
    }
  };

  const visiblePosts = posts
    .filter((post) => !blockedIds.includes(String(post.created_by_id)))
    .filter((post) => matchesAuthor(post, authorFilter))
    .filter((post) => !tag || (tag.startsWith("%")
      ? post.partials?.some((value) => `%${String(value).toLowerCase()}` === tag.toLowerCase())
      : post.hashtags?.some((value) => String(value).replace(/^#/, "").toLowerCase() === tag.toLowerCase())));
  const { trendingTopics, trendingItems, rankedPosts } = useMemo(() => {
    const counts = {};
    visiblePosts.forEach((post) => {
      (post.hashtags || []).forEach((hashtag) => {
        const key = `#${String(hashtag).replace(/^#/, "").toLowerCase()}`;
        counts[key] = (counts[key] || 0) + 1;
      });
      (post.partials || []).forEach((partial) => {
        const key = `%${String(partial).replace(/^%/, "").toLowerCase()}`;
        counts[key] = (counts[key] || 0) + 1;
      });
    });

    const topics = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const scored = visiblePosts.map((post) => {
      const likes = Number(post.like_count || 0);
      const reposts = Number(post.repost_count || 0);
      const comments = Number(post.comment_count || 0);
      const shares = Number(post.share_count || 0);
      const views = Number(post.viewsCount || post.views_count || 0);
      const ageHours = getAgeHours(post.created_date);
      const freshness = Math.exp(-ageHours / 48);
      const truthScore = Number(post.truthScore ?? post.truth_score ?? 50);

      const tagMomentum = [
        ...(post.hashtags || []).map((value) => `#${String(value).replace(/^#/, "").toLowerCase()}`),
        ...(post.partials || []).map((value) => `%${String(value).replace(/^%/, "").toLowerCase()}`),
      ].reduce((sum, key) => sum + Number(counts[key] || 0), 0);

      const relevanceScore =
        likes * 2.5 +
        reposts * 3.5 +
        comments * 2.2 +
        shares * 2.0 +
        views * 0.04 +
        tagMomentum * 1.6 +
        freshness * 12 +
        (truthScore / 100) * 6;

      return { ...post, relevanceScore: Number(relevanceScore.toFixed(2)) };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      trendingTopics: topics,
      trendingItems: scored.slice(0, 6),
      rankedPosts: scored,
    };
  }, [visiblePosts]);
  const displayedPosts = mode === "trending" ? rankedPosts : visiblePosts;
  const displayedPostsWithBookmarks = displayedPosts.map((post) => {
    const postId = String(post.id || "");
    return { ...post, _bookmarkId: bookmarkMap[postId] || post._bookmarkId || null };
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const targetPostId = params.get("post") || "";
    const targetCommentId = params.get("comment") || "";
    setNotificationTarget({ postId: targetPostId, commentId: targetCommentId });
  }, [location.search]);

  useEffect(() => {
    if (!notificationTarget.postId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`post-${notificationTarget.postId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "bg-primary/5");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "bg-primary/5");
        }, 3000);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [posts, notificationTarget.postId]);
  const removeBlockedUser = async (userId) => {
    const blocked = String(userId);
    setBlockedIds((current) => [...new Set([...current, blocked])]);
    setPosts((current) => current.filter((post) => String(post.created_by_id) !== blocked));
    let profile;
    try { profile = await apiClient.social.getUser(blocked); }
    catch { profile = { name: "Unavailable account" }; }
    setBlockedUsers((current) => [...current.filter((user) => user.id !== blocked), { ...profile, id: blocked }]);
  };
  const unblockUser = async (userId) => {
    try {
      await apiClient.social.unblockUser(userId);
      setBlockedUsers((current) => current.filter((user) => user.id !== String(userId)));
      setBlockedIds((current) => current.filter((id) => id !== String(userId)));
      await fetchPosts();
    } catch (error) { console.error("Could not unblock user", error); }
  };
  const openTag = (value) => { setTag(value.startsWith("%") ? value : value.replace(/^#/, "")); setMode("trending"); };
  const handleBookmarkChange = (postId, nextState) => {
    const key = String(postId || "");
    if (!key) return;
    setBookmarkMap((current) => {
      const next = { ...current };
      if (nextState?.bookmarked && nextState?.bookmarkId) next[key] = String(nextState.bookmarkId);
      else delete next[key];
      return next;
    });
    setPosts((current) => current.map((post) => {
      if (String(post.id) !== key) return post;
      return { ...post, _bookmarkId: nextState?.bookmarked ? (nextState.bookmarkId || post._bookmarkId || null) : null };
    }));
  };
  const handlePosted = async (createdPost) => {
    if (createdPost) {
      const normalizedCreatedPost = normalizePost(createdPost);
      // Register in optimistic store so it survives server re-fetches.
      optimisticPostsRef.current.set(String(normalizedCreatedPost.id), normalizedCreatedPost);
      setPosts((current) => {
        const next = [normalizedCreatedPost, ...current.filter((post) => post.id !== normalizedCreatedPost.id)];
        try {
          localStorage.setItem("wiseravenshare_cached_posts", JSON.stringify(next.slice(0, 50)));
        } catch {}
        return next;
      });
      setView("feed");
      // Only switch mode if not already in "following" — avoids rebuilding fetchPosts and
      // firing the useEffect a second time while the explicit fetch below is in flight.
      if (mode !== "following") setMode("following");
      await fetchPosts({ preserveExistingOnEmpty: true });
      return;
    }
    await fetchPosts();
  };

  if (loading && posts.length === 0) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div id="posts-feed-anchor" className="scroll-mt-24" />
      {authorFilter && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3.5 backdrop-blur-sm shadow-xs animate-in fade-in duration-300">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center font-bold text-primary text-sm shrink-0">
              {authorFilter.replace(/^@/, "").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Filtered User Feed</p>
              <p className="text-sm font-semibold text-foreground">
                Viewing posts by <span className="text-primary font-bold">@{authorFilter.replace(/^@/, "")}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setAuthorFilter("");
              try {
                const params = new URLSearchParams(window.location.search);
                params.delete("author");
                const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
                window.history.pushState(null, "", newUrl);
              } catch {}
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-background/80 hover:bg-background border border-border text-foreground transition-all shadow-xs cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Show all posts
          </button>
        </div>
      )}
      {showComposer && <PostComposer compact onPosted={handlePosted} />}
      {currentUser && blockedUsers.length > 0 && <details className="rounded-lg border border-border bg-card/50 p-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground"><ShieldBan className="h-4 w-4" /> Blocked accounts ({blockedUsers.length})</summary><div className="mt-3 space-y-2">{blockedUsers.map((user) => <div key={user.id} className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2"><span className="truncate text-sm">{user.name || user.handle || user.id}</span><button onClick={() => unblockUser(user.id)} className="flex items-center gap-1 text-xs text-primary hover:underline"><ShieldCheck className="h-3.5 w-3.5" /> Unblock</button></div>)}</div></details>}
      {trendingTopics.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2"><span className="mr-1 text-xs font-medium text-muted-foreground">Trending topics</span>{trendingTopics.map(([topic, count]) => <button key={topic} onClick={() => openTag(topic.startsWith("#") ? topic.slice(1) : topic)} className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">{topic}<span className="ml-1 opacity-60">{count}</span></button>)}</div>}
      {trendingItems.length > 0 && (
        <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <TrendingUp className="h-3.5 w-3.5" /> Trending items by relevance
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {trendingItems.map((item) => (
              <div key={item.id} className="rounded-md border border-border/70 bg-background/60 px-3 py-2">
                <p className="text-sm text-foreground line-clamp-2">{item.content || "Untitled post"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Score {item.relevanceScore} · {item.like_count || 0} likes · {item.repost_count || 0} reposts · {item.comment_count || 0} comments
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card/50 p-1">
          <button onClick={() => { setTag(""); setMode("following"); }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${mode === "following" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <Users className="h-3.5 w-3.5" /> Following{followingCount > 0 ? ` (${followingCount})` : ""}
          </button>
          <button onClick={() => { setTag(""); setMode("trending"); }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${mode === "trending" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><TrendingUp className="h-3.5 w-3.5" /> Trending</button>
          <button onClick={() => setView("feed")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${view === "feed" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><LayoutGrid className="h-3.5 w-3.5" /> Feed</button>
          <button onClick={() => setView("timeline")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${view === "timeline" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><Clock className="h-3.5 w-3.5" /> Timeline</button>
        </div>
        {tag && <button onClick={() => setTag("")} className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">{tag.startsWith("%") ? tag : `#${tag}`}<X className="h-3 w-3" /></button>}
      </div>
      {displayedPosts.length === 0 ? (
        <div className="py-12 text-center">
          <Feather className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {authorFilter
              ? `No posts found from @${authorFilter.replace(/^@/, "")} yet.`
              : tag
              ? `No posts found for ${tag.startsWith("%") ? tag : `#${tag}`}.`
              : "No posts in this feed yet. Be the first to share."}
          </p>
          {authorFilter && (
            <button
              onClick={() => {
                setAuthorFilter("");
                try {
                  const params = new URLSearchParams(window.location.search);
                  params.delete("author");
                  const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
                  window.history.pushState(null, "", newUrl);
                } catch {}
              }}
              className="mt-3 text-xs text-primary hover:underline font-medium cursor-pointer"
            >
              Clear filter and view all posts
            </button>
          )}
        </div>
      ) : view === "timeline" ? (
        <PostTimeline
          posts={displayedPostsWithBookmarks}
          currentUser={currentUser}
          blockedIds={blockedIds}
          onHashtagClick={openTag}
          onBlocked={removeBlockedUser}
          onBookmarkChange={handleBookmarkChange}
          onAuthRequired={handleAuthRequired}
          onAuthorClick={handleAuthorClick}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {displayedPostsWithBookmarks.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={currentUser}
              blockedIds={blockedIds}
              autoOpenComments={Boolean(notificationTarget.postId) && String(notificationTarget.postId) === String(post.id)}
              targetCommentId={String(notificationTarget.postId) === String(post.id) ? notificationTarget.commentId : ""}
              onHashtagClick={openTag}
              onBlocked={removeBlockedUser}
              onAuthRequired={handleAuthRequired}
              onBookmarkChange={handleBookmarkChange}
              onAuthorClick={handleAuthorClick}
            />
          ))}
        </div>
      )}

      {/* Extended Main Feed Page: Dedicated Personal Feed & Timeline */}
      <UserPersonalFeedTimeline
        currentUser={currentUser}
        allPosts={posts}
        onAuthRequired={handleAuthRequired}
        onHashtagClick={openTag}
        onAuthorClick={handleAuthorClick}
        blockedIds={blockedIds}
      />

      {/* Bottom Feed Navigation & Namesake Links */}
      <div className="mt-8 pt-6 border-t border-border/60 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Feed Views:</span>
          <a
            href="#following"
            onClick={(e) => {
              e.preventDefault();
              setTag("");
              setMode("following");
              window.location.hash = "following";
              window.scrollTo({ top: 300, behavior: "smooth" });
            }}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              mode === "following" ? "bg-primary/15 text-primary font-medium border border-primary/30" : "hover:text-foreground border border-border"
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Following{followingCount > 0 ? ` (${followingCount})` : ""}
          </a>
          <a
            href="#trending"
            onClick={(e) => {
              e.preventDefault();
              setTag("");
              setMode("trending");
              window.location.hash = "trending";
              window.scrollTo({ top: 300, behavior: "smooth" });
            }}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              mode === "trending" ? "bg-primary/15 text-primary font-medium border border-primary/30" : "hover:text-foreground border border-border"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Trending
          </a>
          <a
            href="#feed"
            onClick={(e) => {
              e.preventDefault();
              setView("feed");
              window.location.hash = "feed";
              window.scrollTo({ top: 300, behavior: "smooth" });
            }}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              view === "feed" ? "bg-primary/15 text-primary font-medium border border-primary/30" : "hover:text-foreground border border-border"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Feed
          </a>
          <a
            href="#timeline"
            onClick={(e) => {
              e.preventDefault();
              setView("timeline");
              window.location.hash = "timeline";
              window.scrollTo({ top: 300, behavior: "smooth" });
            }}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              view === "timeline" ? "bg-primary/15 text-primary font-medium border border-primary/30" : "hover:text-foreground border border-border"
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Timeline
          </a>
          <a
            href="#personal-timeline"
            onClick={(e) => {
              e.preventDefault();
              const section = document.getElementById("personal-feed-timeline-section");
              if (section) section.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 hover:text-foreground border border-border"
          >
            <Users className="w-3.5 h-3.5 text-primary" /> Personal Timeline
          </a>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="hover:text-primary transition-colors flex items-center gap-1 font-medium"
          >
            ↑ Back to Top
          </a>
        </div>
      </div>
    </div>
  );
}
