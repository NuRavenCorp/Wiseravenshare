import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Link } from "react-router-dom";
import { Bell, CalendarClock, Activity, CheckCircle2, Circle, Heart, MessageCircle, Repeat2, Share2, Music, Users, UserPlus, ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const NOTIF_ICONS = {
  like: Heart, Like: Heart,
  comment: MessageCircle, Comment: MessageCircle,
  follow: Users, Follow: Users,
  repost: Repeat2, Repost: Repeat2,
  dm: MessageCircle,
  badge: CheckCircle2, Badge: CheckCircle2,
  truth_score: Activity, TruthScore: Activity,
  system: Bell, System: Bell,
};

const POLL_MS = 30_000;

export default function ActivityHub() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jamSessions, setJamSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [likeTally, setLikeTally] = useState({ total: 0, unread: 0 });
  const [followTally, setFollowTally] = useState({ followers: 0, following: 0, newFollowers: 0 });
  const [markingRead, setMarkingRead] = useState(false);
  const { toast } = useToast();

  const fetchNotifications = useCallback(async (userId) => {
    try {
      const res = await apiClient.notifications.list(1, 20);
      const items = res?.items || [];
      setNotifications(items);
      const likeNotifs = items.filter((n) => {
        const t = n.type || n.Type || "";
        return t === "like" || t === "Like";
      });
      const unreadLikes = likeNotifs.filter((n) => !(n.IsRead ?? n.isRead)).length;
      setLikeTally((prev) => ({ total: prev.total, unread: unreadLikes }));

      // Count unread follow notifications
      const followNotifs = items.filter((n) => {
        const t = n.type || n.Type || "";
        return t === "follow" || t === "Follow";
      });
      const unreadFollows = followNotifs.filter((n) => !(n.IsRead ?? n.isRead)).length;
      setFollowTally((prev) => ({ ...prev, newFollowers: unreadFollows }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await apiClient.auth.me();
        if (!mounted) return;
        setUser(me);

        const [jamRes, postRes] = await Promise.all([
          apiClient.entities.JamSession.filter(
            { participants: me.id, status: { $in: ["scheduled", "active"] } },
            { sort: "scheduled_date", limit: 5 }
          ).catch(() => ({ items: [] })),
          apiClient.entities.Post.filter(
            { created_by_id: me.id, status: "published" },
            { sort: "-created_date", limit: 5 }
          ).catch(() => ({ items: [] })),
        ]);

        if (!mounted) return;
        const posts = postRes.items || [];
        setJamSessions(jamRes.items || []);
        setRecentPosts(posts);

        // Cumulative likes tally across all my posts
        const totalLikes = posts.reduce((sum, p) => sum + (p.like_count || p.likesCount || 0), 0);
        setLikeTally((prev) => ({ ...prev, total: totalLikes }));

        // Fetch follow stats
        try {
          const [followingRes, followersRes] = await Promise.all([
            apiClient.follows.following().catch(() => null),
            apiClient.follows.followers(me.id).catch(() => null),
          ]);
          setFollowTally((prev) => ({
            ...prev,
            following: followingRes?.followingCount ?? 0,
            followers: followersRes?.followersCount ?? 0,
          }));
        } catch { /* non-critical */ }

        await fetchNotifications(me.id);
      } catch (e) {
        console.error("Activity hub error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fetchNotifications]);

  // Poll for new notifications every 30s
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => fetchNotifications(user.id), POLL_MS);
    return () => clearInterval(timer);
  }, [user, fetchNotifications]);

  const markAllRead = async () => {
    if (!user) return;
    setMarkingRead(true);
    try {
      await apiClient.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, IsRead: true, isRead: true })));
      setLikeTally((prev) => ({ ...prev, unread: 0 }));
    } catch (e) {
      toast({ title: "Could not mark notifications as read", variant: "destructive" });
    } finally {
      setMarkingRead(false);
    }
  };

  const markOneRead = async (n) => {
    const isRead = n.IsRead ?? n.isRead;
    if (isRead) return;
    try {
      await apiClient.notifications.markRead(n.Id ?? n.id);
      setNotifications((prev) =>
        prev.map((item) => (item.Id === n.Id || item.id === n.id) ? { ...item, IsRead: true, isRead: true } : item)
      );
      const t = n.type || n.Type || "";
      if (t === "like" || t === "Like") {
        setLikeTally((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
      }
    } catch { /* best effort */ }
  };

  const formatSessionDate = (dateStr) => {
    if (!dateStr) return "Not scheduled";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d - now;
    const hours = Math.floor(diff / 3600000);
    if (diff < 0) return "Started";
    if (hours < 1) return "Starting soon";
    if (hours < 24) return `In ${hours}h`;
    return `In ${Math.floor(hours / 24)} days`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !(n.IsRead ?? n.isRead)).length;

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

      {/* Persistent Like Tally */}
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-red-400" />
          <h2 className="font-heading text-sm text-foreground tracking-wide">Your Likes</h2>
          {likeTally.unread > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse">
              {likeTally.unread} new ♥
            </span>
          )}
        </div>
        <div className="flex items-end gap-6">
          <div>
            <p className="text-3xl font-heading text-foreground">{likeTally.total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">total likes on your posts</p>
          </div>
          {likeTally.unread > 0 && (
            <div>
              <p className="text-xl font-heading text-red-400">+{likeTally.unread}</p>
              <p className="text-xs text-muted-foreground mt-0.5">since last check</p>
            </div>
          )}
        </div>
      </section>

      {/* Followers & Following Tally */}
      <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="w-4 h-4 text-emerald-400" />
          <h2 className="font-heading text-sm text-foreground tracking-wide">Your Flock</h2>
          {followTally.newFollowers > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 animate-pulse">
              +{followTally.newFollowers} new
            </span>
          )}
        </div>
        <div className="flex items-end gap-8">
          <div>
            <p className="text-3xl font-heading text-foreground">{(followTally.followers).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">followers</p>
          </div>
          <div>
            <p className="text-3xl font-heading text-foreground">{(followTally.following).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">following</p>
          </div>
          {followTally.newFollowers > 0 && (
            <div>
              <p className="text-xl font-heading text-emerald-400">+{followTally.newFollowers}</p>
              <p className="text-xs text-muted-foreground mt-0.5">since last check</p>
            </div>
          )}
        </div>
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
              const type = n.type || n.Type || "system";
              const Icon = NOTIF_ICONS[type] || Bell;
              const isRead = n.IsRead ?? n.isRead ?? false;
              const content = n.Content ?? n.content ?? n.message ?? "";
              const createdAt = n.CreatedAt ?? n.created_date ?? n.createdAt;
              return (
                <button
                  key={n.Id ?? n.id}
                  onClick={() => markOneRead(n)}
                  className={`w-full flex items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-secondary/50 ${
                    isRead ? "bg-transparent" : "bg-primary/5 border border-primary/20"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isRead ? "bg-secondary text-muted-foreground" : "bg-primary/15 text-primary"
                  }`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{content}</p>
                    {createdAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  {!isRead && <Circle className="w-2.5 h-2.5 text-primary fill-primary shrink-0 mt-2" />}
                </button>
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
                    <Heart className="w-3 h-3" /> {post.like_count || post.likesCount || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" /> {post.comment_count || post.commentsCount || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Repeat2 className="w-3 h-3" /> {post.repost_count || post.repostsCount || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Share2 className="w-3 h-3" /> {post.share_count || post.sharesCount || 0}
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
    </div>
  );
}