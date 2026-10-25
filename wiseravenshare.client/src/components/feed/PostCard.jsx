import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { Heart, MessageCircle, MoreVertical, UserPlus, UserMinus, ShieldBan, Repeat2, Share2, Music, Trash2 } from "lucide-react";
import { Image } from "@/components/ui/image";
import PostComments from "./PostComments";
import ShareMenu from "./ShareMenu";
import { useToast } from "@/components/ui/use-toast";
import { useMediaExperience } from "@/components/media/MediaExperience";

const TRUTH_STYLES = {
  verified: { label: "Verified", class: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  unverified: { label: "Unverified", class: "text-muted-foreground bg-muted/30 border-border" },
  flagged: { label: "Flagged", class: "text-red-400 bg-red-500/10 border-red-500/30" },
  challenged: { label: "Challenged", class: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
};
const EMPTY_BLOCKED_IDS = Object.freeze([]);

export default function PostCard({ post, currentUser, onAuthRequired, onHashtagClick, onBlocked, blockedIds = EMPTY_BLOCKED_IDS }) {
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
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [shareCount, setShareCount] = useState(post.share_count || 0);
  const [shared, setShared] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const menuRef = useRef(null);
  const { toast } = useToast();
  const { openMedia } = useMediaExperience();

  const isOwn = String(currentUser?.id || "") === String(post.created_by_id || "");
  const truthStyle = TRUTH_STYLES[post.truth_status] || TRUTH_STYLES.unverified;

  useEffect(() => {
    let mounted = true;
    setAuthor(post.author || post.user || null);
    setLiked(Boolean(post.is_liked));
    setLikeCount(post.like_count || 0);
    setReposted(Boolean(post.is_reposted));
    setRepostCount(post.repost_count || 0);
    setCommentCount(post.comment_count || 0);
    if (currentUser) {
      apiClient.social.followStatus(post.created_by_id)
        .then((res) => { if (mounted) setFollowing(Boolean(res.isFollowing)); }).catch(() => {});
      setBlocked(blockedIds.includes(String(post.created_by_id)));
    }
    return () => { mounted = false; };
  }, [post.id, post.created_by_id, currentUser?.id, blockedIds]);

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
      const state = liked ? await apiClient.posts.unlike(post.id) : await apiClient.posts.like(post.id);
      setLiked(Boolean(state.isLiked));
      setLikeCount(Number(state.likesCount ?? likeCount + (liked ? -1 : 1)));
    } catch (e) { toast({ title: "Could not update like", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };

  const handleFollow = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiClient.social.toggleFollow(post.created_by_id);
      setFollowing(Boolean(result.nowFollowing));
      setMenuOpen(false);
    } catch (e) { toast({ title: "Could not update follow", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };

  const handleBlock = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      if (blocked) await apiClient.social.unblockUser(post.created_by_id);
      else await apiClient.social.blockUser(post.created_by_id);
      setBlocked(!blocked);
      setMenuOpen(false);
      if (!blocked) onBlocked?.(post.created_by_id);
    } catch (e) { toast({ title: "Could not update block", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };

  const handleNotInterested = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      await apiClient.posts.notInterested(post.id);
      setDismissed(true);
      setMenuOpen(false);
      toast({ title: "Got it", description: "We'll show fewer posts like this." });
    } catch (e) {
      toast({ title: "Could not update feed preference", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleHideAuthor = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      await apiClient.posts.hideAuthor(post.id);
      setDismissed(true);
      setMenuOpen(false);
      toast({ title: "Author hidden", description: "You’ll stop seeing this author in your feed." });
    } catch (e) {
      toast({ title: "Could not hide author", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePost = async () => {
    if (!currentUser || !isOwn) return onAuthRequired?.();
    if (busy) return;
    const approved = typeof window === "undefined" ? true : window.confirm("Delete this post permanently?");
    if (!approved) return;
    setBusy(true);
    try {
      await apiClient.posts.delete(post.id);
      setDismissed(true);
      setMenuOpen(false);
      toast({ title: "Post deleted" });
    } catch (e) {
      toast({ title: "Could not delete post", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const authorName = author?.display_name || author?.displayName || author?.username || "Creator";
  const timeAgo = new Date(post.created_date || Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const handleRepost = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      const state = reposted ? await apiClient.posts.unrepost(post.id) : await apiClient.posts.repost(post.id);
      setReposted(Boolean(state.isReposted));
      setRepostCount(Number(state.repostsCount ?? repostCount + (reposted ? -1 : 1)));
    } catch (e) { toast({ title: "Could not update repost", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };

  const shareUrl = `${window.location.origin}/social?post=${post.id}`;
  const shareText = post.content?.slice(0, 120) || authorName;

  const recordShare = async () => {
    const n = shareCount + 1;
    setShareCount(n);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
    try {
      const state = await apiClient.posts.share(post.id);
      setShareCount(Number(state.sharesCount ?? n));
    } catch { setShareCount((count) => Math.max(0, count - 1)); }
  };

  const hashtagList = post.hashtags?.length ? post.hashtags : [...new Set((post.content?.match(/#[\p{L}\p{N}_-]+/gu) || []).map((value) => value.slice(1)))];
  const partialList = [...new Set((post.content?.match(/%[\p{L}\p{N}_-]+/gu) || []).map((value) => value.slice(1)))];
  const engagementUsers = Array.isArray(post.engagement_users) ? post.engagement_users : [];
  const engagementSummary = engagementUsers.slice(0, 4).map((entry) => {
    const engagementUser = entry?.user || {};
    const name = engagementUser.display_name || engagementUser.displayName || engagementUser.username || "Someone";
    const type = String(entry?.type || "engaged").toLowerCase();
    const verb = type === "comment" ? "commented" : type === "repost" ? "reposted" : "liked";
    return `${name} ${verb}`;
  });

  if (dismissed) {
    return null;
  }

  return (
    <article className="rounded-2xl border border-border bg-background/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center overflow-hidden shrink-0">
            {(author?.avatar_uri || author?.avatarUrl) ? (
              <Image src={author.avatar_uri || author.avatarUrl} alt={authorName} fittingType="fill" className="w-full h-full" />
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
          {!isOwn && currentUser && (
            <button
              onClick={handleBlock}
              disabled={busy}
              aria-label={blocked ? "Unblock User" : "Block User"}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                blocked ? "border-border text-muted-foreground hover:text-foreground" : "border-destructive/40 text-destructive hover:bg-destructive/10"
              }`}
            >
              <ShieldBan className="w-3 h-3" />
              {blocked ? "Unblock User" : "Block User"}
            </button>
          )}
          {currentUser && (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((o) => !o)} className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground">
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-popover shadow-lg z-20 py-1">
                  {!isOwn && (
                    <button onClick={handleFollow} disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary flex items-center gap-2 text-foreground disabled:opacity-50">
                      {following ? <UserMinus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                      {following ? "Unfollow" : "Follow"}
                    </button>
                  )}
                  {!isOwn && (
                    <button onClick={handleBlock} disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary flex items-center gap-2 text-destructive disabled:opacity-50">
                      <ShieldBan className="w-4 h-4" />
                      {blocked ? "Unblock User" : "Block User"}
                    </button>
                  )}
                  {!isOwn && (
                    <button onClick={handleNotInterested} disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary text-foreground disabled:opacity-50">
                      Not interested
                    </button>
                  )}
                  {!isOwn && (
                    <button onClick={handleHideAuthor} disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary text-foreground disabled:opacity-50">
                      Hide author from feed
                    </button>
                  )}
                  {isOwn && (
                    <button onClick={handleDeletePost} disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary flex items-center gap-2 text-destructive disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                      Delete post
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-3">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>
        {post.repostOf && (
          <div className="mt-2 rounded-xl border border-border bg-secondary/20 p-3 space-y-1.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Repeat2 className="w-3 h-3" />
              Repost from {post.repostOf?.user?.displayName || post.repostOf?.user?.username || "Creator"}
            </p>
            {post.repostOf.content && (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.repostOf.content}</p>
            )}
          </div>
        )}
        {hashtagList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {hashtagList.map((tag, i) => (
              <button key={i} onClick={() => onHashtagClick?.(tag)} className="text-xs text-primary hover:underline">#{tag}</button>
            ))}
          </div>
        )}
        {partialList.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{partialList.map((tag) => <button key={tag} onClick={() => onHashtagClick?.(`%${tag}`)} className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent hover:bg-accent/20">%{tag}</button>)}</div>}
        {engagementSummary.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {engagementSummary.join(" · ")}
          </p>
        )}
      </div>

      {post.media_uris?.length > 0 && (
        <div className="px-4 pb-3">
          {String(post.type || post.post_type || "").toLowerCase().includes("video") ? (
            <video src={post.media_uris[0]} controls playsInline className="w-full max-h-96 rounded-xl bg-black" />
          ) : String(post.type || post.post_type || "").toLowerCase().includes("audio") || String(post.type || post.post_type || "").toLowerCase().includes("music") ? (
            <button onClick={() => openMedia({ id: post.id, title: `${authorName}'s audio post`, url: post.media_uris[0], type: "music" })} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-secondary/60">
              <Music className="h-5 w-5 text-primary" /><span className="text-sm">Play audio post</span>
            </button>
          ) : (
            <Image src={post.media_uris[0]} alt="Post media" fittingType="fill" className="w-full rounded-xl max-h-80" />
          )}
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-3 border-t border-border">
        <button onClick={handleLike} disabled={busy} aria-label={liked ? "Unlike post" : "Like post"} className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50">
          <Heart className={`w-4 h-4 transition-all ${liked ? "fill-red-500 text-red-500 scale-110" : "text-muted-foreground hover:text-red-500"}`} />
          <span className={liked ? "text-red-500" : "text-muted-foreground"}>{liked ? "Liked" : "Like"}</span>
          <span className={liked ? "text-red-500" : "text-muted-foreground"}>{likeCount}</span>
        </button>
        <button onClick={handleRepost} disabled={busy} className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50">
          <Repeat2 className={`w-4 h-4 transition-all ${reposted ? "text-emerald-400 scale-110" : "text-muted-foreground hover:text-emerald-400"}`} />
          <span className={reposted ? "text-emerald-400" : "text-muted-foreground"}>{repostCount}</span>
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <MessageCircle className="w-4 h-4" />
          <span>{commentCount}</span>
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
        <PostComments
          postId={post.id}
          commentCount={commentCount}
          currentUser={currentUser}
          onAuthRequired={onAuthRequired}
          onCountChange={setCommentCount}
        />
      )}
    </article>
  );
}
