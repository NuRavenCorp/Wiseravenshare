import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { MessageCircle, Loader2, Users, ArrowRight, ChevronDown, ChevronRight, Bell, Heart, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThreadConversation from "./ThreadConversation";

export default function ThreadsWidget() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const fetchThreadsData = useCallback(async () => {
    try {
      const [conversationRes, notificationRes, postRes] = await Promise.all([
        apiClient.entities.Conversation.filter(
          {},
          { sort: "-last_message_at", limit: 10 }
        ),
        user
          ? apiClient.entities.Notification.filter(
              { recipient_id: user.id },
              { sort: "-created_date", limit: 6 }
            )
          : Promise.resolve({ items: [] }),
        user
          ? apiClient.entities.Post.filter(
              { created_by_id: user.id, status: "published" },
              { sort: "-created_date", limit: 5 }
            )
          : Promise.resolve({ items: [] }),
      ]);
      setConversations(conversationRes.items || []);
      setNotifications(notificationRes.items || []);
      setRecentPosts(postRes.items || []);
    } catch {
      setConversations([]);
      setNotifications([]);
      setRecentPosts([]);
    }
  }, [user]);

  useEffect(() => {
    fetchThreadsData().finally(() => setLoading(false));
    const unsubConversation = apiClient.entities.Conversation.subscribe(() => fetchThreadsData());
    const unsubNotification = apiClient.entities.Notification.subscribe(() => fetchThreadsData());
    const unsubPost = apiClient.entities.Post.subscribe(() => fetchThreadsData());
    return () => {
      unsubConversation?.();
      unsubNotification?.();
      unsubPost?.();
    };
  }, [fetchThreadsData]);

  useEffect(() => {
    if (!user || conversations.length === 0) return;
    const otherIds = conversations
      .map((c) => c.participants?.find((id) => id !== user.id))
      .filter(Boolean);
    if (otherIds.length === 0) return;
    apiClient.entities.UserProfile.filter(
      { created_by_id: { $in: otherIds } },
      { limit: 50 }
    ).then((res) => {
      const map = {};
      (res.items || []).forEach((p) => {
        map[p.created_by_id] = p;
      });
      setProfiles(map);
    });
  }, [user, conversations]);

  const getDisplayName = (conv) => {
    if (conv.type === "group" && conv.title) return conv.title;
    const otherId = conv.participants?.find((id) => id !== user?.id);
    return profiles[otherId]?.display_name || "Direct Message";
  };

  const formatTime = (ts) => {
    if (!ts) return "New";
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  const toEpoch = (value) => {
    if (!value) return 0;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
  };

  const unifiedItems = [
    ...conversations.map((conv) => ({
      type: "conversation",
      id: conv.id,
      timestamp: toEpoch(conv.last_message_at || conv.updated_date || conv.created_date),
      data: conv,
    })),
    ...notifications.map((notif) => ({
      type: "notification",
      id: notif.id,
      timestamp: toEpoch(notif.created_date || notif.updated_date),
      data: notif,
    })),
    ...recentPosts.map((post) => ({
      type: "post",
      id: post.id,
      timestamp: toEpoch(post.created_date || post.updated_date),
      data: post,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-lg text-foreground">Unified Threads</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
              Messages + Posts + Notifications
            </span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/messages">
              Open Messages <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : unifiedItems.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              No thread activity yet. Start messaging or posting to build your stream.
            </p>
            <Button asChild size="sm">
              <Link to="/messages">Go to Messages</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {unifiedItems.map((item) => {
              if (item.type === "conversation") {
                const conv = item.data;
                const isExpanded = expandedId === conv.id;
                return (
                  <div
                    key={`conversation-${conv.id}`}
                    className={`rounded-lg border transition-colors overflow-hidden ${
                      isExpanded ? "border-primary/40" : "border-border"
                    }`}
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : conv.id)}
                      className="w-full flex items-center gap-3 p-3 bg-secondary/30 hover:bg-secondary/60 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        {conv.type === "group" ? (
                          <Users className="w-4 h-4 text-primary" />
                        ) : (
                          <MessageCircle className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {getDisplayName(conv)}
                          </p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                            Message
                          </span>
                          {conv.type === "group" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent-foreground shrink-0">
                              Group
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(conv.last_message_at)}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                    {isExpanded && (
                      <ThreadConversation
                        conversation={conv}
                        currentUserId={user?.id}
                        profiles={profiles}
                      />
                    )}
                  </div>
                );
              }

              if (item.type === "notification") {
                const n = item.data;
                return (
                  <div key={`notification-${n.id}`} className={`rounded-lg p-3 border ${n.read ? "border-border bg-background/40" : "border-primary/30 bg-primary/5"}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        <Bell className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Notification</span>
                          {!n.read && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                              New
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground mt-1">{n.message}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {n.created_date ? new Date(n.created_date).toLocaleString() : "now"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              const post = item.data;
              return (
                <div key={`post-${post.id}`} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Heart className="w-4 h-4 text-primary" />
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Post</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {post.created_date ? formatTime(post.created_date) : "now"}
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-2">{post.content || "(media post)"}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.like_count || 0}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.comment_count || 0}</span>
                    <span className="flex items-center gap-1"><Repeat2 className="w-3 h-3" />{post.repost_count || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}