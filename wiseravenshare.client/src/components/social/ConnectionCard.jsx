import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Facebook, Instagram, Music2, Youtube, Twitter,
  Check, Loader2, Unlink, ExternalLink, Save,
  Sparkles, AlertCircle, Link2, Cloud
} from "lucide-react";

const PLATFORM_META = {
  facebook:  { Icon: Facebook,  label: "Facebook",  color: "text-blue-500",   oauthSupported: true,   capabilities: "Post text, photos & videos to your Page or profile; import your page posts"  },
  instagram: { Icon: Instagram, label: "Instagram", color: "text-pink-500",   oauthSupported: true,   capabilities: "Upload photos & reels; cross-post from WiseRavenShare" },
  tiktok:    { Icon: Music2,    label: "TikTok",    color: "text-foreground", oauthSupported: true,   capabilities: "Upload videos & view your content; cross-post directly" },
  youtube:   { Icon: Youtube,   label: "YouTube",   color: "text-red-500",    oauthSupported: true,   capabilities: "Upload videos to your channel; sync your existing uploads" },
  twitter:   { Icon: Twitter,   label: "X / Twitter", color: "text-sky-400",  oauthSupported: true,   capabilities: "Post tweets / threads; cross-post text & media to X" },
  bluesky:   { Icon: Cloud,     label: "Bluesky",   color: "text-blue-400",   oauthSupported: false,  capabilities: "Post to Bluesky; connect with your decentralised network" },
};

const PLATFORM_URL_HINTS = {
  facebook:  "https://facebook.com/your-page",
  instagram: "https://instagram.com/yourhandle",
  tiktok:    "https://tiktok.com/@yourhandle",
  youtube:   "https://www.youtube.com/@yourchannel",
  twitter:   "https://x.com/yourhandle",
  bluesky:   "https://bsky.app/profile/yourhandle.bsky.social",
};

