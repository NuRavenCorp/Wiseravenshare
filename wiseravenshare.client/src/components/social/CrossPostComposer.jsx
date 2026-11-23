import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Share2,
  Loader2,
  Check,
  Image,
  Video,
  Youtube,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  MessageCircle,
  Cloud,
  Music2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import FeatureGate from "@/components/common/FeatureGate";

export default function CrossPostComposer({ accounts: propAccounts, platformStatuses: propPlatformStatuses, onRefreshStatuses }) {
  const [internalStatuses, setInternalStatuses] = useState(propPlatformStatuses || null);
  const [internalAccounts, setInternalAccounts] = useState(propAccounts || null);

  const [content, setContent] = useState("");
  const [postToFacebook, setPostToFacebook] = useState(false);
  const [pageId, setPageId] = useState("");
  const [postToInstagram, setPostToInstagram] = useState(false);
  const [igMediaUrl, setIgMediaUrl] = useState("");
  const [igMediaType, setIgMediaType] = useState("image");
  const [postToTikTok, setPostToTikTok] = useState(false);
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [postToYouTube, setPostToYouTube] = useState(false);
  const [youtubeChannelId, setYouTubeChannelId] = useState("");
  const [youtubeMediaType, setYoutubeMediaType] = useState("video");
  const [youtubePhotoUrl, setYoutubePhotoUrl] = useState("");
  const [postToTwitter, setPostToTwitter] = useState(false);
  const [postToBluesky, setPostToBluesky] = useState(false);
  const [postToLinkedIn, setPostToLinkedIn] = useState(false);
  const [postToReddit, setPostToReddit] = useState(false);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState("");
  const [jobState, setJobState] = useState("");
  const [initializedTargets, setInitializedTargets] = useState(false);

  // Sync prop changes
  useEffect(() => {
    if (propPlatformStatuses && Object.keys(propPlatformStatuses).length > 0) {
      setInternalStatuses(propPlatformStatuses);
    }
  }, [propPlatformStatuses]);

  useEffect(() => {
    if (propAccounts && Object.keys(propAccounts).length > 0) {
      setInternalAccounts(propAccounts);
    }
  }, [propAccounts]);

  // Load statuses and detailed accounts if not already provided
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        if (!propPlatformStatuses || Object.keys(propPlatformStatuses).length === 0) {
          const statusesData = await apiClient.social.getAllPlatformStatuses();
          if (isMounted && statusesData) {
            setInternalStatuses(statusesData);
          }
        }
      } catch {
        // Ignored; fallback gracefully
      }

      try {
        if (!propAccounts || Object.keys(propAccounts).length === 0) {
          const accountsData = await apiClient.functions.invoke("SocialGetAccounts");
          if (isMounted && accountsData?.data) {
            setInternalAccounts(accountsData.data);
          }
        }
      } catch {
        // Ignored; fallback gracefully
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [propPlatformStatuses, propAccounts]);

  const activeStatuses = internalStatuses || {};
  const activeAccounts = internalAccounts || {};

  const isConnected = (p) => {
    return Boolean(
      activeStatuses?.[p]?.connected ||
      activeAccounts?.[p]?.connected
    );
  };

  const fbConnected = isConnected("facebook");
  const igConnected = isConnected("instagram");
  const tiktokConnected = isConnected("tiktok");
  const youtubeConnected = isConnected("youtube");
  const twitterConnected = isConnected("twitter");
  const blueskyConnected = isConnected("bluesky");
  const linkedinConnected = isConnected("linkedin");
  const redditConnected = isConnected("reddit");

  const hasAnyConnection =
    fbConnected ||
    igConnected ||
    tiktokConnected ||
    youtubeConnected ||
    twitterConnected ||
    blueskyConnected ||
    linkedinConnected ||
    redditConnected;

  const fbPages = activeAccounts?.facebook?.pages || [];
  const tiktokAccounts = activeAccounts?.tiktok?.accounts || [];
  const youtubeChannels = activeAccounts?.youtube?.channels || [];

  // Initialize targets once connections are resolved
  useEffect(() => {
    if (hasAnyConnection && !initializedTargets) {
      if (fbConnected) setPostToFacebook(true);
      if (igConnected) setPostToInstagram(true);
      if (tiktokConnected) setPostToTikTok(true);
      if (youtubeConnected) setPostToYouTube(true);
      if (twitterConnected) setPostToTwitter(true);
      if (blueskyConnected) setPostToBluesky(true);
      if (linkedinConnected) setPostToLinkedIn(true);
      if (redditConnected) setPostToReddit(true);

      setPageId((curr) => curr || activeAccounts?.facebook?.selectedPageId || fbPages[0]?.id || "");
      setTiktokUsername((curr) => curr || activeAccounts?.tiktok?.selectedUsername || tiktokAccounts[0]?.username || "");
      setYouTubeChannelId((curr) => curr || activeAccounts?.youtube?.selectedChannelId || youtubeChannels[0]?.id || "");

      setInitializedTargets(true);
    }
  }, [
    hasAnyConnection,
    initializedTargets,
    fbConnected,
    igConnected,
    tiktokConnected,
    youtubeConnected,
    twitterConnected,
    blueskyConnected,
    linkedinConnected,
    redditConnected,
    activeAccounts,
    fbPages,
    tiktokAccounts,
    youtubeChannels,
  ]);

  // Polling for queued background jobs
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
            const anySuccess =
              settled?.facebook?.success ||
              settled?.instagram?.success ||
              settled?.youtube?.success ||
              settled?.tiktok?.success ||
              settled?.twitter?.success ||
              settled?.bluesky?.success ||
              settled?.linkedin?.success ||
              settled?.reddit?.success;

            if (anySuccess) {
              setContent("");
              setIgMediaUrl("");
              setYoutubePhotoUrl("");
            }
          }
          setJobId("");
          if (onRefreshStatuses) {
            onRefreshStatuses();
          }
        }
      } catch (e) {
        setResult({ error: e?.message || "Failed to read publish status." });
        setJobId("");
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [jobId, onRefreshStatuses]);

  const anyTargetSelected =
    (postToFacebook && fbConnected) ||
    (postToInstagram && igConnected) ||
    (postToTikTok && tiktokConnected) ||
    (postToYouTube && youtubeConnected) ||
    (postToTwitter && twitterConnected) ||
    (postToBluesky && blueskyConnected) ||
    (postToLinkedIn && linkedinConnected) ||
    (postToReddit && redditConnected);

  const selectedTargetsCount = [
    postToFacebook && fbConnected,
    postToInstagram && igConnected,
    postToTikTok && tiktokConnected,
    postToYouTube && youtubeConnected,
    postToTwitter && twitterConnected,
    postToBluesky && blueskyConnected,
    postToLinkedIn && linkedinConnected,
    postToReddit && redditConnected,
  ].filter(Boolean).length;

  const twitterOverLimit = postToTwitter && content.length > 280;
  const blueskyOverLimit = postToBluesky && content.length > 300;
  const igMissingMedia = postToInstagram && !igMediaUrl.trim();

  const handlePost = async () => {
    if (!content.trim()) return;
    if (!anyTargetSelected) return;
    if (twitterOverLimit || blueskyOverLimit) return;

    setBusy(true);
    setResult(null);
    setJobId("");
    setJobState("");
    try {
      const payload = {
        content: content.trim(),
        publishToFacebook: Boolean(postToFacebook && fbConnected),
        publishToInstagram: Boolean(postToInstagram && igConnected && igMediaUrl.trim()),
        publishToTikTok: Boolean(postToTikTok && tiktokConnected),
        publishToYouTube: Boolean(postToYouTube && youtubeConnected),
        publishToTwitter: Boolean(postToTwitter && twitterConnected),
        publishToBluesky: Boolean(postToBluesky && blueskyConnected),
        publishToLinkedIn: Boolean(postToLinkedIn && linkedinConnected),
        publishToReddit: Boolean(postToReddit && redditConnected),
        queue: true,
      };

      if (pageId) payload.facebookPageId = pageId;
      if (igMediaUrl) {
        payload.instagramMediaUrl = igMediaUrl.trim();
        payload.instagramMediaType = igMediaType;
      }
      if (tiktokUsername) payload.tikTokUsername = tiktokUsername;
      if (postToYouTube) {
        if (youtubeMediaType === "photo" && youtubePhotoUrl) {
          payload.youTubePhotoUrl = youtubePhotoUrl.trim();
          payload.youTubeMediaType = "photo";
        }
        if (youtubeChannelId) payload.youTubeChannelId = youtubeChannelId;
      }

      const res = await apiClient.functions.invoke("SocialCrossPost", payload);
      if (res.data?.job_id) {
        setJobId(res.data.job_id);
        setJobState(res.data.state || "queued");
        setResult(res.data.results || {});
      } else {
        setResult(res.data);
        const anySuccess =
          res.data?.facebook?.success ||
          res.data?.instagram?.success ||
          res.data?.youtube?.success ||
          res.data?.tiktok?.success ||
          res.data?.twitter?.success ||
          res.data?.bluesky?.success ||
          res.data?.linkedin?.success ||
          res.data?.reddit?.success;

        if (anySuccess) {
          setContent("");
          setIgMediaUrl("");
          setYoutubePhotoUrl("");
        }
      }
    } catch (e) {
      setResult({ error: e.message || "Failed to publish cross-post." });
    } finally {
      setBusy(false);
    }
  };

  if (!hasAnyConnection) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="pt-8 pb-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Share2 className="w-6 h-6" />
          </div>
          <h3 className="font-heading text-lg text-foreground">No Shared Social Accounts Connected Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Connect your accounts in the <strong>Connect</strong> tab to cross-post to Facebook, Instagram, TikTok, YouTube, X (Twitter), Bluesky, LinkedIn, and Reddit all in one go.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <FeatureGate
      featureKey="growth_suite"
      featureName="Growth Suite: Multi-Platform Cross-Posting"
      description="Publish content simultaneously across Facebook, Instagram, TikTok, YouTube, X (Twitter), Bluesky, LinkedIn, and Reddit with automated formatting."
    >
      <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" /> Cross-Post Content
          </CardTitle>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
            {selectedTargetsCount} platform{selectedTargetsCount !== 1 ? "s" : ""} selected
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connected platforms selector chips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Destinations
            </Label>
            <button
              type="button"
              onClick={() => {
                const totalConnected = [fbConnected, igConnected, tiktokConnected, youtubeConnected, twitterConnected, blueskyConnected, linkedinConnected, redditConnected].filter(Boolean).length;
                const shouldSelectAll = selectedTargetsCount < totalConnected;
                if (fbConnected) setPostToFacebook(shouldSelectAll);
                if (igConnected) setPostToInstagram(shouldSelectAll);
                if (tiktokConnected) setPostToTikTok(shouldSelectAll);
                if (youtubeConnected) setPostToYouTube(shouldSelectAll);
                if (twitterConnected) setPostToTwitter(shouldSelectAll);
                if (blueskyConnected) setPostToBluesky(shouldSelectAll);
                if (linkedinConnected) setPostToLinkedIn(shouldSelectAll);
                if (redditConnected) setPostToReddit(shouldSelectAll);
              }}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              {selectedTargetsCount < [fbConnected, igConnected, tiktokConnected, youtubeConnected, twitterConnected, blueskyConnected, linkedinConnected, redditConnected].filter(Boolean).length
                ? "Select All Connected Platforms"
                : "Deselect All"}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {fbConnected && (
              <button
                type="button"
                onClick={() => setPostToFacebook((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  postToFacebook
                    ? "bg-blue-600/15 border-blue-500/40 text-blue-400 shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground opacity-60"
                }`}
              >
                <Facebook className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="truncate flex-1 text-left">Facebook</span>
                {postToFacebook ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" /> : null}
              </button>
            )}

            {twitterConnected && (
              <button
                type="button"
                onClick={() => setPostToTwitter((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  postToTwitter
                    ? "bg-sky-500/15 border-sky-500/40 text-sky-400 shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground opacity-60"
                }`}
              >
                <Twitter className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="truncate flex-1 text-left">X / Twitter</span>
                {postToTwitter ? <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" /> : null}
              </button>
            )}

            {blueskyConnected && (
              <button
                type="button"
                onClick={() => setPostToBluesky((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  postToBluesky
                    ? "bg-blue-400/15 border-blue-400/40 text-blue-300 shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground opacity-60"
                }`}
              >
                <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="truncate flex-1 text-left">Bluesky</span>
                {postToBluesky ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-300 shrink-0" /> : null}
              </button>
            )}

            {linkedinConnected && (
              <button
                type="button"
                onClick={() => setPostToLinkedIn((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  postToLinkedIn
                    ? "bg-blue-700/15 border-blue-600/40 text-blue-400 shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground opacity-60"
                }`}
              >
                <Linkedin className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="truncate flex-1 text-left">LinkedIn</span>
                {postToLinkedIn ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" /> : null}
              </button>
            )}

            {redditConnected && (
              <button
                type="button"
                onClick={() => setPostToReddit((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  postToReddit
                    ? "bg-orange-500/15 border-orange-500/40 text-orange-400 shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground opacity-60"
                }`}
              >
                <MessageCircle className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="truncate flex-1 text-left">Reddit</span>
                {postToReddit ? <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 shrink-0" /> : null}
              </button>
            )}

            {igConnected && (
              <button
                type="button"
                onClick={() => setPostToInstagram((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  postToInstagram
                    ? "bg-pink-500/15 border-pink-500/40 text-pink-400 shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground opacity-60"
                }`}
              >
                <Instagram className="w-4 h-4 text-pink-500 shrink-0" />
                <span className="truncate flex-1 text-left">Instagram</span>
                {postToInstagram ? <CheckCircle2 className="w-3.5 h-3.5 text-pink-400 shrink-0" /> : null}
              </button>
            )}

            {tiktokConnected && (
              <button
                type="button"
                onClick={() => setPostToTikTok((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  postToTikTok
                    ? "bg-primary/15 border-primary/40 text-primary shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground opacity-60"
                }`}
              >
                <Music2 className="w-4 h-4 text-foreground shrink-0" />
                <span className="truncate flex-1 text-left">TikTok</span>
                {postToTikTok ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" /> : null}
              </button>
            )}

            {youtubeConnected && (
              <button
                type="button"
                onClick={() => setPostToYouTube((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  postToYouTube
                    ? "bg-red-500/15 border-red-500/40 text-red-400 shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground opacity-60"
                }`}
              >
                <Youtube className="w-4 h-4 text-red-500 shrink-0" />
                <span className="truncate flex-1 text-left">YouTube</span>
                {postToYouTube ? <CheckCircle2 className="w-3.5 h-3.5 text-red-400 shrink-0" /> : null}
              </button>
            )}
          </div>
        </div>

        {/* Message / Caption Input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label htmlFor="content">Post Caption / Message</Label>
            <div className="flex items-center gap-3 text-xs">
              {postToTwitter && (
                <span className={twitterOverLimit ? "text-destructive font-bold" : "text-muted-foreground"}>
                  X: {content.length}/280
                </span>
              )}
              {postToBluesky && (
                <span className={blueskyOverLimit ? "text-destructive font-bold" : "text-muted-foreground"}>
                  Bluesky: {content.length}/300
                </span>
              )}
            </div>
          </div>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What would you like to share across your connected networks?"
            rows={4}
            className="mt-1"
          />
          {twitterOverLimit && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Message exceeds X / Twitter's 280-character limit.
            </p>
          )}
          {blueskyOverLimit && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Message exceeds Bluesky's 300-character limit.
            </p>
          )}
        </div>

        {/* Detailed configuration sections for selected targets */}

        {/* Twitter badge / info */}
        {postToTwitter && twitterConnected && (
          <div className="p-3.5 rounded-lg border border-sky-500/20 bg-sky-500/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                <Twitter className="w-3.5 h-3.5" /> X / Twitter
              </span>
              {activeStatuses?.twitter?.username && (
                <span className="text-xs text-muted-foreground font-mono">
                  @{activeStatuses.twitter.username}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Publishes tweet via Twitter API v2. Media attachments and links are appended automatically.
            </p>
          </div>
        )}

        {/* Bluesky badge / info */}
        {postToBluesky && blueskyConnected && (
          <div className="p-3.5 rounded-lg border border-blue-400/20 bg-blue-400/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" /> Bluesky
              </span>
              {activeStatuses?.bluesky?.username && (
                <span className="text-xs text-muted-foreground font-mono">
                  @{activeStatuses.bluesky.username.replace(/^@/, "")}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Publishes to your AT Protocol repository feed (<code className="text-[11px]">app.bsky.feed.post</code>).
            </p>
          </div>
        )}

        {/* LinkedIn badge / info */}
        {postToLinkedIn && linkedinConnected && (
          <div className="p-3.5 rounded-lg border border-blue-600/20 bg-blue-600/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                <Linkedin className="w-3.5 h-3.5" /> LinkedIn
              </span>
              {activeStatuses?.linkedin?.username && (
                <span className="text-xs text-muted-foreground">
                  {activeStatuses.linkedin.username}
                </span>
              )}

              {postToReddit && redditConnected && (
                <div className="p-3.5 rounded-lg border border-orange-500/20 bg-orange-500/5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5" /> Reddit
                    </span>
                    {activeStatuses?.reddit?.username && (
                      <span className="text-xs text-muted-foreground">
                        u/{activeStatuses.reddit.username.replace(/^@/, "")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Publishes as a Reddit submission using your connected account and configured subreddit destination.
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Publishes update to your LinkedIn professional network and feed.
            </p>
          </div>
        )}

        {/* Facebook configuration */}
        {postToFacebook && fbConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Facebook className="w-4 h-4 text-blue-500" /> Facebook Destination
            </Label>
            {fbPages.length > 0 ? (
              <select
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select a Facebook Page…</option>
                {fbPages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                Will publish to your connected Facebook Page or profile feed.
              </p>
            )}
          </div>
        )}

        {/* Instagram configuration */}
        {postToInstagram && igConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Instagram className="w-4 h-4 text-pink-500" /> Instagram Business
            </Label>
            <p className="text-xs text-muted-foreground">
              Instagram requires a publicly accessible image or video URL to publish.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
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
                type="button"
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
            {igMissingMedia && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Instagram requires a media URL to publish.
              </p>
            )}
          </div>
        )}

        {/* TikTok configuration */}
        {postToTikTok && tiktokConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Music2 className="w-4 h-4 text-foreground" /> TikTok Destination
            </Label>
            {tiktokAccounts.length > 0 ? (
              <select
                value={tiktokUsername}
                onChange={(e) => setTiktokUsername(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select TikTok account…</option>
                {tiktokAccounts.map((account) => (
                  <option key={account.username} value={account.username}>
                    {account.label || account.username}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                Will publish to your connected TikTok account: {activeStatuses?.tiktok?.username || "Default Account"}
              </p>
            )}
          </div>
        )}

        {/* YouTube configuration */}
        {postToYouTube && youtubeConnected && (
          <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Youtube className="w-4 h-4 text-red-500" /> YouTube Destination
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
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
                type="button"
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
                <p className="text-xs text-amber-500">
                  ⚠ YouTube does not support photo uploads via API. Your photo will be posted to your channel's <strong>Community tab</strong> as a text post with a link to the image.
                </p>
                <Input
                  value={youtubePhotoUrl}
                  onChange={(e) => setYoutubePhotoUrl(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Publishes to your connected YouTube channel.
              </p>
            )}
            {youtubeChannels.length > 0 && (
              <select
                value={youtubeChannelId}
                onChange={(e) => setYouTubeChannelId(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select YouTube channel…</option>
                {youtubeChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name || channel.id}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Post Button */}
        <Button
          onClick={handlePost}
          disabled={
            busy ||
            !!jobId ||
            !content.trim() ||
            !anyTargetSelected ||
            twitterOverLimit ||
            blueskyOverLimit ||
            (postToInstagram && !igMediaUrl.trim())
          }
          className="w-full"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Share2 className="w-4 h-4 mr-2" />
          )}
          {selectedTargetsCount > 0
            ? `Post to ${selectedTargetsCount} Platform${selectedTargetsCount !== 1 ? "s" : ""}`
            : "Select at least 1 Platform to Post"}
        </Button>

        {/* Job progress status */}
        {jobState && jobId && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            Publishing job {jobState}… ({jobId.slice(0, 8)})
          </p>
        )}

        {/* Detailed results by platform */}
        {result && (
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Publish Status
            </Label>

            {/* Facebook Result */}
            {result?.facebook && (
              <div className="text-sm">
                {result.facebook.queued && <p className="text-muted-foreground">Facebook: queued…</p>}
                {result.facebook.pending && <p className="text-muted-foreground">Facebook: processing…</p>}
                {result.facebook.success && (
                  <p className="text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Facebook: Posted successfully!
                    {result.facebook.url && (
                      <a href={result.facebook.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs underline ml-1">
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                )}
                {result.facebook.error && (
                  <p className="text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> Facebook: {result.facebook.error}
                  </p>
                )}
              </div>
            )}

            {/* Twitter Result */}
            {result?.twitter && (
              <div className="text-sm">
                {result.twitter.queued && <p className="text-muted-foreground">X / Twitter: queued…</p>}
                {result.twitter.pending && <p className="text-muted-foreground">X / Twitter: processing…</p>}
                {result.twitter.success && (
                  <p className="text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> X / Twitter: Posted successfully!
                    {result.twitter.url && (
                      <a href={result.twitter.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs underline ml-1">
                        View Tweet <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                )}
                {result.twitter.error && (
                  <p className="text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> X / Twitter: {result.twitter.error}
                  </p>
                )}
              </div>
            )}

            {/* Bluesky Result */}
            {result?.bluesky && (
              <div className="text-sm">
                {result.bluesky.queued && <p className="text-muted-foreground">Bluesky: queued…</p>}
                {result.bluesky.pending && <p className="text-muted-foreground">Bluesky: processing…</p>}
                {result.bluesky.success && (
                  <p className="text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Bluesky: Posted successfully!
                    {result.bluesky.url && (
                      <a href={result.bluesky.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs underline ml-1">
                        View Skeet <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                )}
                {result.bluesky.error && (
                  <p className="text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> Bluesky: {result.bluesky.error}
                  </p>
                )}
              </div>
            )}

            {/* LinkedIn Result */}
            {result?.linkedin && (
              <div className="text-sm">
                {result.linkedin.queued && <p className="text-muted-foreground">LinkedIn: queued…</p>}
                {result.linkedin.pending && <p className="text-muted-foreground">LinkedIn: processing…</p>}
                {result.linkedin.success && (
                  <p className="text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> LinkedIn: Posted successfully!
                    {result.linkedin.url && (
                      <a href={result.linkedin.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs underline ml-1">
                        View Post <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {/* Reddit Result */}
                    {result?.reddit && (
                      <div className="text-sm">
                        {result.reddit.queued && <p className="text-muted-foreground">Reddit: queued…</p>}
                        {result.reddit.pending && <p className="text-muted-foreground">Reddit: processing…</p>}
                        {result.reddit.success && (
                          <p className="text-emerald-400 flex items-center gap-1.5">
                            <Check className="w-4 h-4" /> Reddit: Posted successfully!
                            {result.reddit.url && (
                              <a href={result.reddit.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs underline ml-1">
                                View Post <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </p>
                        )}
                        {result.reddit.error && (
                          <p className="text-destructive flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4" /> Reddit: {result.reddit.error}
                          </p>
                        )}
                      </div>
                    )}
                  </p>
                )}
                {result.linkedin.error && (
                  <p className="text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> LinkedIn: {result.linkedin.error}
                  </p>
                )}
              </div>
            )}

            {/* Instagram Result */}
            {result?.instagram && (
              <div className="text-sm">
                {result.instagram.queued && <p className="text-muted-foreground">Instagram: queued…</p>}
                {result.instagram.pending && <p className="text-muted-foreground">Instagram: processing…</p>}
                {result.instagram.success && (
                  <p className="text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Instagram: Posted successfully!
                    {result.instagram.url && (
                      <a href={result.instagram.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs underline ml-1">
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                )}
                {result.instagram.error && (
                  <p className="text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> Instagram: {result.instagram.error}
                  </p>
                )}
              </div>
            )}

            {/* TikTok Result */}
            {result?.tiktok && (
              <div className="text-sm">
                {result.tiktok.queued && <p className="text-muted-foreground">TikTok: queued…</p>}
                {result.tiktok.pending && <p className="text-muted-foreground">TikTok: processing…</p>}
                {result.tiktok.success && (
                  <p className="text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> TikTok: Posted successfully!
                    {result.tiktok.url && (
                      <a href={result.tiktok.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs underline ml-1">
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                )}
                {result.tiktok.error && (
                  <p className="text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> TikTok: {result.tiktok.error}
                  </p>
                )}
              </div>
            )}

            {/* YouTube Result */}
            {result?.youtube && (
              <div className="text-sm">
                {result.youtube.queued && <p className="text-muted-foreground">YouTube: queued…</p>}
                {result.youtube.pending && <p className="text-muted-foreground">YouTube: processing…</p>}
                {result.youtube.success && (
                  <p className="text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> YouTube: Posted successfully!
                    {result.youtube.url && (
                      <a href={result.youtube.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs underline ml-1">
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                )}
                {result.youtube.error && (
                  <p className="text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> YouTube: {result.youtube.error}
                  </p>
                )}
              </div>
            )}

            {/* General Error */}
            {result?.error && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> {result.error}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </FeatureGate>
  );
}
