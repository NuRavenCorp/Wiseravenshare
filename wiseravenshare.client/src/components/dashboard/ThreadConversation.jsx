import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/api/client";
import { Send, Loader2, Reply, CornerDownRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function ThreadConversation({ conversation, currentUserId, profiles }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
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
    } finally {
      setLoading(false);
    }
  }, [conversation]);

  useEffect(() => {
    setLoading(true);
    setReplyTo(null);
    fetchMessages();
    const unsub = apiClient.entities.Message.subscribe(() => fetchMessages());
    return unsub;
  }, [conversation, fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const replyMap = {};
  const roots = [];
  messages.forEach((m) => {
    if (m.parent_message_id) {
      if (!replyMap[m.parent_message_id]) replyMap[m.parent_message_id] = [];
      replyMap[m.parent_message_id].push(m);
    } else {
      roots.push(m);
    }
  });

  const getDisplayName = (userId) => profiles[userId]?.display_name || "User";

  const handleSend = async () => {
    if (!input.trim()) return;
    setSending(true);
    try {
      await apiClient.functions.invoke("SendMessage", {
        conversationId: conversation.id,
        content: input.trim(),
        parentMessageId: replyTo?.id || undefined,
      });
      setInput("");
      setReplyTo(null);
      fetchMessages();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts) =>
    ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  const renderMessage = (msg, depth = 0) => {
    const isMe = msg.created_by_id === currentUserId;
    const replies = replyMap[msg.id] || [];
    return (
      <div key={msg.id} className={depth > 0 ? "ml-5 border-l border-border pl-3 mt-1.5" : "mt-2"}>
        <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[82%] rounded-lg px-3 py-2 text-sm ${
            isMe ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          }`}>
            {!isMe && depth > 0 && (
              <p className="text-[10px] font-medium mb-0.5 opacity-70">{getDisplayName(msg.created_by_id)}</p>
            )}
            <p className="whitespace-pre-wrap">{msg.content}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {formatTime(msg.created_date)}
              </span>
              <button
                onClick={() => setReplyTo(msg)}
                className={`text-[10px] flex items-center gap-0.5 hover:underline ${
                  isMe ? "text-primary-foreground/70" : "text-primary"
                }`}
              >
                <Reply className="w-2.5 h-2.5" /> Reply
              </button>
            </div>
          </div>
        </div>
        {replies.length > 0 && replies.map((r) => renderMessage(r, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="border-t border-border">
      <div ref={scrollRef} className="max-h-80 overflow-y-auto p-3">
        {roots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No messages yet. Start the conversation!</p>
        ) : (
          roots.map((m) => renderMessage(m))
        )}
      </div>
      {replyTo && (
        <div className="px-3 py-1.5 bg-secondary/40 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <CornerDownRight className="w-3 h-3 shrink-0" />
            Replying to: <span className="truncate">{replyTo.content?.slice(0, 50)}</span>
          </span>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0 ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="p-3 border-t border-border flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={replyTo ? "Write a reply..." : "Write a message..."}
          rows={1}
          className="resize-none min-h-[36px] max-h-24"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button onClick={handleSend} disabled={sending || !input.trim()} size="icon" className="h-9 w-9 shrink-0">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}