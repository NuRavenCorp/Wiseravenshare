import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Share2, Loader2, Check, Instagram, Image, Video, Youtube, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"];

export default function CrossPostComposer({ accounts }) {
  // ── Core content state ──────────────────────────────────────────────────────
  const [content, setContent] = useState("");
  const [pageId, setPageId] = useState("");
  const [igMediaUrl, setIgMediaUrl] = useState("");
  const [igMediaType, setIgMediaType] = useState("image");
  const [postToTikTok, setPostToTikTok] = useState(false);
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [postToYouTube, setPostToYouTube] = useState(false);
  const [youtubeChannelId, setYouTubeChannelId] = useState("");
  const [youtubeMediaType, setYoutubeMediaType] = useState("video");
  const [youtubePhotoUrl, setYoutubePhotoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState("");
  const [jobState, setJobState] = useState("");

  // ── AI draft state ──────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState(null); // null = not yet generated
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [articleTitle, setArticleTitle] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("auto");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["facebook", "instagram", "tiktok", "youtube"]);

  const fbPages = accounts?.facebook?.pages || [];
  const igConnected = !!accounts?.instagram?.connected;
  const tiktokConnected = !!accounts?.tiktok?.connected;
  const youtubeConnected = !!accounts?.youtube?.connected;
  const tiktokAccounts = accounts?.tiktok?.accounts || [];
  const youtubeChannels = accounts?.youtube?.channels || [];

  useEffect(() => {
    setPageId((c) => c || accounts?.facebook?.selectedPageId || "");
    setPostToTikTok(Boolean(accounts?.tiktok?.connected));
    setTiktokUsername((c) => c || accounts?.tiktok?.selectedUsername || "");
    setYouTubeChannelId((c) => c || accounts?.youtube?.selectedChannelId || "");
  }, [accounts]);

  // ── Job status polling ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return undefined;
    const timer = setInterval(async () => {
      try {
        const status = await apiClient.functions.invoke("SocialCrossPostStatus", { jobId });
        const state = status.data?.state || "";
        setJobState(state);
        if (status.data?.results) setResult(status.data.results);
        if (state === "completed" || state === "failed") {
          if (state === "completed") {
            const settled = status.data?.results || {};
            if (settled?.facebook?.success || settled?.instagram?.success || settled?.youtube?.success || settled?.tiktok?.success) {
              setContent(""); setIgMediaUrl(""); setPostToTikTok(false); setPostToYouTube(false); setDrafts(null);
            }
          }
          setJobId("");
        }
      } catch (e) {
        setResult({ error: e?.message || "Failed to read publish status." });
        setJobId("");
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [jobId]);

  // ── AI: generate platform drafts ───────────────────────────────────────────
  const handleGenerate = async () => {
    if (!content && !articleTitle) return;
    setGenerating(true);
    setDrafts(null);
    try {
      const res = await fetch("/api/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sourceContent: content || articleTitle,
          articleTitle,
          targetPlatforms: selectedPlatforms,
          mediaType,
          context: ""
        })
      });
      if (!res.ok) throw new Error("Draft generation failed");
      const data = await res.json();
      setDrafts(data);
      setDraftsOpen(true);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setGenerating(false);
    }
  };

  // ── AI: approve & publish drafted content ──────────────────────────────────
  const handlePublishDrafts = async () => {
    if (!drafts) return;
    setBusy(true);
    setResult(null);
    setJobId("");
    setJobState("");
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          drafts: {
            facebookPost: drafts.facebookPost,
            instagramCaption: drafts.instagramCaption,
            tiktokCaption: drafts.tiktokCaption,
            youtubeTitle: drafts.youtubeTitle,
            youtubeDescription: drafts.youtubeDescription
          },
          publicMediaUrl: mediaUrl || igMediaUrl || null,
          mediaType,
          targetPlatforms: selectedPlatforms,
          facebookPageId: pageId || null,
          tikTokUsername: tiktokUsername || null,
          youTubeChannelId: youtubeChannelId || null
        })
      });
      if (!res.ok) throw new Error("Publish dispatch failed");
      const data = await res.json();
      if (data.job_id) { setJobId(data.job_id); setJobState(data.state || "queued"); }
      else setResult(data);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  // ── Manual post (unchanged legacy path) ───────────────────────────────────
  const handlePost = async () => {
    if (!content) return;
    if (!pageId && !igMediaUrl && !postToYouTube && !postToTikTok) return;
    setBusy(true);
    setResult(null);
    setJobId(""); setJobState("");
    try {
      const payload = { content };
      if (pageId) payload.facebookPageId = pageId;
      if (igMediaUrl) { payload.instagramMediaUrl = igMediaUrl; payload.instagramMediaType = igMediaType; }
      payload.publishToTikTok = Boolean(postToTikTok);
      if (tiktokUsername) payload.tikTokUsername = tiktokUsername;
      if (postToYouTube) {
        payload.publishToYouTube = true;
        if (youtubeMediaType === "photo" && youtubePhotoUrl) {
          payload.youTubePhotoUrl = youtubePhotoUrl; payload.youTubeMediaType = "photo";
        }
      }
      if (youtubeChannelId) payload.youTubeChannelId = youtubeChannelId;
      payload.queue = true;
      const res = await apiClient.functions.invoke("SocialCrossPost", payload);
      if (res.data?.job_id) { setJobId(res.data.job_id); setJobState(res.data.state || "queued"); setResult(res.data.results || {}); }
      else {
        setResult(res.data);
        const anySuccess = res.data?.facebook?.success || res.data?.instagram?.success || res.data?.youtube?.success || res.data?.tiktok?.success;
        if (anySuccess) { setContent(""); setIgMediaUrl(""); setPostToTikTok(false); setPostToYouTube(false); }
      }
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const togglePlatform = (p) =>
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const hasAnyConnection = accounts?.facebook?.connected || igConnected || tiktokConnected || youtubeConnected;
  if (!hasAnyConnection) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="pt-6 text-center text-muted-foreground">
          No shared social accounts are connected yet. Please check back later.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="font-heading text-lg flex items-center gap-2">
          <Share2 className="w-5 h-5 text-primary" /> Cross-Post Content
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── Caption / Message ─────────────────────────────────────────── */}
        <div>
          <Label htmlFor="content">Caption / Message</Label>
          <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="Write your post or paste article text…" rows={3} className="mt-1" />
        </div>

        {/* ── AI Generate Drafts section ───────────────────────────────── */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="w-4 h-4" /> NuRavenCorpLLM — Generate Platform Drafts
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Article / Post Title (optional)</Label>
              <Input value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)}
                placeholder="Optional title for YouTube SEO…" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Media URL (DigitalOcean Spaces)</Label>
              <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://your-space.nyc3.cdn.digitaloceanspaces.com/…" className="mt-1 h-8 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1 block">Media Type</Label>
            <div className="flex gap-2 flex-wrap">
              {["auto", "text", "photo", "video", "music"].map((t) => (
                <button key={t} onClick={() => setMediaType(t)}
                  className={`px-3 py-1 rounded-md text-xs capitalize transition-colors border ${
                    mediaType === t ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:text-foreground"
                  }`}>{t}</button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1 block">Target Platforms</Label>
            <div className="flex gap-3 flex-wrap">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-xs capitalize cursor-pointer">
                  <input type="checkbox" checked={selectedPlatforms.includes(p)} onChange={() => togglePlatform(p)}
                    className="w-3.5 h-3.5 rounded border-border accent-primary" />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={generating || (!content && !articleTitle)}
            variant="outline" className="w-full border-primary/40 text-primary hover:bg-primary/10">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Thinking…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Drafts with NuRavenCorpLLM</>}
          </Button>

          {/* ── Per-platform editable drafts ────────────────────────── */}
          {drafts && (
            <div className="border border-border rounded-lg overflow-hidden">
              <button onClick={() => setDraftsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-2 bg-secondary/30 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Drafts ready — review &amp; edit before posting
                </span>
                {draftsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {draftsOpen && (
                <div className="p-4 space-y-4">
                  {selectedPlatforms.includes("facebook") && (
                    <div>
                      <Label className="text-xs font-semibold">Facebook Post</Label>
                      <Textarea rows={3} value={drafts.facebookPost}
                        onChange={(e) => setDrafts({ ...drafts, facebookPost: e.target.value })}
                        className="mt-1 text-sm" />
                    </div>
                  )}
                  {selectedPlatforms.includes("instagram") && (
                    <div>
                      <Label className="text-xs font-semibold">Instagram Caption</Label>
                      <Textarea rows={3} value={drafts.instagramCaption}
                        onChange={(e) => setDrafts({ ...drafts, instagramCaption: e.target.value })}
                        className="mt-1 text-sm" />
                    </div>
                  )}
                  {selectedPlatforms.includes("tiktok") && (
                    <div>
                      <Label className="text-xs font-semibold">TikTok Caption</Label>
                      <Input value={drafts.tiktokCaption}
                        onChange={(e) => setDrafts({ ...drafts, tiktokCaption: e.target.value })}
                        className="mt-1 text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">{drafts.tiktokCaption?.length ?? 0}/150 chars</p>
                    </div>
                  )}
                  {selectedPlatforms.includes("youtube") && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs font-semibold">YouTube Title</Label>
                        <Input value={drafts.youtubeTitle}
                          onChange={(e) => setDrafts({ ...drafts, youtubeTitle: e.target.value })}
                          className="mt-1 text-sm" />
                        <p className="text-xs text-muted-foreground mt-1">{drafts.youtubeTitle?.length ?? 0}/70 chars</p>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">YouTube Description</Label>
                        <Textarea rows={3} value={drafts.youtubeDescription}
                          onChange={(e) => setDrafts({ ...drafts, youtubeDescription: e.target.value })}
                          className="mt-1 text-sm" />
                      </div>
                    </div>
                  )}

                  <Button onClick={handlePublishDrafts} disabled={busy || !!jobId} className="w-full">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    Approve &amp; Publish to Selected Platforms
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Facebook section (manual) ────────────────────────────────── */}
        {accounts?.facebook && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" /> Facebook Page
            </Label>
            <select value={pageId} onChange={(e) => setPageId(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground">
              <option value="">Select a page...</option>
              {fbPages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* ── Instagram section (manual) ───────────────────────────────── */}
        {igConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Instagram className="w-4 h-4 text-primary" /> Instagram Business
            </Label>
            <p className="text-xs text-muted-foreground">Instagram requires a publicly accessible media URL to publish.</p>
            <div className="flex gap-2">
              {["image", "video"].map((t) => (
                <button key={t} onClick={() => setIgMediaType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                    igMediaType === t ? "bg-primary/15 text-primary border border-primary/30" : "border border-border text-muted-foreground hover:text-foreground"
                  }`}>
                  {t === "image" ? <Image className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />} {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <Input value={igMediaUrl} onChange={(e) => setIgMediaUrl(e.target.value)}
              placeholder={igMediaType === "video" ? "https://example.com/video.mp4" : "https://example.com/image.jpg"} />
          </div>
        )}

        {/* ── TikTok section (manual) ──────────────────────────────────── */}
        {tiktokConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={postToTikTok} onChange={(e) => setPostToTikTok(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary" />
              <span className="text-sm font-medium">Post to TikTok</span>
            </label>
            {tiktokAccounts.length > 0 && (
              <select value={tiktokUsername} onChange={(e) => setTiktokUsername(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground">
                <option value="">Select TikTok account…</option>
                {tiktokAccounts.map((a) => <option key={a.username} value={a.username}>{a.label || a.username}</option>)}
              </select>
            )}
          </div>
        )}

        {/* ── YouTube section (manual) ─────────────────────────────────── */}
        {youtubeConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={postToYouTube} onChange={(e) => setPostToYouTube(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary" />
              <span className="text-sm font-medium flex items-center gap-2">
                <Youtube className="w-4 h-4 text-primary" /> Post to YouTube
              </span>
            </label>
            {postToYouTube && (
              <>
                <div className="flex gap-2 ml-7">
                  {["video", "photo"].map((t) => (
                    <button key={t} onClick={() => setYoutubeMediaType(t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                        youtubeMediaType === t ? "bg-primary/15 text-primary border border-primary/30" : "border border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      {t === "video" ? <Video className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />} {t.charAt(0).toUpperCase() + t.slice(1)}{t === "photo" ? " (Community Post)" : ""}
                    </button>
                  ))}
                </div>
                {youtubeMediaType === "photo" ? (
                  <>
                    <p className="text-xs text-amber-500 ml-7">
                      ⚠ YouTube does not support photo uploads via API. Requires 500+ subscribers and an OAuth token.
                    </p>
                    <Input value={youtubePhotoUrl} onChange={(e) => setYoutubePhotoUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg" className="ml-7" />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground ml-7">Publishes a video to your connected YouTube channel.</p>
                )}
              </>
            )}
            {youtubeChannels.length > 0 && (
              <select value={youtubeChannelId} onChange={(e) => setYouTubeChannelId(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground">
                <option value="">Select YouTube channel…</option>
                {youtubeChannels.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
              </select>
            )}
          </div>
        )}

        {/* ── Manual post button (unchanged) ───────────────────────────── */}
        <Button onClick={handlePost}
          disabled={busy || !!jobId || !content || (!pageId && !igMediaUrl && !postToYouTube && !postToTikTok)}
          variant="outline" className="w-full">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          Post Content (manual)
        </Button>

        {/* ── Status ───────────────────────────────────────────────────── */}
        {jobState && jobId && <p className="text-xs text-muted-foreground">Publish job {jobState}… ({jobId.slice(0, 8)})</p>}
        {result?.facebook?.queued && <p className="text-sm text-muted-foreground">Facebook: queued…</p>}
        {result?.instagram?.queued && <p className="text-sm text-muted-foreground">Instagram: queued…</p>}
        {result?.tiktok?.queued && <p className="text-sm text-muted-foreground">TikTok: queued…</p>}
        {result?.youtube?.queued && <p className="text-sm text-muted-foreground">YouTube: queued…</p>}
        {result?.facebook?.pending && <p className="text-sm text-muted-foreground">Facebook: processing…</p>}
        {result?.instagram?.pending && <p className="text-sm text-muted-foreground">Instagram: processing…</p>}
        {result?.tiktok?.pending && <p className="text-sm text-muted-foreground">TikTok: processing…</p>}
        {result?.youtube?.pending && <p className="text-sm text-muted-foreground">YouTube: processing…</p>}
        {result?.facebook?.success && <p className="text-sm text-accent flex items-center gap-1"><Check className="w-4 h-4" /> Facebook: Posted!</p>}
        {result?.facebook?.error && <p className="text-sm text-destructive">Facebook: {result.facebook.error}</p>}
        {result?.instagram?.success && <p className="text-sm text-accent flex items-center gap-1"><Check className="w-4 h-4" /> Instagram: Posted!</p>}
        {result?.instagram?.error && <p className="text-sm text-destructive">Instagram: {result.instagram.error}</p>}
        {result?.tiktok?.success && <p className="text-sm text-accent flex items-center gap-1"><Check className="w-4 h-4" /> TikTok: Posted!</p>}
        {result?.tiktok?.error && <p className="text-sm text-destructive">TikTok: {result.tiktok.error}</p>}
        {result?.youtube?.success && <p className="text-sm text-accent flex items-center gap-1"><Check className="w-4 h-4" /> YouTube: Posted!</p>}
        {result?.youtube?.error && <p className="text-sm text-destructive">YouTube: {result.youtube.error}</p>}
        {result?.error && <p className="text-sm text-destructive">{result.error}</p>}

      </CardContent>
    </Card>
  );
}


export default function CrossPostComposer({ accounts }) {
  const [content, setContent] = useState("");
  const [pageId, setPageId] = useState("");
  const [igMediaUrl, setIgMediaUrl] = useState("");
  const [igMediaType, setIgMediaType] = useState("image");
  const [postToTikTok, setPostToTikTok] = useState(false);
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [postToYouTube, setPostToYouTube] = useState(false);
  const [youtubeChannelId, setYouTubeChannelId] = useState("");
  const [youtubeMediaType, setYoutubeMediaType] = useState("video");
  const [youtubePhotoUrl, setYoutubePhotoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState("");
  const [jobState, setJobState] = useState("");

  const fbPages = accounts?.facebook?.pages || [];
  const igConnected = !!accounts?.instagram?.connected;
  const tiktokConnected = !!accounts?.tiktok?.connected;
  const youtubeConnected = !!accounts?.youtube?.connected;
  const tiktokAccounts = accounts?.tiktok?.accounts || [];
  const youtubeChannels = accounts?.youtube?.channels || [];

  useEffect(() => {
    setPageId((current) => current || accounts?.facebook?.selectedPageId || "");
    setPostToTikTok(Boolean(accounts?.tiktok?.connected));
    setTiktokUsername((current) => current || accounts?.tiktok?.selectedUsername || "");
    setYouTubeChannelId((current) => current || accounts?.youtube?.selectedChannelId || "");
  }, [accounts]);

  useEffect(() => {
    if (!jobId) return undefined;

    const timer = setInterval(async () => {
      try {
        const status = await apiClient.functions.invoke("SocialCrossPostStatus", { jobId });
        const state = status.data?.state || "";
        setJobState(state);
        if (status.data?.results) {
          setResult(status.data.results);
        }

        if (state === "completed" || state === "failed") {
          if (state === "completed") {
            const settled = status.data?.results || {};
            const anySuccess = settled?.facebook?.success || settled?.instagram?.success || settled?.youtube?.success || settled?.tiktok?.success;
            if (anySuccess) {
              setContent("");
              setIgMediaUrl("");
              setPostToTikTok(false);
              setPostToYouTube(false);
            }
          }
          setJobId("");
        }
      } catch (e) {
        setResult({ error: e?.message || "Failed to read publish status." });
        setJobId("");
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [jobId]);

  const handlePost = async () => {
    if (!content) return;
    if (!pageId && !igMediaUrl && !postToYouTube && !postToTikTok) return;
    setBusy(true);
    setResult(null);
    setJobId("");
    setJobState("");
    try {
      const payload = { content };
      if (pageId) payload.facebookPageId = pageId;
      if (igMediaUrl) {
        payload.instagramMediaUrl = igMediaUrl;
        payload.instagramMediaType = igMediaType;
      }
      payload.publishToTikTok = Boolean(postToTikTok);
      if (tiktokUsername) payload.tikTokUsername = tiktokUsername;
      if (postToYouTube) {
        payload.publishToYouTube = true;
        if (youtubeMediaType === "photo" && youtubePhotoUrl) {
          payload.youTubePhotoUrl = youtubePhotoUrl;
          payload.youTubeMediaType = "photo";
        }
      }
      if (youtubeChannelId) payload.youTubeChannelId = youtubeChannelId;
      payload.queue = true;
      const res = await apiClient.functions.invoke("SocialCrossPost", payload);
      if (res.data?.job_id) {
        setJobId(res.data.job_id);
        setJobState(res.data.state || "queued");
        setResult(res.data.results || {});
      } else {
        setResult(res.data);
        const anySuccess = res.data?.facebook?.success || res.data?.instagram?.success || res.data?.youtube?.success || res.data?.tiktok?.success;
        if (anySuccess) {
          setContent("");
          setIgMediaUrl("");
          setPostToTikTok(false);
          setPostToYouTube(false);
        }
      }
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const hasAnyConnection = accounts?.facebook?.connected || igConnected || tiktokConnected || youtubeConnected;

  if (!hasAnyConnection) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="pt-6 text-center text-muted-foreground">
          No shared social accounts are connected yet. Please check back later.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="font-heading text-lg flex items-center gap-2">
          <Share2 className="w-5 h-5 text-primary" /> Cross-Post Content
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label htmlFor="content">Caption / Message</Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your post caption..."
            rows={3}
            className="mt-1"
          />
        </div>

        {/* Facebook section */}
        {accounts?.facebook && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" /> Facebook Page
            </Label>
            <select
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="">Select a page...</option>
              {fbPages.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Instagram Business section */}
        {igConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Instagram className="w-4 h-4 text-primary" /> Instagram Business
            </Label>
            <p className="text-xs text-muted-foreground">
              Instagram requires a publicly accessible media URL to publish.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setIgMediaType("image")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                  igMediaType === "image"
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Image className="w-3.5 h-3.5" /> Image
              </button>
              <button
                onClick={() => setIgMediaType("video")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                  igMediaType === "video"
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Video className="w-3.5 h-3.5" /> Video
              </button>
            </div>
            <Input
              value={igMediaUrl}
              onChange={(e) => setIgMediaUrl(e.target.value)}
              placeholder={
                igMediaType === "video"
                  ? "https://example.com/video.mp4"
                  : "https://example.com/image.jpg"
              }
            />
          </div>
        )}

        {/* TikTok section */}
        {tiktokConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={postToTikTok}
                onChange={(e) => setPostToTikTok(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-sm font-medium">Post to TikTok</span>
            </label>
            {tiktokAccounts.length > 0 && (
              <select
                value={tiktokUsername}
                onChange={(e) => setTiktokUsername(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select TikTok account…</option>
                {tiktokAccounts.map((account) => (
                  <option key={account.username} value={account.username}>{account.label || account.username}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* YouTube section */}
        {youtubeConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={postToYouTube}
                onChange={(e) => setPostToYouTube(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-sm font-medium flex items-center gap-2">
                <Youtube className="w-4 h-4 text-primary" /> Post to YouTube
              </span>
            </label>
            {postToYouTube && (
              <>
                <div className="flex gap-2 ml-7">
                  <button
                    onClick={() => setYoutubeMediaType("video")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                      youtubeMediaType === "video"
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Video className="w-3.5 h-3.5" /> Video
                  </button>
                  <button
                    onClick={() => setYoutubeMediaType("photo")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                      youtubeMediaType === "photo"
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Image className="w-3.5 h-3.5" /> Photo (Community Post)
                  </button>
                </div>
                {youtubeMediaType === "photo" ? (
                  <>
                    <p className="text-xs text-amber-500 ml-7">
                      ⚠ YouTube does not support photo uploads via API. Your photo will be posted to your channel's <strong>Community tab</strong> as a text post with a link to the image. Requires a channel with 500+ subscribers and an OAuth token configured on the server.
                    </p>
                    <Input
                      value={youtubePhotoUrl}
                      onChange={(e) => setYoutubePhotoUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="ml-7"
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground ml-7">
                    Publishes a video to your connected YouTube channel. Provide a public video URL below.
                  </p>
                )}
              </>
            )}
            {youtubeChannels.length > 0 && (
              <select
                value={youtubeChannelId}
                onChange={(e) => setYouTubeChannelId(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select YouTube channel…</option>
                {youtubeChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.name || channel.id}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <Button
          onClick={handlePost}
          disabled={busy || !!jobId || !content || (!pageId && !igMediaUrl && !postToYouTube && !postToTikTok)}
          className="w-full"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          Post Content
        </Button>

        {jobState && jobId && (
          <p className="text-xs text-muted-foreground">
            Publish job {jobState}… ({jobId.slice(0, 8)})
          </p>
        )}

        {result?.facebook?.queued && <p className="text-sm text-muted-foreground">Facebook: queued…</p>}
        {result?.instagram?.queued && <p className="text-sm text-muted-foreground">Instagram: queued…</p>}
        {result?.tiktok?.queued && <p className="text-sm text-muted-foreground">TikTok: queued…</p>}
        {result?.youtube?.queued && <p className="text-sm text-muted-foreground">YouTube: queued…</p>}
        {result?.facebook?.pending && <p className="text-sm text-muted-foreground">Facebook: processing…</p>}
        {result?.instagram?.pending && <p className="text-sm text-muted-foreground">Instagram: processing…</p>}
        {result?.tiktok?.pending && <p className="text-sm text-muted-foreground">TikTok: processing…</p>}
        {result?.youtube?.pending && <p className="text-sm text-muted-foreground">YouTube: processing…</p>}

        {result?.facebook?.success && (
          <p className="text-sm text-accent flex items-center gap-1">
            <Check className="w-4 h-4" /> Facebook: Posted successfully!
          </p>
        )}
        {result?.facebook?.error && (
          <p className="text-sm text-destructive">Facebook: {result.facebook.error}</p>
        )}
        {result?.instagram?.success && (
          <p className="text-sm text-accent flex items-center gap-1">
            <Check className="w-4 h-4" /> Instagram: Posted successfully!
          </p>
        )}
        {result?.instagram?.error && (
          <p className="text-sm text-destructive">Instagram: {result.instagram.error}</p>
        )}
        {result?.tiktok?.success && (
          <p className="text-sm text-accent flex items-center gap-1">
            <Check className="w-4 h-4" /> TikTok: Posted successfully!
          </p>
        )}
        {result?.tiktok?.error && (
          <p className="text-sm text-destructive">TikTok: {result.tiktok.error}</p>
        )}
        {result?.youtube?.success && (
          <p className="text-sm text-accent flex items-center gap-1">
            <Check className="w-4 h-4" /> YouTube: Posted successfully!
          </p>
        )}
        {result?.youtube?.error && (
          <p className="text-sm text-destructive">YouTube: {result.youtube.error}</p>
        )}
        {result?.error && (
          <p className="text-sm text-destructive">{result.error}</p>
        )}
      </CardContent>
    </Card>
  );
}