import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/api/client";

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
      setFeed(data?.streams || []);
      setError(null);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load live feed.");
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
