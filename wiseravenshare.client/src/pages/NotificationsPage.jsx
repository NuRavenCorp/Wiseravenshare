import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/landing/Navbar";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { playChirp } from "@/lib/ravenChirp";
import { 
  Bell, Check, MessageSquare, Heart, UserPlus, Repeat2, 
  Flame, Radio, ShieldCheck, Sparkles, RefreshCw, ExternalLink, Bot 
} from "lucide-react";
import { Button } from "@/components/ui/button";

const typeIcons = {
  dm: MessageSquare,
  like: Heart,
  Like: Heart,
  comment: MessageSquare,
  Comment: MessageSquare,
  follow: UserPlus,
  Follow: UserPlus,
  repost: Repeat2,
  Repost: Repeat2,
  system: Bell,
  System: Bell,
  truth_score: ShieldCheck,
  TruthScore: ShieldCheck,
  viral: Flame,
  Viral: Flame,
  ViralContent: Flame,
  viral_content: Flame,
  ViralAlert: Flame,
  LiveStream: Radio,
  livestream: Radio,
};

function formatRelativeTime(dateString) {
  if (!dateString) return "";
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [botStatus, setBotStatus] = useState(null);
  const [triggeringBots, setTriggeringBots] = useState(false);

  const fetchNotifications = useCallback(async (selectedFilter = filter) => {
    if (!user) return;
    try {
      setLoading(true);
      const filterParam = selectedFilter === "all" ? "" : selectedFilter;
      const res = await apiClient.notifications.list(1, 50, filterParam);
      setNotifications(res?.items || []);
      const unread = (res?.items || []).filter((n) => !n.IsRead && !n.isRead).length;
      if (selectedFilter === "all") {
        setUnreadCount(unread);
      }
    } catch (err) {
      console.warn("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  const fetchBotStatus = useCallback(async () => {
    try {
      const res = await apiClient.engagementBots.status();
      setBotStatus(res);
    } catch { /* best effort */ }
  }, []);

  useEffect(() => {
    fetchNotifications(filter);
    fetchBotStatus();
  }, [fetchNotifications, fetchBotStatus, filter]);

  const handleMarkAllRead = async () => {
    try {
      await apiClient.notifications.markAllRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, IsRead: true, isRead: true })));
    } catch (err) {
      console.warn("Failed marking all read", err);
    }
  };

  const handleNotificationClick = async (n) => {
    const isRead = n.IsRead ?? n.isRead;
    if (!isRead) {
      try {
        await apiClient.notifications.markRead(n.Id ?? n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.Id === n.Id || item.id === n.id) ? { ...item, IsRead: true, isRead: true } : item)
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch { /* best effort */ }
    }

    const link = n.link || n.Link;
    if (link) {
      navigate(link);
    }
  };

  const handleTriggerBots = async () => {
    try {
      setTriggeringBots(true);
      await apiClient.engagementBots.trigger();
      playChirp();
      await fetchBotStatus();
      await fetchNotifications(filter);
    } catch (err) {
      console.warn("Failed triggering bots", err);
    } finally {
      setTriggeringBots(false);
    }
  };

  const filterTabs = [
    { id: "all", label: "All Activity" },
    { id: "follow", label: "Followers", icon: UserPlus },
    { id: "comment", label: "Comments", icon: MessageSquare },
    { id: "viral", label: "🔥 Viral Alerts", icon: Flame },
    { id: "like", label: "Likes & Reposts", icon: Heart },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground flex items-center gap-2">
                <Bell className="w-7 h-7 text-primary" /> Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-primary/20 text-primary font-semibold">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time alerts for follows, comments, viral content, and community interactions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNotifications(filter)}
              className="text-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Engagement Bots Overview Card (Shows active personas, 28h/6h cycle status, and response testing) */}
        {botStatus && (
          <div className="my-6 p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Authentic Engagement Simulator</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
                    {botStatus.activePersonas || 14} Active / {botStatus.restingPersonas || 0} Resting
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  14 unique creator personas posting every 3 hours (28h active / 6h rest cycle) & responding contextually to test site response ability.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTriggerBots}
              disabled={triggeringBots}
              className="text-xs gap-1.5 shrink-0 bg-background/80 hover:bg-background"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              {triggeringBots ? "Probing..." : "Test Cadence Tick"}
            </Button>
          </div>
        )}

        {/* Filter Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-border/80 overflow-x-auto pb-2 mb-6">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all whitespace-nowrap ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Notifications Feed */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading your alerts...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-border rounded-2xl bg-card/30">
            <Bell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground">No notifications yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
              When other creators follow you, comment on your posts, or your content goes viral, notifications will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const type = n.type || n.Type || "system";
              const isViral = type.toLowerCase().includes("viral");
              const Icon = typeIcons[type] || Bell;
              const isRead = n.IsRead ?? n.isRead ?? false;
              const content = n.Content ?? n.content ?? n.message ?? "";
              const title = n.title || n.Title;
              const actorName = n.actorName || n.ActorName;
              const actorHandle = n.actorHandle || n.ActorHandle;
              const actorAvatar = n.actorAvatar || n.ActorAvatar;
              const postTitle = n.postTitle || n.PostTitle;
              const createdAt = n.CreatedAt ?? n.created_date ?? n.createdAt;

              return (
                <div
                  key={n.Id ?? n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                    isViral
                      ? "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50 shadow-sm"
                      : !isRead
                      ? "bg-primary/5 border-primary/25 hover:border-primary/40 shadow-sm"
                      : "bg-card/70 border-border/70 hover:border-border hover:bg-card"
                  }`}
                >
                  {/* Avatar / Icon Badge */}
                  <div className="relative shrink-0">
                    {actorAvatar ? (
                      <img
                        src={actorAvatar}
                        alt={actorName || "User"}
                        className="w-10 h-10 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          isViral
                            ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                            : !isRead
                            ? "bg-primary/20 text-primary border border-primary/30"
                            : "bg-secondary text-muted-foreground border border-border"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                    )}
                    {actorAvatar && (
                      <div
                        className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                          isViral ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"
                        }`}
                      >
                        <Icon className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isViral && (
                          <span className="text-xs font-bold text-amber-500 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15">
                            <Flame className="w-3 h-3 fill-amber-500" /> Viral Alert
                          </span>
                        )}
                        {actorName && (
                          <span className="font-semibold text-sm text-foreground">{actorName}</span>
                        )}
                        {actorHandle && (
                          <span className="text-xs text-muted-foreground">@{actorHandle}</span>
                        )}
                      </div>
                      {createdAt && (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatRelativeTime(createdAt)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-foreground mt-1">
                      {content}
                    </p>

                    {postTitle && (
                      <div className="mt-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg p-2.5 border border-border/50 truncate flex items-center justify-between gap-2">
                        <span className="truncate italic">"{postTitle}"</span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                      </div>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!isRead && (
                    <div className="w-2.5 h-2.5 rounded-full bg-accent shrink-0 mt-2" title="Unread" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
