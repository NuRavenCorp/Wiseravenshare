import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { apiClient } from "@/api/client";
import { useDirectMessage } from "@/hooks/useDirectMessage";
import { Send, Loader2, MessageSquare, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function ChatView({ conversation, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Derive the other participant's ID from the conversation.
  const recipientUserId = useMemo(() => {
    if (!conversation?.participants || !currentUserId) return null;
    return (
      conversation.participants.find(
        (id) => String(id).toLowerCase() !== String(currentUserId).toLowerCase(),
      ) ?? null
    );
  }, [conversation, currentUserId]);

  const handleIncoming = useCallback((payload) => {
    // Accept messages that belong to this conversation (either direction).
    const sender = String(payload?.senderUserId ?? "").toLowerCase();
    const recipient = String(payload?.recipientUserId ?? "").toLowerCase();
    const me = String(currentUserId ?? "").toLowerCase();
    const other = String(recipientUserId ?? "").toLowerCase();

    const belongsHere =
      (sender === me && recipient === other) ||
      (sender === other && recipient === me);

    if (!belongsHere) return;

    const incoming = {
      id: payload.id ?? `rt-${Date.now()}`,
      content: payload.text,
      created_by_id: payload.senderUserId,
      created_date: payload.sentAtUtc ?? new Date().toISOString(),
      realtime: true,
    };

    setMessages((prev) => {
      // Deduplicate by id.
      if (prev.some((m) => m.id === incoming.id)) return prev;
      return [...prev, incoming];
    });
  }, [currentUserId, recipientUserId]);

  const { connected, sendMessage } = useDirectMessage(currentUserId, handleIncoming);

  const fetchMessages = useCallback(async () => {
    if (!conversation) return;
    try {
      const res = await apiClient.entities.Message.filter(
        { conversation_id: conversation.id },
        { sort: "created_date", limit: 100 },
      );
      setMessages(res.items || []);
    } catch {
      setMessages([]);
    }
  }, [conversation]);

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !conversation || !recipientUserId) return;
    setSending(true);
    try {
      // Try real-time first; fall back to REST if not connected.
      const sent = await sendMessage({ recipientUserId, text: trimmed });
      if (!sent) {
        await apiClient.functions.invoke("SendMessage", {
          conversationId: conversation.id,
          content: trimmed,
        });
        fetchMessages();
      }
      setInput("");
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  if (!conversation) {
    return (
      <div className="rounded-lg border border-border bg-card flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Select a conversation to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="font-heading text-sm text-foreground">Direct Message</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {connected ? (
            <><Wifi className="w-3 h-3 text-green-500" /> Live</>
          ) : (
            <><WifiOff className="w-3 h-3" /> Reconnecting…</>
          )}
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => {
            const isMe =
              String(m.created_by_id ?? "").toLowerCase() ===
              String(currentUserId ?? "").toLowerCase();
            return (
              <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  <p>{m.content}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="p-3 border-t border-border flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          rows={1}
          className="resize-none min-h-[40px] max-h-24"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          size="icon"
          className="h-10 w-10 shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}