function parseYouTubeIdentifiers(details) {
  const rawProfileUrl = (details?.profileUrl || "").trim();
  const rawUsername = (details?.username || "").trim();
  let channelId = "";
  let userId = "";

  if (rawProfileUrl) {
    const channelMatch = rawProfileUrl.match(/youtube\.com\/channel\/([^/?#]+)/i);
    const handleMatch = rawProfileUrl.match(/youtube\.com\/@([^/?#]+)/i);
    if (channelMatch?.[1]) channelId = channelMatch[1].trim();
    if (handleMatch?.[1]) userId = handleMatch[1].trim();
  }

  if (!channelId && rawUsername.toUpperCase().startsWith("UC")) channelId = rawUsername;
  if (!userId && rawUsername && !rawUsername.toUpperCase().startsWith("UC")) userId = rawUsername.replace(/^@/, "");

  return { channelId, userId };
}

export default function ConnectionCard({ platform, onStatusChange }) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.facebook;
  const { Icon, label, color, oauthSupported, capabilities } = meta;

  const [status, setStatus]           = useState(null);
  const [userId, setUserId]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [connecting, setConnecting]   = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState("");
  const [statusError, setStatusError] = useState("");

  // Editable fields
  const [username, setUsername]           = useState("");
  const [profileUrl, setProfileUrl]       = useState("");
  const [feedUrl, setFeedUrl]             = useState("");
  const [designation, setDesignation]     = useState("");
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [youtubeUserId, setYoutubeUserId] = useState("");
  // Bluesky-specific
  const [bskyHandle, setBskyHandle]       = useState("");
  const [bskyAppPassword, setBskyAppPassword] = useState("");
  const [autoFilled, setAutoFilled]       = useState(false);

  const applyDetails = useCallback((details) => {
    if (!details) return;
    const any = details.username || details.profileUrl || details.feedUrl || details.designation;
    if (any) {
      setUsername(details.username    || "");
      setProfileUrl(details.profileUrl || "");
      setFeedUrl(details.feedUrl       || "");
      setDesignation(details.designation || "");
      if (platform === "youtube") {
        const ids = parseYouTubeIdentifiers(details);
        setYoutubeChannelId(ids.channelId);
        setYoutubeUserId(ids.userId);
      }
      if (platform === "bluesky") setBskyHandle(details.username || "");
      setAutoFilled(true);
    }
  }, [platform]);

  const fetchStatus = useCallback(async () => {
    setStatusError("");
    try {
      const me = await apiClient.auth.me();
      if (!me) { setStatusError("Could not identify your account."); return; }
      setUserId(me.id);
      const data = await apiClient.social.getStatus(platform);
      setStatus(data);
      if (data?.connected) applyDetails(data.details);
    } catch (e) {
      setStatus(null);
      setStatusError(e?.message || "Could not check connection. Try again.");
    } finally {
      setLoading(false);
    }
  }, [platform, applyDetails]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Handle OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const justConnected = params.get("social_connected");
    const connectStatus = params.get("socialConnectStatus");
    const connectProvider = params.get("socialConnectProvider");
    const authError = params.get("socialAuthError");
    const authProvider = params.get("authProvider");
    const isCallbackForThis = connectStatus === "connected" && (!connectProvider || connectProvider === platform);
    if (authError && (!authProvider || authProvider === platform)) {
      setError(authError);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("socialAuthError"); clean.searchParams.delete("authProvider");
      window.history.replaceState({}, "", `${clean.pathname}${clean.search}${clean.hash}`);
    }
    if (justConnected === platform || isCallbackForThis) {
      fetchStatus().then(() => onStatusChange?.());
      const clean = new URL(window.location.href);
      clean.searchParams.delete("social_connected"); clean.searchParams.delete("socialConnectStatus"); clean.searchParams.delete("socialConnectProvider");
      window.history.replaceState({}, "", `${clean.pathname}${clean.search}${clean.hash}`);
    }
  }, [platform, fetchStatus, onStatusChange]);

  const handleConnect = async () => {
    if (platform === "bluesky") { return; } // handled via manual form below
    setConnecting(true); setError("");
    try {
      const returnTarget = new URL(window.location.href);
      returnTarget.searchParams.set("social_connected", platform);
      const data = await apiClient.social.getSocialConnectUrl(platform, userId || "", returnTarget.toString());
      if (data?.authorize_url) {
        window.location.href = data.authorize_url;
      } else {
        setError("No authorization URL returned. Check OAuth configuration for this platform.");
        setConnecting(false);
      }
    } catch (e) {
      setError(e?.message || "Failed to start connection.");
      setConnecting(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true); setSaved(false); setError("");
    try {
      const payload = {
        username: username.trim(),
        profile_url: profileUrl.trim(),
        feed_url: feedUrl.trim(),
        designation: designation.trim(),
      };
      if (platform === "youtube") {
        const normalizedHandle = youtubeUserId.trim().replace(/^@/, "");
        payload.username = normalizedHandle || payload.username;
        payload.channel_handle = normalizedHandle;
        payload.channel_id = youtubeChannelId.trim();
        payload.youtube_user_id = normalizedHandle;
        payload.youtube_channel_id = youtubeChannelId.trim();
      }
      if (platform === "bluesky" && bskyHandle) {
        payload.username = bskyHandle.replace(/^@/, "").trim();
        payload.profile_url = `https://bsky.app/profile/${payload.username}`;
        if (bskyAppPassword) payload.app_password = bskyAppPassword;
      }
      await apiClient.social.saveDetails(platform, userId, payload);
      setSaved(true);
      setBskyAppPassword(""); // never keep app password in state
      setTimeout(() => setSaved(false), 2500);
      await fetchStatus();
      onStatusChange?.();
    } catch (e) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!userId) return;
    setDisconnecting(true); setError("");
    try {
      await apiClient.social.disconnect(platform, userId);
      setStatus({ connected: false, details: {} });
      setUsername(""); setProfileUrl(""); setFeedUrl(""); setDesignation("");
      setYoutubeChannelId(""); setYoutubeUserId("");
      setBskyHandle(""); setBskyAppPassword("");
      setAutoFilled(false);
      onStatusChange?.();
    } catch (e) {
      setError(e?.message || "Disconnect failed.");
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = status?.connected === true;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <CardTitle className="font-heading text-base">{label}</CardTitle>
              <CardDescription className="text-xs flex items-center gap-1 mt-0.5">
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : statusError ? (
                  <><AlertCircle className="w-3 h-3 text-amber-500" /> Status unavailable</>
                ) : isConnected ? (
                  <><Check className="w-3 h-3 text-green-500" /> Connected</>
                ) : (
                  <><Link2 className="w-3 h-3" /> Not connected</>
                )}
              </CardDescription>
            </div>
          </div>
          {isConnected && <Check className="w-5 h-5 text-green-500" />}
        </div>
        {/* What this connection enables */}
        <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">{capabilities}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-2 rounded-md border border-destructive/30 bg-destructive/5 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        )}

        {!loading && statusError && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{statusError}</p>
            <Button variant="outline" size="sm" className="w-full" onClick={fetchStatus}>Retry</Button>
          </div>
        )}

        {!loading && !statusError && !isConnected && (
          oauthSupported ? (
            <Button onClick={handleConnect} disabled={connecting || !userId} className="w-full">
              {connecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Icon className={`w-4 h-4 mr-2 ${color}`} />}
              Connect {label}
            </Button>
          ) : (
            /* Bluesky manual connect via app-password */
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Bluesky uses <strong>App Passwords</strong> (not OAuth). Generate one in Bluesky Settings → App Passwords, then enter it below.
              </p>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Handle (e.g. yourname.bsky.social)</Label>
                <Input value={bskyHandle} onChange={e => setBskyHandle(e.target.value)} placeholder="yourname.bsky.social" className="h-9 text-sm" />
                <Label className="text-xs text-muted-foreground">App Password</Label>
                <Input type="password" value={bskyAppPassword} onChange={e => setBskyAppPassword(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" className="h-9 text-sm font-mono" />
              </div>
              <Button onClick={handleSave} disabled={saving || !bskyHandle.trim() || !bskyAppPassword.trim()} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {saving ? "Saving…" : "Connect Bluesky"}
              </Button>
            </div>
          )
        )}

        {!loading && isConnected && (
          <div className="space-y-4">
            {autoFilled && (
              <div className="flex items-center gap-1.5 text-xs text-accent">
                <Sparkles className="w-3 h-3" />
                Auto-filled from {label} — edit any field to correct it
              </div>
            )}

            <ProfileFields
              platform={platform}
              username={username} setUsername={setUsername}
              profileUrl={profileUrl} setProfileUrl={setProfileUrl}
              feedUrl={feedUrl} setFeedUrl={setFeedUrl}
              designation={designation} setDesignation={setDesignation}
              youtubeChannelId={youtubeChannelId} setYoutubeChannelId={setYoutubeChannelId}
              youtubeUserId={youtubeUserId} setYoutubeUserId={setYoutubeUserId}
              autoFilled={autoFilled}
            />

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  : saved ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-400" />
                  : <Save className="w-3.5 h-3.5 mr-1.5" />}
                {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
              </Button>
              {profileUrl && (
                <a href={profileUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center w-9 h-9 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title={`Open ${label} profile`}>
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}
              className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5">
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Unlink className="w-3.5 h-3.5 mr-1.5" />}
              Disconnect {label}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileFields({
  platform, username, setUsername, profileUrl, setProfileUrl,
  feedUrl, setFeedUrl, designation, setDesignation,
  youtubeChannelId, setYoutubeChannelId, youtubeUserId, setYoutubeUserId, autoFilled,
}) {
  const hint = PLATFORM_URL_HINTS[platform] || "https://example.com/profile";
  const badgeCls = autoFilled ? "ring-1 ring-accent/40 bg-accent/5" : "";

  return (
    <div className={`space-y-3 rounded-md p-3 border border-border ${badgeCls}`}>
      {platform === "youtube" ? (
        <>
          <Label className="text-xs text-muted-foreground mb-1 block">YouTube Channel ID</Label>
          <Input value={youtubeChannelId} onChange={e => setYoutubeChannelId(e.target.value)} placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" className="h-9 text-sm" />
          <Label className="text-xs text-muted-foreground mb-1 mt-3 block">YouTube User ID / Handle</Label>
          <Input value={youtubeUserId} onChange={e => { setYoutubeUserId(e.target.value); setUsername(e.target.value); }} placeholder="@yourhandle" className="h-9 text-sm" />
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
            Find Channel ID in YouTube Studio → Settings → Channel → Advanced settings.
          </p>
        </>
      ) : (
        <>
          <Label className="text-xs text-muted-foreground mb-1 block">Username / Handle</Label>
          <Input value={username} onChange={e => setUsername(e.target.value)} placeholder={`@your_${platform}_handle`} className="h-9 text-sm" />
        </>
      )}
      <Label className="text-xs text-muted-foreground mb-1 block">Profile URL</Label>
      <Input value={profileUrl} onChange={e => setProfileUrl(e.target.value)} placeholder={hint} className="h-9 text-sm" />
      <Label className="text-xs text-muted-foreground mb-1 block">Display Name / Designation</Label>
      <Input value={designation} onChange={e => setDesignation(e.target.value)} placeholder="Name shown on that platform" className="h-9 text-sm" />
      {["facebook", "instagram", "tiktok", "youtube"].includes(platform) && (
        <>
          <Label className="text-xs text-muted-foreground mb-1 block">Feed / Page URL <span className="opacity-60">(optional)</span></Label>
          <Input value={feedUrl} onChange={e => setFeedUrl(e.target.value)} placeholder="https://…" className="h-9 text-sm" />
        </>
      )}
    </div>
  );
}

