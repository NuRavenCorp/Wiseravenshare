import React, { useState } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { MessageCircle, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ConversationList({ conversations, profiles, currentUserId, selectedId, onSelect, loading }) {
  const { user } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const handleStart = async () => {
    if (!email || !content) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiClient.functions.invoke("SendMessage", {
        recipient_email: email,
        content
      });
      if (res.data?.error) throw new Error(res.data.error);
      setEmail("");
      setContent("");
      setShowNew(false);
      window.location.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const getDisplayName = (conv) => {
    const otherId = conv.participants?.find((id) => id !== currentUserId);
    return profiles[otherId]?.display_name || "Direct Message";
  };

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="font-heading text-sm text-foreground">Conversations</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNew(!showNew)}>
          {showNew ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
      {showNew && (
        <div className="p-3 border-b border-border space-y-2">
          <Input placeholder="Recipient email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-sm" />
          <Input placeholder="Message..." value={content} onChange={(e) => setContent(e.target.value)} className="h-8 text-sm" />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button onClick={handleStart} disabled={sending || !email || !content} size="sm" className="w-full">
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Start Conversation
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No conversations yet. Start a new one!</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full text-left p-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                selectedId === conv.id ? "bg-primary/10" : ""
              }`}
            >
              <p className="text-sm font-medium text-foreground truncate">{getDisplayName(conv)}</p>
              <p className="text-xs text-muted-foreground">
                {conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString() : "New"}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}