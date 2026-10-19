import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { useLiveFeed } from "@/hooks/useLiveFeed";
import "@/Styles/live-feed.css";

export default function LiveFeed() {
  const { user } = useAuth();
  const viewerId = user?.id || null;
  const { feed, loading, error, refresh } = useLiveFeed(viewerId);

  if (!viewerId) {
    return (
      <div className="live-feed-empty">
        Sign in to see a personalized live feed.
      </div>
    );
  }

  if (loading) {
    return <div className="live-feed-loading">Loading live streams...</div>;
  }

  if (error) {
    return <div className="live-feed-error">{error}</div>;
  }

  if (feed.length === 0) {
    return <div className="live-feed-empty">No live streams right now.</div>;
  }

  return (
    <div className="live-feed">
      <div className="live-feed-header">
        <h2>Live Now</h2>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </div>
      <div className="live-feed-grid">
        {feed.map((stream, index) => (
          <article
            key={stream.stream_id}
            className="live-card"
            style={{ order: index }}
          >
            <div className="live-card-badge">LIVE</div>
            <div className="live-card-body">
              <h3>{stream.title || "Untitled stream"}</h3>
              <p>
                {stream.category || "general"} · {stream.viewer_count || 0} watching
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
