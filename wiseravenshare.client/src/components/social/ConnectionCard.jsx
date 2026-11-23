import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Facebook,
  Instagram,
  Music2,
  Youtube,
  Twitter,
  Linkedin,
  MessageCircle,
  Check,
  Loader2,
  Unlink,
  ExternalLink,
  Save,
  Sparkles,
  AlertCircle,
  Link2,
  Cloud,
  ShieldCheck,
  Share2,
  Download,
  UserCheck,
  BarChart3,
  Globe,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from "lucide-react";

const PLATFORM_META = {
  facebook: {
    Icon: Facebook,
    label: "Facebook",
    color: "text-blue-500",
    oauthSupported: true,
    capabilities: "Post text, photos & videos to your Page or profile; import your page posts",
  },
  instagram: {
    Icon: Instagram,
    label: "Instagram",
    color: "text-pink-500",
    oauthSupported: true,
    capabilities: "Upload photos & reels; cross-post from WiseRavenShare",
  },
  tiktok: {
    Icon: Music2,
    label: "TikTok",
    color: "text-foreground",
    oauthSupported: true,
    capabilities: "Upload videos & view your content; cross-post directly",
  },
  youtube: {
    Icon: Youtube,
    label: "YouTube",
    color: "text-red-500",
    oauthSupported: true,
    capabilities: "Upload videos to your channel; sync your existing uploads",
  },
  twitter: {
    Icon: Twitter,
    label: "X / Twitter",
    color: "text-sky-400",
    oauthSupported: true,
    capabilities: "Post tweets / threads; cross-post text & media to X",
  },
  bluesky: {
    Icon: Cloud,
    label: "Bluesky",
    color: "text-blue-400",
    oauthSupported: true,
    capabilities: "Post to Bluesky; connect with your decentralised network",
  },
  linkedin: {
    Icon: Linkedin,
    label: "LinkedIn",
    color: "text-blue-600",
    oauthSupported: true,
    capabilities: "Publish posts & updates to your professional network; cross-post content",
  },
  reddit: {
    Icon: MessageCircle,
    label: "Reddit",
    color: "text-orange-500",
    oauthSupported: true,
    capabilities: "Submit links or text posts to your connected subreddit destinations.",
  },
};

const PLATFORM_URL_HINTS = {
  facebook: "https://facebook.com/your-page",
  instagram: "https://instagram.com/yourhandle",
  tiktok: "https://tiktok.com/@yourhandle",
  youtube: "https://www.youtube.com/@yourchannel",
  twitter: "https://x.com/yourhandle",
  bluesky: "https://bsky.app/profile/yourhandle.bsky.social",
  linkedin: "https://linkedin.com/in/yourhandle",
  reddit: "https://reddit.com/user/yourusername",
};

