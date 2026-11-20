import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import SocialFeedCard from "@/components/social/SocialFeedCard";

const PAGE_SIZE = 12;

/**
 * SystemFeedSection
 *
 * Renders the latest articles ingested from server-configured RSS/social feeds.
 * This component is entirely passive — no user subscription UI is shown.
 * Content is fetched from GET /api/rss-feeds/system-items which requires no auth.
 */
export default function SystemFeedSection() {
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const data = await apiClient.requestJson(`/api/rss-feeds/system-items?${qs}`);
      setItems(data?.items || []);
      setTotal(data?.total || 0);
      setPage(p);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  // Don't render at all if there's nothing ingested yet
  if (!loading && items.length === 0) return null;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <section className="mt-8 space-y-4">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-1 group"
      >
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-primary" />
          <h2 className="text-base font-semibold text-foreground">Latest News &amp; Updates</h2>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">
              {total} article{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        }
      </button>

      {expanded && (
        <>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(item => (
                  <SocialFeedCard key={item.id} item={item} onRead={null} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => load(page - 1)}
                    disabled={page <= 1 || loading}
                    className="px-3 py-1 text-xs rounded border border-border bg-secondary/40 hover:bg-secondary/80 disabled:opacity-40 transition-colors"
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => load(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="px-3 py-1 text-xs rounded border border-border bg-secondary/40 hover:bg-secondary/80 disabled:opacity-40 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
