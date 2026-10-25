import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Newspaper, Sparkles, ArrowLeft, Globe, RefreshCw } from "lucide-react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AiNews() {
  const [region, setRegion] = useState("");
  const [topic, setTopic] = useState("");
  const [itemLimit, setItemLimit] = useState(20);
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const autoLoaded = useRef(false);

  const generate = async (opts = {}) => {
    setLoading(true);
    setError(null);
    if (!opts.silent) setNews(null);
    try {
      const res = await apiClient.news.getBulletin({ region, topic, limit: itemLimit });
      if (res?.error) {
        setError(res.error);
      } else if (res && typeof res === "object") {
        setNews(res);
      } else {
        setError("Unexpected response format from news service.");
      }
    } catch (e) {
      setError(e?.data?.message || e?.message || "Failed to generate news.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on first mount so items appear immediately
  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    generate({ silent: true });
  }, [itemLimit]);

  return (
    <div className="min-h-screen bg-background bg-grain">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-2.5">
            <Newspaper className="w-5 h-5 text-accent" />
            <span className="font-display text-sm tracking-[0.2em] text-foreground">AI NEWS DESK</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="font-heading text-4xl md:text-5xl text-foreground">
            The <span className="italic text-primary text-glow">Raven's</span> Report
          </h1>
          <p className="mt-4 text-muted-foreground font-light max-w-xl mx-auto">
            AI-synthesized news from across the world, grounded in real current events and filtered for integrity.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-border bg-card/50 mb-10">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs tracking-wider uppercase text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Globe className="w-3 h-3" /> Region (optional)
              </label>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. North America" className="bg-background/60" />
            </div>
            <div>
              <label className="text-xs tracking-wider uppercase text-muted-foreground mb-1.5 block">Topic (optional)</label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. technology" className="bg-background/60" />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs tracking-wider uppercase text-muted-foreground mb-1.5 block">Items in feed</label>
            <div className="flex flex-wrap gap-2">
              {[12, 20, 30].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setItemLimit(value)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    itemLimit === value
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {value} items
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Button onClick={() => generate()} disabled={loading} className="bg-primary text-primary-foreground">
              <Sparkles className="w-4 h-4 mr-2" />
              {loading ? "Synthesizing…" : "Generate Bulletin"}
            </Button>
            {news && !loading && (
              <Button onClick={() => generate()} variant="outline" disabled={loading}>
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        {loading && !news && !error && (
          <div className="space-y-6 animate-pulse">
            <div className="p-6 rounded-2xl border border-primary/30 bg-primary/5">
              <div className="h-8 bg-primary/20 rounded mb-3 w-3/4" />
              <div className="h-4 bg-muted rounded mb-2" />
              <div className="h-4 bg-muted rounded w-5/6" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-5 rounded-2xl border border-border bg-card/50">
                  <div className="h-5 bg-muted rounded mb-2 w-1/3" />
                  <div className="h-5 bg-muted rounded mb-3 w-full" />
                  <div className="h-4 bg-muted rounded mb-1" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          </div>
        )}

        {news && !error && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl border border-primary/30 bg-primary/5">
              <h2 className="font-heading text-2xl md:text-3xl text-foreground mb-3">{news.headline}</h2>
              <p className="text-muted-foreground font-light leading-relaxed">{news.summary}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {(news.articles || []).map((a, i) => (
                <div key={i} className="p-5 rounded-2xl border border-border bg-card/50 hover:border-primary/40 transition-colors">
                  {typeof a.imageUrl === "string" && /^https?:\/\//i.test(a.imageUrl) && (
                    <div className="mb-3 overflow-hidden rounded-xl border border-border/60 bg-background/60">
                      <img
                        src={a.imageUrl}
                        alt={a.title || "News image"}
                        className="h-40 w-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    {a.region && <span className="text-[10px] tracking-wider uppercase text-accent">{a.region}</span>}
                    {a.provider && (
                      <span className="text-[10px] tracking-wider uppercase text-muted-foreground">{a.provider}</span>
                    )}
                  </div>
                  <h3 className="font-heading text-lg text-foreground mb-2">{a.title}</h3>
                  <p className="text-sm text-muted-foreground font-light leading-relaxed">{a.summary}</p>
                  {a.source && (
                    <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {a.source}
                    </p>
                  )}
                  {a.sourceUrl && /^https?:\/\//i.test(a.sourceUrl) && (
                    <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-3 inline-block">
                      View source →
                    </a>
                  )}
                </div>
              ))}
            </div>
            {Array.isArray(news.providerStatuses) && news.providerStatuses.length > 0 && (
              <div className="rounded-2xl border border-border bg-card/40 p-4">
                <h3 className="font-heading text-sm tracking-[0.18em] text-foreground mb-3">SOURCE STATUS</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {news.providerStatuses.map((status) => (
                    <div key={status.provider} className="rounded-xl border border-border/70 bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs uppercase tracking-wider text-foreground">{status.provider}</span>
                        <span className={`text-[10px] uppercase tracking-wider ${status.succeeded ? "text-green-500" : "text-muted-foreground"}`}>
                          {status.succeeded ? `${status.returnedCount} items` : status.configured ? "unavailable" : "not configured"}
                        </span>
                      </div>
                      {status.error && (
                        <p className="mt-2 text-xs text-muted-foreground">{status.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}