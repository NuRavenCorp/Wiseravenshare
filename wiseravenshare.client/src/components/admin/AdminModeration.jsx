import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { Loader2, ShieldCheck, Trash2, Gavel } from "lucide-react";

export default function AdminModeration() {
  const [posts, setPosts] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [postPage, challengePage] = await Promise.all([
        apiClient.entities.Post.filter(
          { truth_status: { $in: ["flagged", "challenged"] }, status: { $ne: "archived" } },
          { sort: "-challenge_count", limit: 50 }
        ),
        apiClient.entities.Challenge.filter(
          { status: { $in: ["open", "under_review"] } },
          { sort: "-created_date", limit: 50 }
        ),
      ]);
      setPosts(postPage.items || []);
      setChallenges(challengePage.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const challengesForPost = (postId) => challenges.filter((c) => c.post_id === postId);

  const approve = async (post) => {
    setActing(post.id);
    try {
      await apiClient.entities.Post.update(post.id, { truth_status: "verified" });
      const open = challengesForPost(post.id);
      if (open.length > 0) {
        await apiClient.entities.Challenge.bulkUpdate(
          open.map((c) => ({ id: c.id, status: "dismissed", verdict: "Content approved by admin" }))
        );
      }
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } finally {
      setActing(null);
    }
  };

  const remove = async (post) => {
    if (!confirm("Remove this content? It will be archived and hidden from the platform.")) return;
    setActing(post.id);
    try {
      await apiClient.entities.Post.update(post.id, { status: "archived" });
      const open = challengesForPost(post.id);
      if (open.length > 0) {
        await apiClient.entities.Challenge.bulkUpdate(
          open.map((c) => ({ id: c.id, status: "upheld", verdict: "Content removed by admin" }))
        );
      }
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No flagged or challenged content. The flock is grounded in truth.
        </p>
      ) : (
        posts.map((p) => {
          const postChallenges = challengesForPost(p.id);
          return (
            <div key={p.id} className="p-5 rounded-2xl border border-border bg-card/50">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    p.truth_status === "flagged"
                      ? "bg-red-500/15 text-red-500"
                      : "bg-amber-500/15 text-amber-500"
                  }`}
                >
                  {p.truth_status}
                </span>
                {p.truth_score != null && (
                  <span className="text-xs text-muted-foreground">Score: {p.truth_score}</span>
                )}
                {postChallenges.length > 0 && (
                  <span className="text-xs text-amber-500 flex items-center gap-1">
                    <Gavel className="w-3 h-3" /> {postChallenges.length} challenge{postChallenges.length > 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-xs text-muted-foreground/60 ml-auto capitalize">{p.post_type}</span>
              </div>
              <p className="text-sm text-foreground line-clamp-3 mb-3">{p.content}</p>
              {postChallenges.length > 0 && (
                <div className="space-y-2 mb-4 pl-3 border-l-2 border-amber-500/30">
                  {postChallenges.map((c) => (
                    <div key={c.id} className="text-xs">
                      <p className="text-muted-foreground">{c.reason}</p>
                      {c.evidence && (
                        <p className="text-muted-foreground/70 mt-0.5">Evidence: {c.evidence}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => approve(p)}
                  disabled={acting === p.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-green-500/15 text-green-500 hover:bg-green-500/25 transition-colors disabled:opacity-50"
                >
                  {acting === p.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => remove(p)}
                  disabled={acting === p.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}