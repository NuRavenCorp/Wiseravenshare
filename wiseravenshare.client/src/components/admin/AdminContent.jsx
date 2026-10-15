import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import {
  Loader2,
  Trash2,
  Archive,
  FileText,
  MessageSquare,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

const truthStyles = {
  unverified: "bg-muted text-muted-foreground",
  verified: "bg-green-500/15 text-green-500",
  flagged: "bg-red-500/15 text-red-500",
  challenged: "bg-amber-500/15 text-amber-500",
};

export default function AdminContent() {
  const [tab, setTab] = useState("posts");
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("flagged");
  const [acting, setActing] = useState(null);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const query = filter === "all" ? {} : filter === "flagged" ? { truth_status: "flagged" } : filter === "challenged" ? { truth_status: "challenged" } : { status: filter };
      const page = await apiClient.entities.Post.filter(query, {
        sort: filter === "flagged" ? "-challenge_count" : "-created_date",
        limit: 50,
      });
      setPosts(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    setLoading(true);
    try {
      const page = await apiClient.entities.Comment.filter(
        {},
        { sort: "-created_date", limit: 50 }
      );
      setComments(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "posts") loadPosts();
    else loadComments();
  }, [tab, filter]);

  const handleArchive = async (postId) => {
    setActing(postId);
    try {
      await apiClient.entities.Post.update(postId, { status: "archived" });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } finally {
      setActing(null);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!confirm("Permanently delete this post?")) return;
    setActing(postId);
    try {
      await apiClient.entities.Post.delete(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } finally {
      setActing(null);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!confirm("Permanently delete this comment?")) return;
    setActing(commentId);
    try {
      await apiClient.entities.Comment.delete(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } finally {
      setActing(null);
    }
  };

  const postFilters = [
    { id: "flagged", label: "Flagged" },
    { id: "challenged", label: "Challenged" },
    { id: "published", label: "Published" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab("posts")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
            tab === "posts"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="w-4 h-4" /> Posts
        </button>
        <button
          onClick={() => setTab("comments")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
            tab === "comments"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Comments
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : tab === "posts" ? (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {postFilters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  filter === f.id
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-card/50 text-muted-foreground hover:text-foreground border border-border"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No posts match this filter.
            </p>
          ) : (
            <div className="space-y-2">
              {posts.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-border bg-card/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full capitalize ${truthStyles[p.truth_status] || truthStyles.unverified}`}
                        >
                          {p.truth_status || "unverified"}
                        </span>
                        {p.truth_score != null && (
                          <span className="text-xs text-muted-foreground">
                            Score: {p.truth_score}
                          </span>
                        )}
                        {p.status === "archived" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            archived
                          </span>
                        )}
                        {p.challenge_count > 0 && (
                          <span className="text-xs text-amber-500 flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> {p.challenge_count}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground line-clamp-3">
                        {p.content}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{p.like_count || 0} likes</span>
                        <span>{p.comment_count || 0} comments</span>
                        <span className="capitalize">{p.post_type}</span>
                        {p.created_by_id && (
                          <span className="text-muted-foreground/60">by {p.created_by_id.slice(-8)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.status !== "archived" && (
                        <button
                          onClick={() => handleArchive(p.id)}
                          disabled={acting === p.id}
                          title="Archive"
                          className="p-2 rounded-lg hover:bg-amber-500/15 text-amber-500 transition-colors disabled:opacity-50"
                        >
                          {acting === p.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Archive className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePost(p.id)}
                        disabled={acting === p.id}
                        title="Delete"
                        className="p-2 rounded-lg hover:bg-red-500/15 text-red-500 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No comments yet.
            </p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-xl border border-border bg-card/50 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    on post {c.post_id?.slice(-8)}
                  </p>
                  <p className="text-sm text-foreground line-clamp-2">
                    {c.content}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{c.like_count || 0} likes</span>
                    {c.truth_score != null && <span>Score: {c.truth_score}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteComment(c.id)}
                  disabled={acting === c.id}
                  title="Delete"
                  className="p-2 rounded-lg hover:bg-red-500/15 text-red-500 transition-colors shrink-0 disabled:opacity-50"
                >
                  {acting === c.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}