const SHARING_SCOPES = [
  {
    id: "crosspost",
    key: "allowCrossPosting",
    apiKey: "allow_crossposting",
    icon: Share2,
    title: "Cross-Post Content & Media",
    description: "Allow WiseRavenShare to publish posts, stories, photos, and videos to this account.",
    defaultChecked: true,
  },
  {
    id: "import",
    key: "allowContentImport",
    apiKey: "allow_content_import",
    icon: Download,
    title: "Import Posts & Activity",
    description: "Allow WiseRavenShare to fetch and sync content, reels, and feeds into WiseRavenShare.",
    defaultChecked: true,
  },
  {
    id: "profile",
    key: "shareProfile",
    apiKey: "share_profile",
    icon: UserCheck,
    title: "Share Public Profile & Handle",
    description: "Display your verified external handle, display name, and avatar link on your WiseRavenShare profile.",
    defaultChecked: true,
  },
  {
    id: "analytics",
    key: "shareAnalytics",
    apiKey: "share_analytics",
    icon: BarChart3,
    title: "Sync Analytics & Engagement",
    description: "Share cross-platform view counts, likes, comments, and engagement performance data.",
    defaultChecked: true,
  },
  {
    id: "discovery",
    key: "publicDiscovery",
    apiKey: "public_discovery",
    icon: Globe,
    title: "Enable Profile Discovery",
    description: "Allow followers and creators to discover and navigate to your external profile.",
    defaultChecked: true,
  },
];

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
  const { Icon, label, color, capabilities } = meta;

  const [status, setStatus] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");

  // Editable fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [designation, setDesignation] = useState("");
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [youtubeUserId, setYoutubeUserId] = useState("");

  // Bluesky-specific
  const [bskyHandle, setBskyHandle] = useState("");
  const [bskyAppPassword, setBskyAppPassword] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);
  const [oauthUnavailable, setOauthUnavailable] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showPermissions, setShowPermissions] = useState(true);

  // ── Sharing permissions checkboxes ─────────────────────────────────
  const [sharingPerms, setSharingPerms] = useState({
    allowCrossPosting: true,
    allowContentImport: true,
    shareProfile: true,
    shareAnalytics: true,
    publicDiscovery: true,
  });

  // Mandatory user consent checkbox for connection authorization
  const [consentChecked, setConsentChecked] = useState(false);

  const toggleSharingPerm = (key) => {
    setSharingPerms((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const applyDetails = useCallback((details) => {
    if (!details) return;
    const any = details.username || details.profileUrl || details.feedUrl || details.designation;
    if (any) {
      setUsername(details.username || "");
      setProfileUrl(details.profileUrl || "");
      setFeedUrl(details.feedUrl || "");
      setDesignation(details.designation || "");
      if (platform === "youtube") {
        const ids = parseYouTubeIdentifiers(details);
        setYoutubeChannelId(ids.channelId);
        setYoutubeUserId(ids.userId);
      }
      if (platform === "bluesky") setBskyHandle(details.username || "");
      setAutoFilled(true);
    }

    // Populate existing sharing permissions
    setSharingPerms({
      allowCrossPosting: details.allowCrossPosting ?? true,
      allowContentImport: details.allowContentImport ?? true,
      shareProfile: details.shareProfile ?? true,
      shareAnalytics: details.shareAnalytics ?? true,
      publicDiscovery: details.publicDiscovery ?? true,
    });
    if (details.sharingConsent !== undefined) {
      setConsentChecked(Boolean(details.sharingConsent));
    }
  }, [platform]);

  const fetchStatus = useCallback(async () => {
    setStatusError("");
    try {
      let me = null;
      try { me = await apiClient.auth.me(); } catch { /* unauthenticated */ }
      if (me?.id) {
        setUserId(me.id);
        const data = await apiClient.social.getStatus(platform);
        setStatus(data);
        if (data?.connected) applyDetails(data.details);
      } else {
        setUserId(null);
        setStatus({ connected: false, details: {} });
      }
    } catch (e) {
      setStatus({ connected: false, details: {} });
    } finally {
      setLoading(false);
    }
  }, [platform, applyDetails]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle OAuth callback params and sync pending sharing permissions
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const justConnected = params.get("social_connected");
    const connectStatus = params.get("socialConnectStatus");
    const connectProvider = params.get("socialConnectProvider");
    const authError = params.get("socialAuthError");
    const authProvider = params.get("authProvider");
    const isCallbackForThis =
      connectStatus === "connected" && (!connectProvider || connectProvider === platform);

    if (authError && (!authProvider || authProvider === platform)) {
      setError(authError);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("socialAuthError");
      clean.searchParams.delete("authProvider");
      window.history.replaceState({}, "", `${clean.pathname}${clean.search}${clean.hash}`);
    }

    if (justConnected === platform || isCallbackForThis) {
      // Sync stored pending permissions to backend
      try {
        const cached = localStorage.getItem(`wr_social_pending_${platform}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          apiClient.social.saveDetails(platform, userId || "me", parsed).catch(() => {});
          localStorage.removeItem(`wr_social_pending_${platform}`);
        }
      } catch {}

      fetchStatus().then(() => onStatusChange?.());
      const clean = new URL(window.location.href);
      clean.searchParams.delete("social_connected");
      clean.searchParams.delete("socialConnectStatus");
      clean.searchParams.delete("socialConnectProvider");
      window.history.replaceState({}, "", `${clean.pathname}${clean.search}${clean.hash}`);
    }
  }, [platform, userId, fetchStatus, onStatusChange]);

  const buildSharingPayload = () => {
    const activeScopes = SHARING_SCOPES.filter((opt) => sharingPerms[opt.key]).map((opt) => opt.id);
    return {
      share_profile: sharingPerms.shareProfile ? "true" : "false",
      allow_crossposting: sharingPerms.allowCrossPosting ? "true" : "false",
      allow_content_import: sharingPerms.allowContentImport ? "true" : "false",
      share_analytics: sharingPerms.shareAnalytics ? "true" : "false",
      public_discovery: sharingPerms.publicDiscovery ? "true" : "false",
      sharing_consent: consentChecked ? "true" : "false",
      scopes: activeScopes.join(","),
    };
  };

  const handleConnect = async () => {
    if (!consentChecked) {
      setError("Please check the authorization box below to authorize sharing of information/content.");
      return;
    }

    setConnecting(true);
    setError("");
    setOauthUnavailable(false);

    try {
      // Cache user's checked permissions to persist after OAuth callback
      const sharingData = buildSharingPayload();
      try {
        localStorage.setItem(`wr_social_pending_${platform}`, JSON.stringify(sharingData));
      } catch {}

      const returnTarget = new URL(window.location.href);
      returnTarget.searchParams.set("social_connected", platform);

      const data = await apiClient.social.getSocialConnectUrl(
        platform,
        userId || "",
        returnTarget.toString()
      );

      if (data?.authorize_url) {
        window.location.href = data.authorize_url;
      } else {
        setOauthUnavailable(true);
        setConnecting(false);
      }
    } catch (e) {
      if (e?.status === 409 || e?.status === 501) {
        setOauthUnavailable(true);
      } else {
        setError(e?.message || "Failed to start connection.");
      }
      setConnecting(false);
    }
  };

  const handleSave = async () => {
    if (!consentChecked) {
      setError("Please check the authorization box to authorize sharing of information/content.");
      return;
    }

    const cleanUsername = (platform === "bluesky" ? bskyHandle : (username || youtubeUserId)).trim();
    const cleanPassword = (platform === "bluesky" ? bskyAppPassword : password).trim();

    if (!isConnected && (!cleanUsername || !cleanPassword)) {
      setError(`Username/handle and password are required to sign in and connect your ${label} account.`);
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const sharingData = buildSharingPayload();
      const payload = {
        ...sharingData,
        username: cleanUsername,
        password: cleanPassword,
        profile_url: profileUrl.trim(),
        feed_url: feedUrl.trim(),
        designation: designation.trim(),
      };

      if (platform === "youtube") {
        const normalizedHandle = (youtubeUserId || username).trim().replace(/^@/, "");
        payload.username = normalizedHandle || cleanUsername;
        payload.channel_handle = normalizedHandle;
        payload.channel_id = youtubeChannelId.trim();
        payload.youtube_user_id = normalizedHandle;
        payload.youtube_channel_id = youtubeChannelId.trim();
      }

      if (platform === "bluesky") {
        payload.username = cleanUsername.replace(/^@/, "");
        payload.profile_url = `https://bsky.app/profile/${payload.username}`;
        if (cleanPassword) payload.app_password = cleanPassword;
      }

      const res = await apiClient.social.saveDetails(platform, userId || "", payload);
      if (res?.token) {
        apiClient.auth.setToken(res.token);
      }
      if (res?.user?.id) {
        setUserId(res.user.id);
      }
      setSaved(true);
      setPassword("");
      setBskyAppPassword("");
      setTimeout(() => setSaved(false), 2500);
      await fetchStatus();
      onStatusChange?.();
    } catch (e) {
      setError(e?.message || "Sign in failed. Please verify credentials.");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError("");
    try {
      if (userId) {
        await apiClient.social.disconnect(platform, userId);
      }
      setStatus({ connected: false, details: {} });
      setUsername("");
      setPassword("");
      setProfileUrl("");
      setFeedUrl("");
      setDesignation("");
      setYoutubeChannelId("");
      setYoutubeUserId("");
      setBskyHandle("");
      setBskyAppPassword("");
      setAutoFilled(false);
      setConsentChecked(false);
      onStatusChange?.();
    } catch (e) {
      setError(e?.message || "Disconnect failed.");
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = status?.connected === true;
  const activeCount = Object.values(sharingPerms).filter(Boolean).length;

  return (
    <Card className="bg-card border-border shadow-sm flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <CardTitle className="font-heading text-base">{label}</CardTitle>
                <CardDescription className="text-xs flex items-center gap-1 mt-0.5">
                  {loading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : statusError ? (
                    <>
                      <AlertCircle className="w-3 h-3 text-amber-500" /> Status unavailable
                    </>
                  ) : isConnected ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500 font-bold" />
                      <span className="text-emerald-400 font-medium">
                        Connected{username ? ` as @${username.replace(/^@/, "")}` : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3 h-3" /> Not connected
                    </>
                  )}
                </CardDescription>
              </div>
            </div>
            {isConnected && (
              <div className="flex flex-col items-end gap-1">
                <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> Handshake Verified
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {platform === "bluesky" ? "AT Protocol Handshake" : "OAuth 2.0 Handshake"}
                </span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1.5">{capabilities}</p>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-md border border-destructive/30 bg-destructive/10 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && statusError && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{statusError}</p>
              <Button variant="outline" size="sm" className="w-full" onClick={fetchStatus}>
                Retry
              </Button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              NOT CONNECTED FLOW: SIGN IN + SHARING CHECKBOXES
             ══════════════════════════════════════════════════════════════ */}
          {!loading && !statusError && !isConnected && (
            <div className="space-y-4">
              {/* ── Section: Information & Content Sharing Checkboxes ── */}
              <div className="rounded-lg border border-border/80 bg-secondary/15 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span>Sharing of Information / Content</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {activeCount} of {SHARING_SCOPES.length} selected
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Check whichever boxes are necessary for sharing information and content with your {label} account:
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Authentication is completed on {label}'s official login page using your username and password, then you approve the requested permissions.
                </p>

                <div className="space-y-2 pt-1">
                  {SHARING_SCOPES.map((opt) => {
                    const OptIcon = opt.icon;
                    const isChecked = Boolean(sharingPerms[opt.key]);
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-start gap-2.5 p-2 rounded-md border transition-colors cursor-pointer select-none ${
                          isChecked
                            ? "border-primary/30 bg-primary/5 text-foreground"
                            : "border-border/60 bg-transparent text-muted-foreground hover:bg-secondary/20"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSharingPerm(opt.key)}
                          className="mt-0.5 w-4 h-4 rounded border-border accent-primary cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <OptIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>{opt.title}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                            {opt.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Mandatory Consent Box */}
                <div className="pt-2 border-t border-border/60">
                  <label className="flex items-start gap-2.5 p-2 rounded-md bg-background/80 border border-primary/20 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => {
                        setConsentChecked(e.target.checked);
                        if (error) setError("");
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-border accent-primary cursor-pointer shrink-0"
                    />
                    <span className="text-xs font-medium text-foreground leading-snug">
                      I authorize WiseRavenShare to connect with my external {label} account and share
                      information/content based on the checked boxes above.
                    </span>
                  </label>
                </div>
              </div>

              {/* ── Section: Sign In Actions ── */}
              <div className="space-y-3 rounded-lg border border-border p-3.5 bg-secondary/10">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary" /> Sign In &amp; Connect with {label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {platform === "bluesky"
                      ? "WiseRavenShare will perform an AT Protocol session handshake with bsky.social using your handle and App Password."
                      : `Enter your ${label} username and password/credential to authenticate and connect your account.`}
                  </p>
                </div>

                <div className="space-y-2.5">
                  {platform === "youtube" ? (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-1">YouTube Channel ID or Handle</Label>
                        <Input
                          value={username || youtubeUserId}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            setYoutubeUserId(e.target.value);
                          }}
                          placeholder="@channel_handle or UCxxxxxx"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-1">
                          Channel ID <span className="opacity-60">(optional if handle provided)</span>
                        </Label>
                        <Input
                          value={youtubeChannelId}
                          onChange={(e) => setYoutubeChannelId(e.target.value)}
                          placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                          className="h-9 text-sm"
                        />
                      </div>
                    </>
                  ) : platform === "bluesky" ? (
                    <div>
                      <Label className="text-xs text-muted-foreground block mb-1">Bluesky Handle</Label>
                      <Input
                        value={bskyHandle || username}
                        onChange={(e) => {
                          setBskyHandle(e.target.value);
                          setUsername(e.target.value);
                        }}
                        placeholder="yourname.bsky.social"
                        className="h-9 text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs text-muted-foreground block mb-1">Username / Handle / Email</Label>
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={
                          platform === "twitter"
                            ? "@your_x_handle"
                            : platform === "instagram"
                            ? "@your_instagram"
                            : platform === "tiktok"
                            ? "@your_tiktok"
                            : platform === "facebook"
                            ? "your_facebook_username_or_email"
                            : platform === "linkedin"
                            ? "your_linkedin_email_or_profile"
                            : `@your_${platform}_account`
                        }
                        className="h-9 text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">
                        {platform === "bluesky" ? "App Password" : "Password / App Credential"}
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                      >
                        {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password || (platform === "bluesky" ? bskyAppPassword : "")}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (platform === "bluesky") setBskyAppPassword(e.target.value);
                      }}
                      placeholder={platform === "bluesky" ? "xxxx-xxxx-xxxx-xxxx" : "Enter your account password"}
                      className="h-9 text-sm font-mono"
                    />
                    {platform === "bluesky" && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Generate an App Password from: <em>Settings → Privacy &amp; Security → App Passwords</em>.
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={
                    saving ||
                    !(username || bskyHandle || youtubeUserId).trim() ||
                    !(password || bskyAppPassword).trim() ||
                    !consentChecked
                  }
                  className="w-full font-medium text-sm h-10 shadow-sm mt-1"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Icon className={`w-4 h-4 mr-2 ${color}`} />
                  )}
                  {saving ? `Authenticating with ${label}…` : `Sign in & Connect ${label}`}
                </Button>

                {!consentChecked && (
                  <p className="text-[11px] text-amber-400 text-center">
                    * Check the authorization box above to enable {label} sign-in.
                  </p>
                )}

                {/* Alternative: OAuth 2.0 redirect button */}
                <div className="pt-2 border-t border-border/50 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleConnect}
                    disabled={connecting || !userId || !consentChecked}
                    className="text-xs text-muted-foreground hover:text-foreground h-8"
                  >
                    {connecting ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                    ) : (
                      <ExternalLink className="w-3 h-3 mr-1.5" />
                    )}
                    Or sign in via {label} website (OAuth redirect)
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              CONNECTED FLOW: MANAGE SHARING PREFERENCES + DETAILS
             ══════════════════════════════════════════════════════════════ */}
          {!loading && isConnected && (
            <div className="space-y-4">
              {autoFilled && (
                <div className="flex items-center gap-1.5 text-xs text-accent">
                  <Sparkles className="w-3.5 h-3.5" />
                  Details synced automatically from {label}
                </div>
              )}

              {/* External Profile Link */}
              {profileUrl && (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View your {label} profile
                </a>
              )}

              {/* ── Active Sharing & Content Permissions Section ── */}
              <div className="rounded-lg border border-border/80 bg-secondary/15 p-3.5 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowPermissions((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Sharing & Content Permissions</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span>{activeCount} active</span>
                    {showPermissions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                </button>

                {showPermissions && (
                  <div className="space-y-2 pt-1 animate-in fade-in-50 duration-150">
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Toggle whichever boxes are active for sharing information and content between accounts:
                    </p>
                    {SHARING_SCOPES.map((opt) => {
                      const OptIcon = opt.icon;
                      const isChecked = Boolean(sharingPerms[opt.key]);
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-2.5 p-2 rounded-md border transition-colors cursor-pointer select-none ${
                            isChecked
                              ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
                              : "border-border/60 bg-transparent text-muted-foreground hover:bg-secondary/20"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSharingPerm(opt.key)}
                            className="mt-0.5 w-4 h-4 rounded border-border accent-emerald-500 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                              <OptIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span>{opt.title}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                              {opt.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}

                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      size="sm"
                      className="w-full mt-2 font-medium"
                    >
                      {saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      ) : saved ? (
                        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                      ) : (
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {saving ? "Saving preferences…" : saved ? "Permissions Saved!" : "Save Sharing Preferences"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Edit Details Toggle */}
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors block"
              >
                {showDetails ? "Hide account details" : "Edit handle / channel details"}
              </button>

              {showDetails && (
                <ProfileFields
                  platform={platform}
                  username={username}
                  setUsername={setUsername}
                  profileUrl={profileUrl}
                  setProfileUrl={setProfileUrl}
                  feedUrl={feedUrl}
                  setFeedUrl={setFeedUrl}
                  designation={designation}
                  setDesignation={setDesignation}
                  youtubeChannelId={youtubeChannelId}
                  setYoutubeChannelId={setYoutubeChannelId}
                  youtubeUserId={youtubeUserId}
                  setYoutubeUserId={setYoutubeUserId}
                  autoFilled={autoFilled}
                />
              )}

              {/* Bottom Actions */}
              <div className="flex gap-2 pt-1">
                {showDetails && (
                  <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1">
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : saved ? (
                      <Check className="w-3.5 h-3.5 mr-1.5 text-green-400" />
                    ) : (
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {saving ? "Saving…" : saved ? "Saved!" : "Save Details"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className={`text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5 ${
                    showDetails ? "" : "w-full"
                  }`}
                >
                  {disconnecting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Disconnect {label}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}

function ProfileFields({
  platform,
  username,
  setUsername,
  profileUrl,
  setProfileUrl,
  feedUrl,
  setFeedUrl,
  designation,
  setDesignation,
  youtubeChannelId,
  setYoutubeChannelId,
  youtubeUserId,
  setYoutubeUserId,
  autoFilled,
}) {
  const hint = PLATFORM_URL_HINTS[platform] || "https://example.com/profile";
  const badgeCls = autoFilled ? "ring-1 ring-accent/40 bg-accent/5" : "";

  return (
    <div className={`space-y-3 rounded-md p-3 border border-border ${badgeCls}`}>
      {platform === "youtube" ? (
        <>
          <Label className="text-xs text-muted-foreground mb-1 block">YouTube Channel ID</Label>
          <Input
            value={youtubeChannelId}
            onChange={(e) => setYoutubeChannelId(e.target.value)}
            placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
            className="h-9 text-sm"
          />
          <Label className="text-xs text-muted-foreground mb-1 mt-3 block">YouTube User ID / Handle</Label>
          <Input
            value={youtubeUserId}
            onChange={(e) => {
              setYoutubeUserId(e.target.value);
              setUsername(e.target.value);
            }}
            placeholder="@yourhandle"
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
            Find Channel ID in YouTube Studio → Settings → Channel → Advanced settings.
          </p>
        </>
      ) : (
        <>
          <Label className="text-xs text-muted-foreground mb-1 block">Username / Handle</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={`@your_${platform}_handle`}
            className="h-9 text-sm"
          />
        </>
      )}
      <Label className="text-xs text-muted-foreground mb-1 block">Profile URL</Label>
      <Input
        value={profileUrl}
        onChange={(e) => setProfileUrl(e.target.value)}
        placeholder={hint}
        className="h-9 text-sm"
      />
      <Label className="text-xs text-muted-foreground mb-1 block">Display Name / Designation</Label>
      <Input
        value={designation}
        onChange={(e) => setDesignation(e.target.value)}
        placeholder="Name shown on that platform"
        className="h-9 text-sm"
      />
      {["facebook", "instagram", "tiktok", "youtube"].includes(platform) && (
        <>
          <Label className="text-xs text-muted-foreground mb-1 block">
            Feed / Page URL <span className="opacity-60">(optional)</span>
          </Label>
          <Input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://…"
            className="h-9 text-sm"
          />
        </>
      )}
    </div>
  );
}
