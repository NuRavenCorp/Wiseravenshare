import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Link } from "react-router-dom";
import { Bell, CalendarClock, Activity, CheckCircle2, Circle, Heart, MessageCircle, Repeat2, Share2, Music, Users, ArrowRight, Calculator, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const NOTIF_ICONS = {
  like: Heart,
  comment: MessageCircle,
  follow: Users,
  dm: MessageCircle,
  badge: CheckCircle2,
  truth_score: Activity,
  system: Bell,
};

export default function ActivityHub() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jamSessions, setJamSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [markingRead, setMarkingRead] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await apiClient.auth.me();
        if (!mounted) return;
        setUser(me);

        const [jamRes, notifRes, postRes] = await Promise.all([
          apiClient.entities.JamSession.filter(
            { participants: me.id, status: { $in: ["scheduled", "active"] } },
            { sort: "scheduled_date", limit: 5 }
          ),
          apiClient.entities.Notification.filter(
            { recipient_id: me.id },
            { sort: "-created_date", limit: 8 }
          ),
          apiClient.entities.Post.filter(
            { created_by_id: me.id, status: "published" },
            { sort: "-created_date", limit: 5 }
          ),
        ]);

        if (!mounted) return;
        setJamSessions(jamRes.items || []);
        setNotifications(notifRes.items || []);
        setRecentPosts(postRes.items || []);
      } catch (e) {
        console.error("Activity hub error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setMarkingRead(true);
    try {
      await apiClient.entities.Notification.bulkUpdate(
        unread.map((n) => ({ id: n.id, read: true }))
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      toast({ title: "Could not mark notifications as read", variant: "destructive" });
    } finally {
      setMarkingRead(false);
    }
  };

  const formatSessionDate = (dateStr) => {
    if (!dateStr) return "Not scheduled";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d - now;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    if (diff < 0) return "Started";
    if (hours < 1) return "Starting soon";
    if (hours < 24) return `In ${hours}h`;
    if (days === 1) return "Tomorrow";
    return `In ${days} days`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      {/* Jam Session Reminders */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock className="w-4 h-4 text-accent" />
          <h2 className="font-heading text-sm text-foreground tracking-wide">Jam Session Reminders</h2>
        </div>
        {jamSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">No upcoming jam sessions.</p>
        ) : (
          <div className="space-y-2">
            {jamSessions.map((jam) => (
              <div key={jam.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
                <div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{jam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {jam.scheduled_date
                      ? new Date(jam.scheduled_date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : "Unscheduled"}
                    {" · "}
                    {formatSessionDate(jam.scheduled_date)}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                  jam.status === "active"
                    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                    : "border-border text-muted-foreground"
                }`}>
                  {jam.status === "active" ? "Live now" : "Scheduled"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notifications */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h2 className="font-heading text-sm text-foreground tracking-wide">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} disabled={markingRead}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark all read
            </Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">No notifications yet.</p>
        ) : (
          <div className="space-y-1">
            {notifications.map((n) => {
              const Icon = NOTIF_ICONS[n.type] || Bell;
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 rounded-lg p-3 transition-colors ${
                    n.read ? "bg-transparent" : "bg-primary/5 border border-primary/20"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    n.read ? "bg-secondary text-muted-foreground" : "bg-primary/15 text-primary"
                  }`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(n.created_date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  {!n.read && <Circle className="w-2.5 h-2.5 text-primary fill-primary shrink-0 mt-2" />}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="font-heading text-sm text-foreground tracking-wide">Your Recent Activity</h2>
        </div>
        {recentPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">No posts yet. Start sharing your truth!</p>
        ) : (
          <div className="space-y-2">
            {recentPosts.map((post) => (
              <div key={post.id} className="rounded-lg border border-border bg-background/50 p-3">
                <p className="text-sm text-foreground line-clamp-2 mb-2">
                  {post.content || "(media post)"}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3" /> {post.like_count || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" /> {post.comment_count || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Repeat2 className="w-3 h-3" /> {post.repost_count || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Share2 className="w-3 h-3" /> {post.share_count || 0}
                  </span>
                  <span className="ml-auto">
                    {new Date(post.created_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link to="/social" className="block text-center mt-3">
          <Button variant="outline" size="sm">View All Posts</Button>
        </Link>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-4 h-4 text-accent" />
          <h2 className="font-heading text-sm text-foreground tracking-wide">Labs & Tools</h2>
        </div>
        <div className="space-y-3">
          <Link
            to="/webrtc-studio"
            className="group flex items-center gap-4 rounded-xl border border-border bg-background/50 p-4 transition-colors hover:border-primary/40 hover:bg-background"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shrink-0">
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">WebRTC Studio</p>
              <p className="text-xs text-muted-foreground">
                Launch a live browser-based camera session, share a join link, and monitor incoming remote feeds.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
          </Link>
          <Link
            to="/matrix-lab"
            className="group flex items-center gap-4 rounded-xl border border-border bg-background/50 p-4 transition-colors hover:border-primary/40 hover:bg-background"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shrink-0">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Python Matrix Lab</p>
              <p className="text-xs text-muted-foreground">
                Run transpose and multiplication jobs, inspect service health, and review history stored in PostgreSQL.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
          </Link>
        </div>
      </section>
    </div>
  );
}