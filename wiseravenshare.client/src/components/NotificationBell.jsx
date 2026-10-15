import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { playChirp } from "@/lib/ravenChirp";
import { Bell, Check, MessageCircle, Heart, MessageSquare, UserPlus, Award, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const typeIcons = {
  dm: MessageCircle,
  like: Heart,
  comment: MessageSquare,
  follow: UserPlus,
  system: Bell,
  badge: Award,
  truth_score: ShieldCheck,
};

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.entities.Notification.filter(
        { recipient_id: user.id },
        { sort: "-created_date", limit: 20 }
      );
      setNotifications(res.items || []);
    } catch {
      setNotifications([]);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    if (!user) return;
    const unsub = apiClient.entities.Notification.subscribe(() => fetchNotifications());
    return unsub;
  }, [user, fetchNotifications]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const prevUnread = useRef(0);

  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      playChirp();
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  const markAllRead = async () => {
    if (unreadCount === 0 || !user) return;
    await apiClient.entities.Notification.updateMany(
      { recipient_id: user.id, read: false },
      { $set: { read: true } }
    );
    fetchNotifications();
  };

  const handleClick = async (n) => {
    if (!n.read) {
      await apiClient.entities.Notification.update(n.id, { read: true });
      fetchNotifications();
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-secondary transition-colors"
        aria-label="Notifications"
      >
        <Bell className={`w-5 h-5 text-foreground ${unreadCount > 0 ? "animate-pulse" : ""}`} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-popover shadow-xl z-50">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="font-heading text-sm text-foreground">RavenChirp Alerts</span>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7">
                <Check className="w-3 h-3" /> Mark read
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No notifications yet</p>
            ) : (
              notifications.map((n) => {
                const Icon = typeIcons[n.type] || Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 p-3 border-b border-border/50 hover:bg-secondary/50 text-left transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(n.created_date).toLocaleString()}
                      </p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />}
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