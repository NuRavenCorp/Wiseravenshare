import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Feather, LayoutGrid, Clock } from "lucide-react";
import PostCard from "./PostCard";
import PostComposer from "./PostComposer";
import PostTimeline from "./PostTimeline";

export default function PostsFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [showComposer, setShowComposer] = useState(false);
  const [view, setView] = useState("feed");

  const fetchPosts = useCallback(async () => {
    try {
      const res = await apiClient.entities.Post.filter({ status: "published" }, { sort: "-created_date", limit: 6 });
      setPosts(res.items || []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    apiClient.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        try { const me = await apiClient.auth.me(); setCurrentUser(me); setShowComposer(true); } catch {}
      }
      await fetchPosts();
    });
  }, [fetchPosts]);

  const handleAuthRequired = () => {
    apiClient.auth.redirectToLogin(window.location.pathname + window.location.hash);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <Feather className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No posts yet. Be the first to share your truth.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showComposer && (
        <PostComposer compact onPosted={fetchPosts} />
      )}
      <div className="flex items-center gap-2 justify-end">
        <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-card/50">
          <button
            onClick={() => setView("feed")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${view === "feed" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Feed
          </button>
          <button
            onClick={() => setView("timeline")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${view === "timeline" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Clock className="w-3.5 h-3.5" /> Timeline
          </button>
        </div>
      </div>
      {view === "timeline" ? (
        <PostTimeline posts={posts} currentUser={currentUser} onAuthRequired={handleAuthRequired} />
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} currentUser={currentUser} onAuthRequired={handleAuthRequired} />
          ))}
        </div>
      )}
    </div>
  );
}