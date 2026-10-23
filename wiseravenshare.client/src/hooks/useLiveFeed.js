import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/api/client";

const normalizeFeedStream = (stream) => {
  const streamId = stream?.stream_id || stream?.id || "";
  return {
    ...stream,
    stream_id: streamId,
    title: stream?.title || "Untitled stream",
    category: stream?.category || (stream?.is_audio_only ? "audio" : "video"),
    viewer_count: Number.isFinite(stream?.viewer_count) ? stream.viewer_count : 0,
  };
};

export function useLiveFeed(viewerId) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchFeed = useCallback(async () => {
    if (!viewerId) {
      setFeed([]);
      setLoading(false);
      return;
    }

    try {
      const data = await apiClient.live.feed(viewerId, 50);
      setFeed((data?.streams || []).map(normalizeFeedStream));
      setError(null);
    } catch (requestError) {
      try {
        const fallback = await apiClient.entities.LiveStream.filter(
          { status: "live" },
          { sort: "-updated_date", limit: 50 },
        );
        setFeed((fallback?.items || []).map(normalizeFeedStream));
        setError(null);
      } catch (fallbackError) {
        setError(fallbackError?.message || requestError?.message || "Unable to load live feed.");
      }
    } finally {
      setLoading(false);
    }
  }, [viewerId]);

  useEffect(() => {
    setLoading(true);
    fetchFeed();
    intervalRef.current = window.setInterval(fetchFeed, 60_000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [fetchFeed]);

  return { feed, loading, error, refresh: fetchFeed };
}
