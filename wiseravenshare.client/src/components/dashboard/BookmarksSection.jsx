import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Bookmark, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BookmarksSection() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBookmarks = async () => {
    try {
      const res = await apiClient.entities.Bookmark.filter({}, { sort: "-created_date", limit: 50 });
      setBookmarks(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchBookmarks();
  }, [user]);

  const handleDelete = async (id) => {
    await apiClient.entities.Bookmark.delete(id);
    setBookmarks(bookmarks.filter((b) => b.id !== id));
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      {bookmarks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Bookmark className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No bookmarks yet. Bookmark posts from the feed to save them here.</p>
        </div>
      ) : (
        bookmarks.map((b) => (
          <div key={b.id} className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-foreground">{b.post_content || b.label || `Post ${b.post_id?.slice(0, 8)}...`}</p>
              <p className="text-xs text-muted-foreground mt-1">Bookmarked {new Date(b.created_date).toLocaleDateString()}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}