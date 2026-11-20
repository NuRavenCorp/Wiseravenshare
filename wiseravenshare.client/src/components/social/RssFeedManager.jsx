import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Rss, Plus, Trash2, Loader2, RefreshCw, Pause, Play,
  AlertTriangle, CheckCircle2, ExternalLink,
} from "lucide-react";
import SocialFeedCard from "@/components/social/SocialFeedCard";

const QUICK_FEEDS = [
  { label: "BBC News",    url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { label: "AP News",     url: "https://apnews.com/rss" },
  { label: "Reuters",     url: "https://feeds.reuters.com/reuters/topNews" },
  { label: "NPR",         url: "https://feeds.npr.org/1001/rss.xml" },
  { label: "TechCrunch",  url: "https://techcrunch.com/feed/" },
  { label: "The Verge",   url: "https://www.theverge.com/rss/index.xml" },
];

export default function RssFeedManager() {
  const [subs, setSubs]           = useState([]);
  const [items, setItems]         = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [url, setUrl]             = useState("");
  const [name, setName]           = useState("");
  const [adding, setAdding]       = useState(false);
  const [addError, setAddError]   = useState("");
  const [addOk, setAddOk]         = useState("");
  const [refreshingId, setRefreshingId] = useState(null);
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const PAGE_SIZE = 24;

  const fetchSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const data = await apiClient.requestJson("/api/rss-feeds");
      setSubs(Array.isArray(data) ? data : []);
    } catch {
      setSubs([]);
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  const fetchItems = useCallback(async (p = 1, unreadsOnly = unreadOnly) => {
    setLoadingItems(true);
    try {
      const qs = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        unreadOnly: String(unreadsOnly),
      });
      const data = await apiClient.requestJson(`/api/rss-feeds/items?${qs}`);
      setItems(data?.items || []);
      setTotal(data?.total || 0);
      setPage(p);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    fetchSubs();
    fetchItems(1);
  }, [fetchSubs, fetchItems]);

  const handleAdd = async (feedUrl = url, displayName = name) => {
    const trimmed = feedUrl.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError("");
    setAddOk("");
    try {
      await apiClient.requestJson("/api/rss-feeds", {
        method: "POST",
        body: JSON.stringify({ feedUrl: trimmed, displayName: displayName.trim() || undefined }),
      });
      setAddOk("Subscribed! Items will appear shortly.");
      setUrl("");
      setName("");
      await fetchSubs();
      await fetchItems(1);
    } catch (e) {
      setAddError(e?.message || "Could not subscribe to that feed.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this feed subscription?")) return;
    try {
      await apiClient.requestJson(`/api/rss-feeds/${id}`, { method: "DELETE" });
      setSubs(prev => prev.filter(s => s.id !== id));
      setItems(prev => prev.filter(i => i.subscriptionId !== id));
    } catch {}
  };

  const handlePause = async (id) => {
    try {
      const res = await apiClient.requestJson(`/api/rss-feeds/${id}/pause`, { method: "PATCH" });
      setSubs(prev => prev.map(s => s.id === id ? { ...s, isActive: res.isActive } : s));
    } catch {}
  };

  const handleRefresh = async (id) => {
    setRefreshingId(id);
    try {
      await apiClient.requestJson(`/api/rss-feeds/${id}/refresh`, { method: "POST" });
      await fetchItems(1);
    } catch {}
    setRefreshingId(null);
  };

  const handleRead = async (itemId) => {
    try {
      await apiClient.requestJson(`/api/rss-feeds/items/${itemId}/read`, { method: "PATCH" });
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, isRead: true } : i));
    } catch {}
  };

  const unreadCount = items.filter(i => !i.isRead).length;

  return (
    <div className="space-y-6">
      {/* ── Subscribe panel ── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Rss className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Subscribe to a Feed</h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Feed URL (RSS, Atom, or Facebook Graph)</label>
            <Input
              placeholder="https://feeds.bbci.co.uk/news/rss.xml"
              value={url}
              onChange={e => { setUrl(e.target.value); setAddError(""); setAddOk(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
            />
          </div>
          <Button onClick={() => handleAdd()} disabled={adding || !url.trim()} className="shrink-0">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Subscribe
          </Button>
        </div>

        {/* Optional display name */}
        <Input
          placeholder="Display name (optional)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="text-sm"
        />

        {addError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {addError}
          </p>
        )}
        {addOk && (
          <p className="text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {addOk}
          </p>
        )}

        {/* Quick-add well-known feeds */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Quick add popular feeds:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_FEEDS.map(f => (
              <button
                key={f.url}
                onClick={() => handleAdd(f.url, f.label)}
                disabled={adding || subs.some(s => s.feedUrl === f.url)}
                className="px-2.5 py-1 text-xs rounded-md border border-border bg-secondary/40 hover:bg-secondary/80 disabled:opacity-40 transition-colors"
              >
                {subs.some(s => s.feedUrl === f.url) ? "✓ " : ""}{f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── My subscriptions ── */}
      {!loadingSubs && subs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">My Feeds ({subs.length})</h3>
          <div className="space-y-1.5">
            {subs.map(s => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background/50"
              >
                {s.faviconUrl && (
                  <img src={s.faviconUrl} alt="" className="w-4 h-4 rounded shrink-0" onError={e => { e.currentTarget.style.display = "none"; }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.displayName || s.feedUrl}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.feedUrl}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${s.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                    {s.isActive ? "active" : "paused"}
                  </span>
                  {s.consecutiveErrors >= 5 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">error</span>
                  )}
                  <button
                    title={s.isActive ? "Pause" : "Resume"}
                    onClick={() => handlePause(s.id)}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                  >
                    {s.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    title="Refresh now"
                    onClick={() => handleRefresh(s.id)}
                    disabled={refreshingId === s.id}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === s.id ? "animate-spin" : ""}`} />
                  </button>
                  <a href={s.feedUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    title="Unsubscribe"
                    onClick={() => handleDelete(s.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Feed items ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-foreground">Your Feed</h3>
            {unreadCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={e => { setUnreadOnly(e.target.checked); fetchItems(1, e.target.checked); }}
                className="rounded"
              />
              Unread only
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchItems(page)}
              disabled={loadingItems}
            >
              {loadingItems ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {loadingItems && items.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center space-y-2">
            <Rss className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {subs.length === 0
                ? "Subscribe to a feed above to start seeing content here."
                : "No items yet — feeds will auto-refresh every 15 minutes. Click ↻ to refresh now."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <SocialFeedCard key={item.id} item={item} onRead={handleRead} />
              ))}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loadingItems}
                  onClick={() => fetchItems(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {Math.ceil(total / PAGE_SIZE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * PAGE_SIZE >= total || loadingItems}
                  onClick={() => fetchItems(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
