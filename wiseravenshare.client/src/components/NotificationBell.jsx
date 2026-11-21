import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { playChirp } from "@/lib/ravenChirp";
import { 
  Bell, Check, MessageCircle, Heart, MessageSquare, 
  UserPlus, Award, ShieldCheck, Repeat2, Flame, ExternalLink, Radio 
} from "lucide-react";
import { Button } from "@/components/ui/button";

const typeIcons = {
  dm: MessageCircle,
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
  badge: Award,
  Badge: Award,
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

const POLL_INTERVAL_MS = 30_000;

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const ref = useRef(null);
  const prevUnread = useRef(0);

  // Fetch count only (lightweight poll)
  const fetchCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.notifications.unreadCount();
      const count = res?.unread ?? 0;
      setUnread(count);
      if (count > prevUnread.current) playChirp();
      prevUnread.current = count;
    } catch { /* ignore */ }
  }, [user]);

  // Fetch full list (on open or filter change)
  const fetchList = useCallback(async (selectedFilter = filter) => {
    if (!user) return;
    try {
      const filterParam = selectedFilter === "all" ? "" : selectedFilter;
      const res = await apiClient.notifications.list(1, 30, filterParam);
      setNotifications(res?.items || []);
      const count = (res?.items || []).filter((n) => !n.IsRead && !n.isRead).length;
      if (selectedFilter === "all") {
        setUnread(count);
        prevUnread.current = count;
      }
    } catch { /* ignore */ }
  }, [user, filter]);

  useEffect(() => {
    fetchCount();
    const timer = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchCount]);

  useEffect(() => {
    if (open) fetchList(filter);
  }, [open, filter, fetchList]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    if (!user) return;
    try {
      await apiClient.notifications.markAllRead();
      setUnread(0);
      prevUnread.current = 0;
      setNotifications((prev) => prev.map((n) => ({ ...n, IsRead: true, isRead: true })));
    } catch { /* ignore */ }
  };

  const handleClick = async (n) => {
    const isRead = n.IsRead ?? n.isRead;
    if (!isRead) {
      try { await apiClient.notifications.markRead(n.Id ?? n.id); } catch { /* best effort */ }
      setNotifications((prev) =>
        prev.map((item) => (item.Id === n.Id || item.id === n.id) ? { ...item, IsRead: true, isRead: true } : item)
      );
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    const link = n.link || n.Link;
    if (link) navigate(link);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-secondary transition-colors"
        aria-label="Notifications"
      >
        <Bell className={`w-5 h-5 text-foreground ${unread > 0 ? "animate-pulse" : ""}`} />
        {unread > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 rounded-xl border border-border bg-popover shadow-2xl z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="font-heading font-semibold text-sm text-foreground">RavenChirp Alerts</span>
              {unread > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground">
                <Check className="w-3.5 h-3.5" /> Mark read
              </Button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1 p-2 border-b border-border/60 bg-background/50 overflow-x-auto text-xs">
            {[
              { id: "all", label: "All" },
              { id: "follow", label: "Follows" },
              { id: "comment", label: "Comments" },
              { id: "viral", label: "🔥 Viral" },
              { id: "like", label: "Likes" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium whitespace-nowrap ${
                  filter === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border/40">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No notifications in this view</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">You're completely up to date!</p>
              </div>
            ) : (
              notifications.map((n) => {
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
                  <button
                    key={n.Id ?? n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 p-3.5 hover:bg-secondary/60 text-left transition-colors relative ${
                      !isRead ? "bg-primary/5" : ""
                    }`}
                  >
                    {/* Avatar or Icon Badge */}
                    <div className="relative shrink-0">
                      {actorAvatar ? (
                        <img
                          src={actorAvatar}
                          alt={actorName || "User"}
                          className="w-9 h-9 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            isViral
                              ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                              : !isRead
                              ? "bg-primary/20 text-primary border border-primary/30"
                              : "bg-secondary text-muted-foreground border border-border"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
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

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {title && isViral && (
                        <p className="text-xs font-semibold text-amber-500 flex items-center gap-1 mb-0.5">
                          <Flame className="w-3.5 h-3.5 fill-amber-500" /> {title}
                        </p>
                      )}
                      <p className="text-xs font-medium text-foreground leading-snug">
                        {actorHandle && (
                          <span className="font-semibold text-primary mr-1">@{actorHandle}</span>
                        )}
                        {content}
                      </p>
                      {postTitle && (
                        <p className="text-[11px] text-muted-foreground/90 italic truncate mt-0.5 border-l-2 border-primary/40 pl-1.5 my-1">
                          "{postTitle}"
                        </p>
                      )}
                      {createdAt && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatRelativeTime(createdAt)}
                        </p>
                      )}
                    </div>

                    {/* Unread indicator */}
                    {!isRead && (
                      <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-border bg-muted/20 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                navigate("/notifications");
              }}
              className="w-full text-xs text-primary hover:text-primary font-medium flex items-center justify-center gap-1.5 h-8"
            >
              <span>View All Alerts in Notifications Center</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
