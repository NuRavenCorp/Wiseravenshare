import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Share2, Loader2, Check, Instagram, Image, Video, Youtube } from "lucide-react";

export default function CrossPostComposer({ accounts }) {
  const [content, setContent] = useState("");
  const [pageId, setPageId] = useState("");
  const [igMediaUrl, setIgMediaUrl] = useState("");
  const [igMediaType, setIgMediaType] = useState("image");
  const [postToYouTube, setPostToYouTube] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState("");
  const [jobState, setJobState] = useState("");

  const fbPages = accounts?.facebook?.pages || [];
  const igConnected = !!accounts?.instagram;
  const youtubeConnected = !!accounts?.youtube;

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
    if (!pageId && !igMediaUrl && !postToYouTube) return;
    setBusy(true);
    setResult(null);
    setJobId("");
    setJobState("");
    try {
      const payload = { content };
      if (pageId) payload.facebook_page_id = pageId;
      if (igMediaUrl) {
        payload.instagram_media_url = igMediaUrl;
        payload.instagram_media_type = igMediaType;
      }
      if (postToYouTube) payload.publishToYouTube = true;
      payload.queue = true;
      const res = await apiClient.functions.invoke("SocialCrossPost", payload);
      if (res.data?.job_id) {
        setJobId(res.data.job_id);
        setJobState(res.data.state || "queued");
        setResult(res.data.results || {});
      } else {
        setResult(res.data);
        const anySuccess = res.data?.facebook?.success || res.data?.instagram?.success || res.data?.youtube?.success;
        if (anySuccess) {
          setContent("");
          setIgMediaUrl("");
          setPostToYouTube(false);
        }
      }
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const hasAnyConnection = accounts?.facebook || igConnected || youtubeConnected;

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

        {/* YouTube section */}
        {youtubeConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20">
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
            <p className="text-xs text-muted-foreground mt-2 ml-7">
              Publishes a text update to your connected YouTube channel.
            </p>
          </div>
        )}

        <Button
          onClick={handlePost}
          disabled={busy || !!jobId || !content || (!pageId && !igMediaUrl && !postToYouTube)}
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
        {result?.youtube?.queued && <p className="text-sm text-muted-foreground">YouTube: queued…</p>}
        {result?.facebook?.pending && <p className="text-sm text-muted-foreground">Facebook: processing…</p>}
        {result?.instagram?.pending && <p className="text-sm text-muted-foreground">Instagram: processing…</p>}
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