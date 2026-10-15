import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import Navbar from "@/components/landing/Navbar";
import ConversationList from "@/components/messages/ConversationList";
import ChatView from "@/components/messages/ChatView";

export default function Messages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiClient.entities.Conversation.filter(
        {},
        { sort: "-last_message_at", limit: 50 }
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

  const selected = conversations.find((c) => c.id === selectedId);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-24 pb-8">
        <h1 className="font-heading text-3xl text-foreground mb-6 text-glow">Messages</h1>
        <div className="grid md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[400px]">
          <ConversationList
            conversations={conversations}
            profiles={profiles}
            currentUserId={user?.id}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
          />
          <ChatView conversation={selected} currentUserId={user?.id} />
        </div>
      </main>
    </div>
  );
}