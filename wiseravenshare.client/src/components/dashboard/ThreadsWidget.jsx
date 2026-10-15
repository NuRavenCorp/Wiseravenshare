import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { MessageCircle, Loader2, Users, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThreadConversation from "./ThreadConversation";

export default function ThreadsWidget() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiClient.entities.Conversation.filter(
        {},
        { sort: "-last_message_at", limit: 10 }
      );
      setConversations(res.items || []);
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    fetchConversations().finally(() => setLoading(false));
    const unsub = apiClient.entities.Conversation.subscribe(() => fetchConversations());
    return unsub;
  }, [fetchConversations]);

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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <h2 className="font-heading text-lg text-foreground">Conversation Threads</h2>
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
        ) : conversations.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              No conversation threads yet. Start messaging from the Messages page.
            </p>
            <Button asChild size="sm">
              <Link to="/messages">Go to Messages</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => {
              const isExpanded = expandedId === conv.id;
              return (
                <div
                  key={conv.id}
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}