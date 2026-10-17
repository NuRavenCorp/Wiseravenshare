import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Facebook, Instagram, Music2, Youtube,
  Check, Loader2, Unlink, ExternalLink, Save,
  Sparkles, AlertCircle, Link2
} from "lucide-react";

const PLATFORM_META = {
  facebook:  { Icon: Facebook,  color: "text-blue-500",   oauthSupported: true  },
  instagram: { Icon: Instagram, color: "text-pink-500",   oauthSupported: true  },
  tiktok:    { Icon: Music2,    color: "text-foreground", oauthSupported: true  },
  youtube:   { Icon: Youtube,   color: "text-red-500",    oauthSupported: true  },
};

const PLATFORM_LABELS = {
  facebook:  "Facebook",
  instagram: "Instagram",
  tiktok:    "TikTok",
  youtube:   "YouTube",
};

const PLATFORM_URL_HINTS = {
  facebook:  "https://facebook.com/your-page",
  instagram: "https://instagram.com/yourhandle",
  tiktok:    "https://tiktok.com/@yourhandle",
  youtube:   "https://www.youtube.com/@yourchannel",
};

export default function ConnectionCard({ platform }) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.facebook;
  const { Icon, color, oauthSupported } = meta;
  const label = PLATFORM_LABELS[platform] || platform;

  const [status, setStatus] = useState(null);   // { connected, details }
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Editable fields – auto-filled from status.details after connect
  const [username, setUsername]       = useState("");
  const [profileUrl, setProfileUrl]   = useState("");
  const [feedUrl, setFeedUrl]         = useState("");
  const [designation, setDesignation] = useState("");
  const [autoFilled, setAutoFilled]   = useState(false);

  const applyDetails = useCallback((details) => {
    if (!details) return;
    const any =
      details.username || details.profileUrl ||
      details.feedUrl  || details.designation;
    if (any) {
      setUsername(details.username    || "");
      setProfileUrl(details.profileUrl || "");
      setFeedUrl(details.feedUrl       || "");
      setDesignation(details.designation || "");
      setAutoFilled(true);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const me = await apiClient.auth.me();
      if (!me) return;
      setUserId(me.id);
      const data = await apiClient.social.getStatus(platform);
      setStatus(data);
      if (data?.connected) {
        applyDetails(data.details);
      }
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, [platform, applyDetails]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // After returning from OAuth, a ?social_connected=platform param may be present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const justConnected = params.get("social_connected");
    if (justConnected === platform) {
      fetchStatus();
      // Clean up the query param without a reload
      const clean = window.location.pathname + window.location.search
        .replace(/[?&]social_connected=[^&]*/g, "")
        .replace(/^&/, "?");
      window.history.replaceState({}, "", clean || window.location.pathname);
    }
  }, [platform, fetchStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?social_connected=${platform}`;
      const data = await apiClient.social.getSocialConnectUrl(platform, userId || "", returnUrl);
      if (data?.authorize_url) {
        window.location.href = data.authorize_url;
      } else {
        setError("Could not get authorization URL. Check server OAuth configuration.");
        setConnecting(false);
      }
    } catch (e) {
      setError(e?.message || "Failed to start connection.");
      setConnecting(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await apiClient.social.saveDetails(platform, userId, {
        username: username.trim(),
        profile_url: profileUrl.trim(),
        feed_url: feedUrl.trim(),
        designation: designation.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      fetchStatus();
    } catch (e) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!userId) return;
    setDisconnecting(true);
    setError("");
    try {
      await apiClient.social.disconnect(platform, userId);
      setStatus({ connected: false, details: {} });
      setUsername(""); setProfileUrl(""); setFeedUrl(""); setDesignation("");
      setAutoFilled(false);
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
            <div className={`w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <CardTitle className="font-heading text-base">{label}</CardTitle>
              <CardDescription className="text-xs flex items-center gap-1 mt-0.5">
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
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
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-2 rounded-md border border-destructive/30 bg-destructive/5 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        )}

        {!loading && !isConnected && (
          oauthSupported ? (
            <Button
              onClick={handleConnect}
              disabled={connecting || !userId}
              className="w-full"
            >
              {connecting
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Icon className={`w-4 h-4 mr-2 ${color}`} />}
              Connect {label}
            </Button>
          ) : (
            /* Manual connect form for platforms that do not support OAuth. */
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {label} doesn't support OAuth. Enter your profile info below and save to link.
              </p>
              <ProfileFields
                platform={platform}
                username={username} setUsername={setUsername}
                profileUrl={profileUrl} setProfileUrl={setProfileUrl}
                feedUrl={feedUrl} setFeedUrl={setFeedUrl}
                designation={designation} setDesignation={setDesignation}
                autoFilled={false}
              />
              <Button
                onClick={handleSave}
                disabled={saving || !profileUrl.trim()}
                className="w-full"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {saving ? "Saving…" : "Save & Link"}
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
              autoFilled={autoFilled}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="flex-1"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : saved ? (
                  <Check className="w-3.5 h-3.5 mr-1.5 text-green-400" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                )}
                {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
              </Button>

              {profileUrl && (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-9 h-9 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title={`Open ${label} profile`}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
            >
              {disconnecting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                : <Unlink className="w-3.5 h-3.5 mr-1.5" />}
              Disconnect {label}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileFields({
  platform, username, setUsername,
  profileUrl, setProfileUrl,
  feedUrl, setFeedUrl,
  designation, setDesignation,
  autoFilled,
}) {
  const hint = PLATFORM_URL_HINTS[platform] || "https://example.com/profile";
  const badgeCls = autoFilled
    ? "ring-1 ring-accent/40 bg-accent/5"
    : "";

  return (
    <div className={`space-y-3 rounded-md p-3 border border-border ${badgeCls}`}>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">
          Username / Handle
        </Label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={`@your_${platform}_handle`}
          className="h-9 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">
          Profile URL
        </Label>
        <Input
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          placeholder={hint}
          className="h-9 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">
          Display Name / Designation
        </Label>
        <Input
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="Name shown on that platform"
          className="h-9 text-sm"
        />
      </div>
      {(platform === "facebook" || platform === "instagram" || platform === "tiktok" || platform === "youtube") && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">
            Feed / Page URL <span className="text-muted-foreground/60">(optional)</span>
          </Label>
          <Input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://…"
            className="h-9 text-sm"
          />
        </div>
      )}
    </div>
  );
}