import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Send, Loader2, Reply, CornerDownRight, Heart } from "lucide-react";
import { Image } from "@/components/ui/image";

export default function PostComments({ postId, commentCount, currentUser, onAuthRequired, onCountChange }) {
  const [comments, setComments] = useState([]);
  const [likedComments, setLikedComments] = useState({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [collapsed, setCollapsed] = useState({});

  const normalizeComment = (comment) => ({
    id: comment.id,
    post_id: comment.postId ?? comment.post_id ?? postId,
    created_by_id: comment.userId ?? comment.created_by_id,
    parent_id: comment.parentCommentId ?? comment.parent_id ?? null,
    content: comment.content ?? "",
    created_date: comment.createdAt ?? comment.created_date ?? new Date().toISOString(),
    like_count: comment.likesCount ?? comment.like_count ?? 0,
    replies_count: comment.repliesCount ?? comment.replies_count ?? 0,
    user: comment.user || comment.author || null,
  });

  useEffect(() => {
    setLoading(true);
    apiClient.posts.comments(postId, 1, 100)
      .then((res) => {
        const items = Array.isArray(res) ? res : [];
        setComments(items.map(normalizeComment));
      })
      .catch(() => {
        setComments([]);
      })
      .finally(() => setLoading(false));
  }, [postId, currentUser?.id]);

  const buildTree = (flat) => {
    const map = {};
    const roots = [];
    flat.forEach((c) => { map[c.id] = { ...c, replies: [] }; });
    flat.forEach((c) => {
      if (c.parent_id && map[c.parent_id]) map[c.parent_id].replies.push(map[c.id]);
      else roots.push(map[c.id]);
    });
    return roots;
  };

  const tree = buildTree(comments);

  const submit = async (parentId) => {
    if (!currentUser) return onAuthRequired?.();
    const content = parentId ? replyText : text;
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const newComment = await apiClient.posts.addComment(postId, {
        content: content.trim(),
        parentCommentId: parentId || null,
      });
      const persistedCount = Number(newComment?.commentsCount);
      if (Number.isFinite(persistedCount) && persistedCount >= 0) {
        onCountChange?.(persistedCount);
      } else if (!parentId) {
        onCountChange?.(Math.max(0, Number(commentCount || 0) + 1));
      }
      setComments((prev) => [normalizeComment(newComment), ...prev]);
      if (parentId) { setReplyText(""); setReplyTo(null); }
      else setText("");
    } catch (e) {
      console.error("Comment error:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = async (comment) => {
    if (!currentUser) return onAuthRequired?.();
    const isLiked = !!likedComments[comment.id];
    try {
      if (isLiked) {
        const state = await apiClient.posts.unlikeComment(comment.id);
        setLikedComments((p) => ({ ...p, [comment.id]: Boolean(state?.isLiked ?? state?.is_liked) }));
        setComments((prev) => prev.map((c) => c.id === comment.id
          ? { ...c, like_count: Number(state?.likesCount ?? state?.likes_count ?? 0) }
          : c));
      } else {
        const state = await apiClient.posts.likeComment(comment.id);
        setLikedComments((p) => ({ ...p, [comment.id]: Boolean(state?.isLiked ?? state?.is_liked ?? true) }));
        setComments((prev) => prev.map((c) => c.id === comment.id
          ? { ...c, like_count: Number(state?.likesCount ?? state?.likes_count ?? c.like_count + 1) }
          : c));
      }
    } catch (e) {
      console.error("Comment like error:", e);
    }
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const renderNode = (node, depth) => {
    const indent = Math.min(depth, 4) * 16;
    const isCollapsed = collapsed[node.id];
    const replyCount = node.replies.length;
    const author = node.user || null;
    const authorName = author?.displayName || author?.display_name || author?.username || "Member";
    const isLiked = !!likedComments[node.id];
    const likeCount = node.like_count || 0;

    return (
      <div key={node.id} style={{ marginLeft: depth > 0 ? indent : 0 }}>
        <div className={`rounded-xl px-3 py-2.5 ${depth > 0 ? "bg-secondary/20 border border-border/40" : "bg-secondary/40"}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center overflow-hidden shrink-0">
              {(author?.avatarUrl || author?.avatar_uri) ? (
                <Image src={author?.avatarUrl || author?.avatar_uri} alt={authorName} fittingType="fill" className="w-full h-full" />
              ) : (
                <span className="text-[10px] font-heading text-primary">{authorName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <span className="text-xs font-medium text-foreground">{authorName}</span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(node.created_date)}</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{node.content}</p>
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => toggleLike(node)}
              className="flex items-center gap-1 text-[11px] transition-colors"
            >
              <Heart className={`w-3 h-3 ${isLiked ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-500"}`} />
              <span className={isLiked ? "text-red-500" : "text-muted-foreground"}>{likeCount > 0 ? likeCount : ""}</span>
            </button>
            {currentUser && (
              <button
                type="button"
                onClick={() => setReplyTo(replyTo?.id === node.id ? null : { id: node.id })}
                className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
              >
                <Reply className="w-3 h-3" /> Reply
              </button>
            )}
            {replyCount > 0 && (
              <button
                type="button"
                onClick={() => setCollapsed((p) => ({ ...p, [node.id]: !p[node.id] }))}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <CornerDownRight className="w-3 h-3" />
                {isCollapsed ? `Show ${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "Hide"}
              </button>
            )}
          </div>
        </div>

        {replyTo?.id === node.id && currentUser && (
          <div className="flex gap-2 mt-2" style={{ marginLeft: 8 }}>
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit(node.id)}
              placeholder={`Reply to ${authorName}...`}
              autoFocus
              className="flex-1 rounded-full border border-input bg-card px-4 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => submit(node.id)}
              disabled={!replyText.trim() || submitting}
              className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}

        {!isCollapsed && replyCount > 0 && (
          <div className="mt-2 space-y-2 border-l border-border/40" style={{ marginLeft: 8, paddingLeft: 4 }}>
            {node.replies.map((r) => renderNode(r, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
      {currentUser && (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(null)}
            placeholder="Add a comment..."
            className="flex-1 rounded-full border border-input bg-card px-4 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => submit(null)}
            disabled={!text.trim() || submitting}
            className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      )}
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-2">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">No comments yet. Start the conversation.</p>
      ) : (
        <div className="space-y-2">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      )}
    </div>
  );
}