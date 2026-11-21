import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { playChirp } from "@/lib/ravenChirp";
import { Bell, Check, MessageCircle, Heart, MessageSquare, UserPlus, Award, ShieldCheck, Repeat2 } from "lucide-react";
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
};

const POLL_INTERVAL_MS = 30_000;

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
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

  // Fetch full list (on open)
  const fetchList = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.notifications.list(1, 20);
      setNotifications(res?.items || []);
      const count = (res?.items || []).filter((n) => !n.IsRead && !n.isRead).length;
      setUnread(count);
      prevUnread.current = count;
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    fetchCount();
    const timer = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchCount]);

  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

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
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-popover shadow-xl z-50">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="font-heading text-sm text-foreground">
              RavenChirp Alerts
              {unread > 0 && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">{unread} new</span>
              )}
            </span>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7">
                <Check className="w-3 h-3" /> Mark all read
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No notifications yet</p>
            ) : (
              notifications.map((n) => {
                const type = n.type || n.Type || "system";
                const Icon = typeIcons[type] || Bell;
                const isRead = n.IsRead ?? n.isRead ?? false;
                const content = n.Content ?? n.content ?? n.message ?? "";
                const createdAt = n.CreatedAt ?? n.created_date ?? n.createdAt;
                return (
                  <button
                    key={n.Id ?? n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 p-3 border-b border-border/50 hover:bg-secondary/50 text-left transition-colors ${!isRead ? "bg-primary/5" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${!isRead ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{content}</p>
                      {createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(createdAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {!isRead && <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
