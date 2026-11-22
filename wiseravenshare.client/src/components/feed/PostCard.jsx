import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { Heart, MessageCircle, MoreVertical, UserPlus, UserMinus, ShieldBan, Repeat2, Share2, Music, Trash2, Bookmark, ExternalLink } from "lucide-react";
import { Image } from "@/components/ui/image";
import PostComments from "./PostComments";
import ShareMenu from "./ShareMenu";
import { useToast } from "@/components/ui/use-toast";
import { useMediaExperience } from "@/components/media/MediaExperience";

const INLINE_HASHTAG_PATTERN = /#([\p{L}\p{N}_-]+)/gu;

const TRUTH_STYLES = {
  verified: { label: "Verified", class: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  unverified: { label: "Unverified", class: "text-muted-foreground bg-muted/30 border-border" },
  flagged: { label: "Flagged", class: "text-red-400 bg-red-500/10 border-red-500/30" },
  challenged: { label: "Challenged", class: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
};
const EMPTY_BLOCKED_IDS = Object.freeze([]);

export default function PostCard({
  post,
  currentUser,
  onAuthRequired,
  onHashtagClick,
  onBlocked,
  onBookmarkChange,
  onAuthorClick,
  blockedIds = EMPTY_BLOCKED_IDS,
  autoOpenComments = false,
  targetCommentId = "",
}) {
  const [author, setAuthor] = useState(null);
  const [authorFollowersCount, setAuthorFollowersCount] = useState(post.author?.followersCount || 0);
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
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkId, setBookmarkId] = useState(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
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
    setShareCount(post.share_count || 0);
    setBookmarked(Boolean(post._bookmarkId));
    setBookmarkId(post._bookmarkId || null);

    if (post.created_by_id) {
      apiClient.social.followStatus(post.created_by_id)
        .then((res) => {
          if (mounted && res) {
            setFollowing(Boolean(res.isFollowing));
            if (res.followersCount !== undefined) {
              setAuthorFollowersCount(res.followersCount);
            }
          }
        }).catch(() => {});
      setBlocked(blockedIds.includes(String(post.created_by_id)));
    }

    const handleFollowsUpdated = (e) => {
      if (e.detail?.targetUserId && String(e.detail.targetUserId) === String(post.created_by_id)) {
        if (e.detail.followersCount !== undefined) {
          setAuthorFollowersCount(e.detail.followersCount);
        }
        if (e.detail.nowFollowing !== undefined) {
          setFollowing(Boolean(e.detail.nowFollowing));
        }
      }
    };

    window.addEventListener("wr_follows_updated", handleFollowsUpdated);

    return () => {
      mounted = false;
      window.removeEventListener("wr_follows_updated", handleFollowsUpdated);
    };
  }, [post.id, post._bookmarkId, post.created_by_id, currentUser?.id, blockedIds]);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (autoOpenComments) {
      setShowComments(true);
    }
  }, [autoOpenComments]);

  const handleLike = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (busy) return;
    setBusy(true);
    try {
      const state = liked ? await apiClient.posts.unlike(post.id) : await apiClient.posts.like(post.id);
      const nextLiked = Boolean(state?.isLiked ?? state?.is_liked ?? !liked);
      const nextLikesCount = Number(state?.likesCount ?? state?.likes_count ?? (likeCount + (liked ? -1 : 1)));
      setLiked(nextLiked);
      setLikeCount(Number.isFinite(nextLikesCount) ? Math.max(0, nextLikesCount) : 0);
    } catch (e) { toast({ title: "Could not update like", description: e.message, variant: "destructive" }); } finally { setBusy(false); }
  };

  const handleFollow = async () => {
    if (busy) return;
    setBusy(true);
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    setAuthorFollowersCount((prev) => Math.max(0, prev + (nextFollowing ? 1 : -1)));

    try {
      const result = await apiClient.follows.toggle(post.created_by_id);
      if (result) {
        const finalFollowing = Boolean(result.nowFollowing ?? nextFollowing);
        setFollowing(finalFollowing);
        if (result.followersCount !== undefined) {
          setAuthorFollowersCount(result.followersCount);
        }
        setMenuOpen(false);
        window.dispatchEvent(
          new CustomEvent("wr_follows_updated", {
            detail: {
              targetUserId: post.created_by_id,
              followingCount: result.followingCount,
              followersCount: result.followersCount,
              nowFollowing: finalFollowing,
            },
          })
        );
      }
    } catch {
      // Revert on error
      setFollowing(!nextFollowing);
      setAuthorFollowersCount((prev) => Math.max(0, prev + (!nextFollowing ? 1 : -1)));
    } finally {
      setBusy(false);
    }
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

  const handleBookmark = async () => {
    if (!currentUser) return onAuthRequired?.();
    if (bookmarkBusy) return;
    setBookmarkBusy(true);
    try {
      if (bookmarked) {
        let targetId = bookmarkId;
        if (!targetId) {
          const existing = await apiClient.entities.Bookmark.filter({ post_id: post.id }, { limit: 1 });
          targetId = existing?.items?.[0]?.id || null;
        }
        if (targetId) {
          await apiClient.entities.Bookmark.delete(targetId);
        }
        setBookmarked(false);
        setBookmarkId(null);
        onBookmarkChange?.(post.id, { bookmarked: false, bookmarkId: null });
        toast({ title: "Bookmark removed" });
      } else {
        let created = await apiClient.entities.Bookmark.create({
          created_by_id: currentUser.id,
          post_id: post.id,
          post_content: post.content || "",
          label: authorName,
        });
        let createdId = created?.id || null;
        if (!createdId) {
          created = await apiClient.entities.Bookmark.filter({ post_id: post.id }, { sort: "-created_date", limit: 1 });
          createdId = created?.items?.[0]?.id || null;
        }
        setBookmarked(true);
        setBookmarkId(createdId);
        onBookmarkChange?.(post.id, { bookmarked: true, bookmarkId: createdId });
        toast({ title: "Bookmarked for later" });
      }
    } catch (e) {
      toast({ title: "Could not update bookmark", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setBookmarkBusy(false);
    }
  };

  const hashtagList = post.hashtags?.length ? post.hashtags : [...new Set((post.content?.match(/#[\p{L}\p{N}_-]+/gu) || []).map((value) => value.slice(1)))];
  const partialList = post.partials?.length ? post.partials : [...new Set((post.content?.match(/%[\p{L}\p{N}_-]+/gu) || []).map((value) => value.slice(1)))];
  const engagementUsers = Array.isArray(post.engagement_users) ? post.engagement_users : [];
  const engagementSummary = engagementUsers.slice(0, 4).map((entry) => {
    const engagementUser = entry?.user || {};
    const name = engagementUser.display_name || engagementUser.displayName || engagementUser.username || "Someone";
    const type = String(entry?.type || "engaged").toLowerCase();
    const verb = type === "comment" ? "commented" : type === "repost" ? "reposted" : "liked";
    return `${name} ${verb}`;
  });

  const metadataImport = post.media_metadata?.importedFrom || post.mediaMetadata?.importedFrom;
  let importedSource = metadataImport || null;
  if (!importedSource && typeof post.content === "string") {
    const importMatch = post.content.match(/^\[Imported from ([^·\]]+)(?:\s*·\s*([^\]]+))?\]/i);
    if (importMatch) {
      const sourceMatch = post.content.match(/\n\nSource:\s*([^\s]+)/i);
      importedSource = {
        platformLabel: importMatch[1]?.trim() || "External Source",
        authorHandle: importMatch[2]?.trim() || "",
        permalinkUrl: sourceMatch?.[1]?.trim() || null,
      };
    }
  }

  const cleanDisplayContent = typeof post.content === "string" && importedSource
    ? post.content.replace(/^\[Imported from [^\]]+\]\s*/i, "").replace(/\n\nSource:\s*[^\s]+$/i, "").trim()
    : post.content;

  const renderContentWithHashtagHighlight = (content) => {
    if (!content) return null;

    const parts = [];
    let lastIndex = 0;
    const regex = new RegExp(INLINE_HASHTAG_PATTERN);
    for (const match of content.matchAll(regex)) {
      const start = match.index ?? 0;
      const fullMatch = match[0];
      if (start > lastIndex) {
        parts.push(content.slice(lastIndex, start));
      }
      parts.push(
        <span key={`tag-${start}-${fullMatch}`} className="text-purple-400">
          {fullMatch}
        </span>,
      );
      lastIndex = start + fullMatch.length;
    }
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }
    return parts;
  };

  if (dismissed) {
    return null;
  }

  const authorAvatar = author?.avatar || author?.avatar_uri || author?.avatarUrl || post.author?.avatar || post.author?.avatarUrl;

  const handleAuthorFeedClick = (e) => {
    e.stopPropagation();
    const authorTarget = author || post.author || {
      id: post.created_by_id,
      name: authorName,
      username: authorName,
    };
    if (typeof onAuthorClick === "function") {
      onAuthorClick(authorTarget);
    } else {
      const targetUser = authorTarget.username || authorTarget.handle || authorTarget.name || post.created_by_id;
      window.dispatchEvent(new CustomEvent("wr_filter_author", { detail: { author: targetUser } }));
      if (!window.location.pathname.includes("/social") && window.location.pathname !== "/") {
        window.location.href = `/social?author=${encodeURIComponent(targetUser)}`;
      }
    }
  };

  return (
    <article id={`post-${post.id}`} className="rounded-2xl border border-border bg-background/60 backdrop-blur-sm overflow-hidden scroll-mt-24 transition-all duration-500">
      <div className="flex items-center justify-between p-4">
        <button
          type="button"
          onClick={handleAuthorFeedClick}
          className="flex items-center gap-3 text-left group hover:opacity-90 transition-opacity focus:outline-none cursor-pointer"
          title={`View ${authorName}'s feed`}
        >
          <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center overflow-hidden shrink-0 group-hover:ring-2 group-hover:ring-primary transition-all">
            {authorAvatar ? (
              <Image src={authorAvatar} alt={authorName} fittingType="fill" className="w-full h-full object-cover" />
            ) : (
              <span className="font-heading text-lg text-primary">{authorName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
              <span>{authorName}</span>
              {author?.username && (
                <span className="text-xs text-muted-foreground font-normal">
                  @{author.username.replace(/^@/, '')}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>{timeAgo}</span>
              {authorFollowersCount > 0 && (
                <>
                  <span className="opacity-40">•</span>
                  <span className="text-emerald-400 font-semibold">{authorFollowersCount.toLocaleString()} followers</span>
                </>
              )}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${truthStyle.class}`}>{truthStyle.label}</span>
          {!isOwn && (
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

      {importedSource && (
        <div className="mx-4 mb-2.5 flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-semibold text-primary inline-flex items-center gap-1">
              {importedSource.platformLabel}
            </span>
            {importedSource.authorHandle && (
              <span className="text-foreground/90 font-mono text-[11px] bg-secondary/60 px-1.5 py-0.5 rounded border border-border">
                {importedSource.authorHandle}
              </span>
            )}
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
              ✓ Source Verified
            </span>
          </div>
          {importedSource.permalinkUrl && (
            <a
              href={importedSource.permalinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium shrink-0 ml-auto"
            >
              <span>View Source</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      <div className="px-4 pb-3">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{renderContentWithHashtagHighlight(cleanDisplayContent)}</p>
        {post.repostOf && (
          <div className="mt-2 rounded-xl border border-border bg-secondary/20 p-3 space-y-1.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Repeat2 className="w-3 h-3" />
              Repost from {post.repostOf?.user?.displayName || post.repostOf?.user?.username || "Creator"}
            </p>
            {post.repostOf.content && (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{renderContentWithHashtagHighlight(post.repostOf.content)}</p>
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
        <button type="button" onClick={handleLike} disabled={busy} aria-label={liked ? "Unlike post" : "Like post"} className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50">
          <Heart className={`w-4 h-4 transition-all ${liked ? "fill-red-500 text-red-500 scale-110" : "text-muted-foreground hover:text-red-500"}`} />
          <span className={liked ? "text-red-500" : "text-muted-foreground"}>{liked ? "Liked" : "Like"}</span>
          <span className={liked ? "text-red-500" : "text-muted-foreground"}>{likeCount}</span>
        </button>
        <button type="button" onClick={handleRepost} disabled={busy} className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50">
          <Repeat2 className={`w-4 h-4 transition-all ${reposted ? "text-emerald-400 scale-110" : "text-muted-foreground hover:text-emerald-400"}`} />
          <span className={reposted ? "text-emerald-400" : "text-muted-foreground"}>{repostCount}</span>
        </button>
        <button type="button" onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <MessageCircle className="w-4 h-4" />
          <span>{commentCount}</span>
        </button>
        <button
          type="button"
          onClick={handleBookmark}
          disabled={bookmarkBusy}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark post"}
          className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50"
        >
          <Bookmark className={`w-4 h-4 transition-all ${bookmarked ? "fill-primary text-primary scale-110" : "text-muted-foreground hover:text-primary"}`} />
          <span className={bookmarked ? "text-primary" : "text-muted-foreground"}>{bookmarked ? "Saved" : "Save"}</span>
        </button>
        <div className="relative ml-auto">
          <button type="button" onClick={() => setShareOpen((o) => !o)} disabled={busy} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
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
          targetCommentId={targetCommentId}
          onAuthRequired={onAuthRequired}
          onCountChange={setCommentCount}
        />
      )}
    </article>
  );
}
