import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Heart, MessageCircle, Repeat2, RefreshCw, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

function MiniPostCard({ post, currentUser, onLike }) {
  const [liked, setLiked] = useState(Boolean(post.isLiked ?? post.is_liked));
  const [likeCount, setLikeCount] = useState(post.likesCount ?? post.like_count ?? 0);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const author = post.user || post.author || {};
  const name = author.display_name || author.displayName || author.username || "Creator";
  const avatar = author.avatar_uri || author.avatarUrl;
  const tag = post._feedTag; // "following" | "liked_author" | "repost"

  const handleLike = async () => {
    if (!currentUser) return;
    if (busy) return;
    setBusy(true);
    try {
      const state = liked
        ? await apiClient.posts.unlike(post.id)
        : await apiClient.posts.like(post.id);
      const nextLiked = Boolean(state?.isLiked ?? state?.is_liked ?? !liked);
      const nextCount = Number(state?.likesCount ?? state?.likes_count ?? likeCount + (liked ? -1 : 1));
      setLiked(nextLiked);
      setLikeCount(Math.max(0, nextCount));
      onLike?.();
    } catch (e) {
      toast({ title: "Could not update like", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
          {avatar
            ? <Image src={avatar} alt={name} fittingType="fill" className="w-full h-full" />
            : <span className="text-xs font-heading text-primary">{name[0]?.toUpperCase()}</span>}
        </div>
        <span className="text-xs font-medium text-foreground truncate flex-1">{name}</span>
        {tag === "repost" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 flex items-center gap-1">
            <Repeat2 className="w-2.5 h-2.5" /> Repost
          </span>
        )}
        {tag === "liked_author" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0 flex items-center gap-1">
            <Heart className="w-2.5 h-2.5" /> You liked
          </span>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0">
          {timeAgo(post.createdAt || post.created_date)}
        </span>
      </div>
      <p className="text-sm text-foreground leading-relaxed line-clamp-3">
        {post.content || "(media post)"}
      </p>
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={handleLike}
          disabled={busy || !currentUser}
          className="flex items-center gap-1 text-xs transition-colors disabled:opacity-40"
        >
          <Heart className={`w-3.5 h-3.5 ${liked ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-400"}`} />
          <span className={liked ? "text-red-500" : "text-muted-foreground"}>{likeCount}</span>
        </button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MessageCircle className="w-3.5 h-3.5" />
          {post.commentsCount ?? post.comment_count ?? 0}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Repeat2 className="w-3.5 h-3.5" />
          {post.repostsCount ?? post.repost_count ?? 0}
        </span>
      </div>
    </div>
  );
}

export default function FollowingFeed({ onPostLiked }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 10;

  const load = useCallback(async (p = 1, append = false) => {
    setLoading(true);
    try {
      let user = currentUser;
      if (!user) {
        try { user = await apiClient.auth.me(); } catch { /* anonymous */ }
        setCurrentUser(user);
      }

      // Primary feed: following
      const feedResult = await apiClient.posts.feed(p, PAGE_SIZE);
      const rawItems = Array.isArray(feedResult) ? feedResult : (feedResult?.items || []);

      // Tag entries: reposts get "repost", items from liked-post authors get "liked_author"
      let likedAuthorIds = new Set();
      if (user?.id) {
        try {
          // Grab recent liked posts to extract author IDs
          const likedBookmarks = await apiClient.entities.Bookmark.filter(
            {}, { sort: "-created_date", limit: 50 }
          ).catch(() => ({ items: [] }));
          // Fallback: use recent feed to infer liked authors from is_liked posts
          const likedInFeed = rawItems.filter((p) => p.isLiked || p.is_liked);
          likedInFeed.forEach((p) => {
            const uid = p.userId || p.created_by_id;
            if (uid) likedAuthorIds.add(String(uid));
          });
        } catch { /* ignore */ }
      }

      const tagged = rawItems.map((post) => {
        let tag = "following";
        if (post.isRepost || post.is_repost || post.repostOf) tag = "repost";
        else {
          const uid = post.userId || post.created_by_id;
          if (uid && likedAuthorIds.has(String(uid))) tag = "liked_author";
        }
        return { ...post, _feedTag: tag };
      });

      setHasMore(tagged.length >= PAGE_SIZE);
      setPosts((prev) => append ? [...prev, ...tagged] : tagged);
      setPage(p);
    } catch (e) {
      console.error("FollowingFeed load error", e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(1); }, [load]);

  const handleLikeUpdate = () => { onPostLiked?.(); };

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="font-heading text-sm text-foreground tracking-wide">Your Network's Latest</h2>
        </div>
        <button
          type="button"
          onClick={() => load(1)}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && posts.length === 0 ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Follow some creators to see their posts here.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {posts.map((post) => (
              <MiniPostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                onLike={handleLikeUpdate}
              />
            ))}
          </div>

          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={loading}
              onClick={() => load(page + 1, true)}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
