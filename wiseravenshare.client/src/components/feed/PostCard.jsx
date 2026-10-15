import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { Heart, MessageCircle, MoreVertical, UserPlus, UserMinus, ShieldBan, Repeat2, Share2 } from "lucide-react";
import { Image } from "@/components/ui/image";
import PostComments from "./PostComments";
import ShareMenu from "./ShareMenu";

const TRUTH_STYLES = {
  verified: { label: "Verified", class: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  unverified: { label: "Unverified", class: "text-muted-foreground bg-muted/30 border-border" },
  flagged: { label: "Flagged", class: "text-red-400 bg-red-500/10 border-red-500/30" },
  challenged: { label: "Challenged", class: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
};

export default function PostCard({ post, currentUser, onAuthRequired }) {
  const [author, setAuthor] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repost_count || 0);
  const [shareCount, setShareCount] = useState(post.share_count || 0);
  const [shared, setShared] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const menuRef = useRef(null);

  const isOwn = currentUser?.id === post.created_by_id;
  const truthStyle = TRUTH_STYLES[post.truth_status] || TRUTH_STYLES.unverified;

  useEffect(() => {
    let mounted = true;
    apiClient.entities.UserProfile.filter({ created_by_id: post.created_by_id }, { limit: 1 })
      .then((res) => { if (mounted) setAuthor((res.items || [])[0] || null); })
      .catch(() => {});
    if (currentUser) {
      apiClient.entities.Like.filter({ target_id: post.id, target_type: "post", created_by_id: currentUser.id }, { limit: 1 })
        .then((res) => { if (mounted) setLiked((res.items || []).length > 0); })
        .catch(() => {});
      apiClient.entities.Follow.filter({ followee_id: post.created_by_id, created_by_id: currentUser.id }, { limit: 1 })
        .then((res) => { if (mounted) setFollowing((res.items || []).length > 0); })
        .catch(() => {});
      apiClient.entities.Block.filter({ blocked_id: post.created_by_id, created_by_id: currentUser.id }, { limit: 1 })
        .then((res) => { if (mounted) setBlocked((res.items || []).length > 0); })
        .catch(() => {});
      apiClient.entities.Post.filter({ external_source: post.id, created_by_id: currentUser.id }, { limit: 1 })
        .then((res) => { if (mounted) setReposted((res.items || []).length > 0); })
        .catch(() => {});
    }
    return () => { mounted = false; };
  }, [post.id, post.created_by_id, currentUser?.id]);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLike = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      if (liked) {
        const res = await apiClient.entities.Like.filter({ target_id: post.id, target_type: "post", created_by_id: currentUser.id }, { limit: 1 });
        const existing = (res.items || [])[0];
        if (existing) await apiClient.entities.Like.delete(existing.id);
        setLiked(false);
        const n = Math.max(0, likeCount - 1);
        setLikeCount(n);
        await apiClient.entities.Post.update(post.id, { like_count: n });
      } else {
        await apiClient.entities.Like.create({ target_id: post.id, target_type: "post" });
        setLiked(true);
        const n = likeCount + 1;
        setLikeCount(n);
        await apiClient.entities.Post.update(post.id, { like_count: n });
      }
    } catch (e) { console.error("Like error:", e); } finally { setBusy(false); }
  };

  const handleFollow = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      if (following) {
        const res = await apiClient.entities.Follow.filter({ followee_id: post.created_by_id, created_by_id: currentUser.id }, { limit: 1 });
        const existing = (res.items || [])[0];
        if (existing) await apiClient.entities.Follow.delete(existing.id);
        setFollowing(false);
      } else {
        await apiClient.entities.Follow.create({ followee_id: post.created_by_id });
        setFollowing(true);
      }
      setMenuOpen(false);
    } catch (e) { console.error("Follow error:", e); } finally { setBusy(false); }
  };

  const handleBlock = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (blocked || busy) return;
    setBusy(true);
    try {
      await apiClient.entities.Block.create({ blocked_id: post.created_by_id, reason: "Blocked from post feed" });
      setBlocked(true);
      setMenuOpen(false);
    } catch (e) { console.error("Block error:", e); } finally { setBusy(false); }
  };

  const authorName = author?.display_name || "Creator";
  const timeAgo = new Date(post.created_date).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const handleRepost = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      if (reposted) {
        const res = await apiClient.entities.Post.filter({ external_source: post.id, created_by_id: currentUser.id }, { limit: 1 });
        const existing = (res.items || [])[0];
        if (existing) await apiClient.entities.Post.delete(existing.id);
        setReposted(false);
        const n = Math.max(0, repostCount - 1);
        setRepostCount(n);
        await apiClient.entities.Post.update(post.id, { repost_count: n });
      } else {
        await apiClient.entities.Post.create({
          content: post.content,
          media_uris: post.media_uris || [],
          hashtags: post.hashtags || [],
          post_type: post.post_type || "text",
          external_source: post.id,
          status: "published",
        });
        setReposted(true);
        const n = repostCount + 1;
        setRepostCount(n);
        await apiClient.entities.Post.update(post.id, { repost_count: n });
      }
    } catch (e) { console.error("Repost error:", e); } finally { setBusy(false); }
  };

  const shareUrl = `${window.location.origin}/social?post=${post.id}`;
  const shareText = post.content?.slice(0, 120) || authorName;

  const recordShare = async () => {
    const n = shareCount + 1;
    setShareCount(n);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
    try { await apiClient.entities.Post.update(post.id, { share_count: n }); } catch (e) { /* ignore */ }
  };

  return (
    <article className="rounded-2xl border border-border bg-background/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center overflow-hidden shrink-0">
            {author?.avatar_uri ? (
              <Image src={author.avatar_uri} alt={authorName} fittingType="fill" className="w-full h-full" />
            ) : (
              <span className="font-heading text-lg text-primary">{authorName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{authorName}</p>
            <p className="text-xs text-muted-foreground">{timeAgo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${truthStyle.class}`}>{truthStyle.label}</span>
          {!isOwn && currentUser && (
            <button
              onClick={handleFollow}
              disabled={busy}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                following ? "border-border text-muted-foreground hover:text-foreground" : "border-primary/40 text-primary hover:bg-primary/10"
              }`}
            >
              {following ? <UserMinus className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
              {following ? "Following" : "Follow"}
            </button>
          )}
          {!isOwn && (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((o) => !o)} className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground">
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-popover shadow-lg z-20 py-1">
                  {currentUser && (
                    <button onClick={handleFollow} disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary flex items-center gap-2 text-foreground disabled:opacity-50">
                      {following ? <UserMinus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                      {following ? "Unfollow" : "Follow"}
                    </button>
                  )}
                  <button onClick={handleBlock} disabled={busy || blocked} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary flex items-center gap-2 text-destructive disabled:opacity-50">
                    <ShieldBan className="w-4 h-4" />
                    {blocked ? "User Blocked" : "Block User"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-3">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>
        {post.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {post.hashtags.map((tag, i) => (
              <span key={i} className="text-xs text-primary">#{tag}</span>
            ))}
          </div>
        )}
      </div>

      {post.media_uris?.length > 0 && (
        <div className="px-4 pb-3">
          <Image src={post.media_uris[0]} alt="Post media" fittingType="fill" className="w-full rounded-xl max-h-80" />
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-3 border-t border-border">
        <button onClick={handleLike} disabled={busy} className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50">
          <Heart className={`w-4 h-4 transition-all ${liked ? "fill-red-500 text-red-500 scale-110" : "text-muted-foreground hover:text-red-500"}`} />
          <span className={liked ? "text-red-500" : "text-muted-foreground"}>{likeCount}</span>
        </button>
        <button onClick={handleRepost} disabled={busy} className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50">
          <Repeat2 className={`w-4 h-4 transition-all ${reposted ? "text-emerald-400 scale-110" : "text-muted-foreground hover:text-emerald-400"}`} />
          <span className={reposted ? "text-emerald-400" : "text-muted-foreground"}>{repostCount}</span>
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <MessageCircle className="w-4 h-4" />
          <span>{post.comment_count || 0}</span>
        </button>
        <div className="relative ml-auto">
          <button onClick={() => setShareOpen((o) => !o)} disabled={busy} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
            <Share2 className={`w-4 h-4 transition-all ${shared ? "text-primary scale-110" : ""}`} />
            <span>{shareCount > 0 ? shareCount : shared ? "Shared!" : "Share"}</span>
          </button>
          <ShareMenu
            open={shareOpen}
            url={shareUrl}
            text={shareText}
            onClose={() => setShareOpen(false)}
            onShare={recordShare}
          />
        </div>
      </div>

      {showComments && (
        <PostComments postId={post.id} commentCount={post.comment_count} currentUser={currentUser} onAuthRequired={onAuthRequired} />
      )}
    </article>
  );
}