import { useState, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import Navbar from "@/components/landing/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Plus, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

const API_BASE = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_URL || "/api");

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isThinking = message.role === "assistant" && !message.content;

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-1 shadow">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}
      <div className={`${isUser ? "max-w-[80%] flex flex-col items-end" : "max-w-[80%]"}`}>
        {isThinking ? (
          <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Raven is thinking...
          </div>
        ) : message.content ? (
          <div className={`rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground"
          }`}>
            {isUser ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            ) : (
              <ReactMarkdown className="text-sm prose prose-sm max-w-none prose-p:my-2 prose-headings:my-2">
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function RavenChat() {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const getAuthToken = () =>
    localStorage.getItem("wiseravenshare_access_token") ||
    localStorage.getItem("token") ||
    "";

  const resetConversation = () => {
    setConversationId(null);
    setMessages([]);
    setError("");
    setInput("");
  };

  const sendMessage = async (forcedText) => {
    if (sending) return;
    const text = String(forcedText ?? input).trim();
    if (!text) return;
    if (!forcedText) setInput("");

    setSending(true);
    setError("");

    const userMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    const pendingMsg = { id: `p-${Date.now()}`, role: "assistant", content: "" };
    setMessages((prev) => [...prev, userMsg, pendingMsg]);

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({ Role: m.role, Content: m.content }));

    try {
      const token = getAuthToken();
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const abortController = new AbortController();
      const abortTimer = setTimeout(() => abortController.abort(), 70000);

      let res;
      try {
        res = await fetch(`${API_BASE}/raven-assistant/chat`, {
          method: "POST",
          headers,
          signal: abortController.signal,
          body: JSON.stringify({
            Message: text,
            ConversationId: conversationId || undefined,
            History: history,
          }),
        });
      } finally {
        clearTimeout(abortTimer);
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("application/json")) {
        throw new Error("RavenChat API is unavailable on this domain.");
      }

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || `Request failed (${res.status})`);
      }

      if (!payload || (payload.Answer == null && payload.answer == null)) {
        throw new Error("RavenChat did not return a valid response.");
      }

      const newConvId = payload?.ConversationId ?? payload?.conversationId;
      if (newConvId) setConversationId(newConvId);

      const answer = payload?.Answer ?? payload?.answer ?? "No response received.";

      setMessages((prev) =>
        prev
          .filter((m) => m.id !== pendingMsg.id)
          .concat({ id: `a-${Date.now()}`, role: "assistant", content: answer })
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== pendingMsg.id));

      if (err?.name === "AbortError") {
        setMessages((prev) =>
          prev.concat({
            id: `a-timeout-${Date.now()}`,
            role: "assistant",
            content: "I am taking too long to respond. Please try again or ask a shorter question.",
          })
        );
        setError("RavenChat request timed out. Please try again.");
        return;
      }

      setMessages((prev) =>
        prev.concat({
          id: `a-err-${Date.now()}`,
          role: "assistant",
          content:
            "I could not reach the assistant service right now. You can still navigate the platform directly.",
        })
      );
      setError(err?.message || "Unable to reach RavenChat. Please try again.");
    } finally {
      setSending(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const STARTERS = [
    "Summarize top platform updates from my activity.",
    "Help me draft a post for the Wiseraven feed.",
    "What should I research next to improve my content?",
    "Give me a quick action plan for today.",
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-2xl text-foreground flex items-center gap-2">
                RavenChat <Sparkles className="w-4 h-4 text-violet-500" />
              </h1>
              <p className="text-xs text-muted-foreground">
                Powered by NuRavenCorpLLM · Ask me anything about the platform
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={resetConversation} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Chat
          </Button>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 overflow-y-auto mb-4 min-h-[460px] space-y-4">
          {error && (
            <div className="text-sm rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2">
              {error}
            </div>
          )}

          {messages.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-full gap-5 py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                <Bot className="w-8 h-8 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-lg">RavenChat is ready</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Ask about strategy, content, research, or your next move.
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-2 w-full max-w-lg">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-xs text-left bg-background hover:bg-violet-50 border border-border hover:border-violet-300 text-muted-foreground hover:text-violet-700 rounded-xl px-3 py-2 transition-colors"
                    disabled={sending}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}

          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to RavenChat..."
            rows={2}
            className="resize-none flex-1"
            disabled={sending}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || sending}
            className="h-10 px-4"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">
          AI responses are for guidance only. Always verify important information.
        </p>
      </div>
    </div>
  );
}
