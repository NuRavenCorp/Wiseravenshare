import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Feather, LayoutGrid, Clock, TrendingUp, Users, X, ShieldBan, ShieldCheck } from "lucide-react";
import PostCard from "./PostCard";
import PostComposer from "./PostComposer";
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

export default function PostsFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [blockedIds, setBlockedIds] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [showComposer, setShowComposer] = useState(false);
  const [view, setView] = useState("feed");
  const [mode, setMode] = useState("following");
  const [tag, setTag] = useState("");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const authenticated = await apiClient.auth.isAuthenticated();
      let user = null;
      if (authenticated) {
        try { user = await apiClient.auth.me(); } catch { /* use public trending feed */ }
      }
      setCurrentUser(user);
      if (user) {
        const blocks = await apiClient.social.myBlocks().catch(() => []);
        const blockProfiles = await Promise.all((blocks || []).map(async (block) => {
          try { return { ...(await apiClient.social.getUser(block.userId)), id: String(block.userId) }; }
          catch { return { id: String(block.userId), name: "Unavailable account" }; }
        }));
        setBlockedUsers(blockProfiles);
        setBlockedIds(blockProfiles.map((user) => user.id));
      } else {
        setBlockedUsers([]);
        setBlockedIds([]);
      }
      const result = mode === "following" && user
        ? await apiClient.posts.feed(1, 40)
        : await apiClient.posts.trending(40);
      const normalized = (Array.isArray(result) ? result : result?.items || []).map(normalizePost);
      setPosts(normalized);
      setShowComposer(Boolean(user));
    } catch (error) {
      console.error("Could not load social feed", error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleAuthRequired = () => apiClient.auth.redirectToLogin(window.location.pathname + window.location.hash);
  const visiblePosts = posts.filter((post) => !blockedIds.includes(String(post.created_by_id))).filter((post) => !tag || (tag.startsWith("%")
    ? post.content?.toLowerCase().includes(tag.toLowerCase())
    : post.hashtags?.some((value) => String(value).replace(/^#/, "").toLowerCase() === tag.toLowerCase())));
  const trendingTopics = Object.entries(posts.reduce((counts, post) => {
    (post.hashtags || []).forEach((hashtag) => {
      const key = `#${String(hashtag).replace(/^#/, "").toLowerCase()}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    (post.content?.match(/%[\p{L}\p{N}_-]+/gu) || []).forEach((partial) => {
      const key = partial.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      {showComposer && <PostComposer compact onPosted={fetchPosts} />}
      {currentUser && blockedUsers.length > 0 && <details className="rounded-lg border border-border bg-card/50 p-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground"><ShieldBan className="h-4 w-4" /> Blocked accounts ({blockedUsers.length})</summary><div className="mt-3 space-y-2">{blockedUsers.map((user) => <div key={user.id} className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2"><span className="truncate text-sm">{user.name || user.handle || user.id}</span><button onClick={() => unblockUser(user.id)} className="flex items-center gap-1 text-xs text-primary hover:underline"><ShieldCheck className="h-3.5 w-3.5" /> Unblock</button></div>)}</div></details>}
      {trendingTopics.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2"><span className="mr-1 text-xs font-medium text-muted-foreground">Trending topics</span>{trendingTopics.map(([topic, count]) => <button key={topic} onClick={() => openTag(topic.startsWith("#") ? topic.slice(1) : topic)} className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">{topic}<span className="ml-1 opacity-60">{count}</span></button>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card/50 p-1">
          <button onClick={() => { setTag(""); setMode("following"); }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${mode === "following" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><Users className="h-3.5 w-3.5" /> Following</button>
          <button onClick={() => { setTag(""); setMode("trending"); }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${mode === "trending" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><TrendingUp className="h-3.5 w-3.5" /> Trending</button>
          <button onClick={() => setView("feed")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${view === "feed" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><LayoutGrid className="h-3.5 w-3.5" /> Feed</button>
          <button onClick={() => setView("timeline")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${view === "timeline" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><Clock className="h-3.5 w-3.5" /> Timeline</button>
        </div>
        {tag && <button onClick={() => setTag("")} className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">{tag.startsWith("%") ? tag : `#${tag}`}<X className="h-3 w-3" /></button>}
      </div>
      {visiblePosts.length === 0 ? (
        <div className="py-12 text-center"><Feather className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">{tag ? `No posts found for ${tag.startsWith("%") ? tag : `#${tag}`}.` : "No posts in this feed yet. Be the first to share."}</p></div>
      ) : view === "timeline" ? (
        <PostTimeline posts={visiblePosts} currentUser={currentUser} blockedIds={blockedIds} onHashtagClick={openTag} onBlocked={removeBlockedUser} onAuthRequired={handleAuthRequired} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {visiblePosts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} blockedIds={blockedIds} onHashtagClick={openTag} onBlocked={removeBlockedUser} onAuthRequired={handleAuthRequired} />)}
        </div>
      )}
    </div>
  );
}
