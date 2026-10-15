import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/api/client";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function ChatView({ conversation, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    if (!conversation) return;
    try {
      const res = await apiClient.entities.Message.filter(
        { conversation_id: conversation.id },
        { sort: "created_date", limit: 100 }
      );
      setMessages(res.items || []);
    } catch {
      setMessages([]);
    }
  }, [conversation]);

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
    if (!conversation) return;
    const unsub = apiClient.entities.Message.subscribe((event) => {
      if (event.data?.conversation_id === conversation.id || event.type === "create") {
        fetchMessages();
      }
    });
    return unsub;
  }, [conversation, fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !conversation) return;
    setSending(true);
    try {
      await apiClient.functions.invoke("SendMessage", {
        conversation_id: conversation.id,
        content: input.trim()
      });
      setInput("");
      fetchMessages();
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
      <div className="p-3 border-b border-border">
        <span className="font-heading text-sm text-foreground">Direct Message</span>
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
            const isMe = m.created_by_id === currentUserId;
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
          placeholder="Type a message..."
          rows={1}
          className="resize-none min-h-[40px] max-h-24"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button onClick={handleSend} disabled={sending || !input.trim()} size="icon" className="h-10 w-10 shrink-0">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}