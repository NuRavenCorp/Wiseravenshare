import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/landing/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Plus, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { resolveApiUrl } from "@/api/client";

const configuredNuRavenApiBase = typeof import.meta.env.VITE_NURAVEN_LLM_API_URL === "string"
  ? import.meta.env.VITE_NURAVEN_LLM_API_URL.trim().replace(/\/+$/, "")
  : "";
const localAssistantApiBase = resolveApiUrl("/api").replace(/\/+$/, "");

const assistantBaseCandidates = Array.from(
  new Set(
    [
      configuredNuRavenApiBase,
      localAssistantApiBase,
      "https://wise-ravens.com/api",
      "https://www.wise-ravens.com/api",
    ].filter(Boolean)
  )
);

function getAssistantTokenCandidates() {
  return Array.from(
    new Set(
      [
        localStorage.getItem("nr_token"),
        localStorage.getItem("wiseravenshare_access_token"),
        localStorage.getItem("token"),
      ].filter(Boolean)
    )
  );
}

function isLikelySameOrigin(candidateBase) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const absolute = new URL(candidateBase, window.location.origin);
    return absolute.origin === window.location.origin;
  } catch {
    return false;
  }
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isThinking = message.role === "assistant" && !message.content && message.status === "pending";

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
          <div className={`rounded-2xl px-4 py-3 ${isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"}`}>
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
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [connectedBaseUrl, setConnectedBaseUrl] = useState("");
  const bottomRef = useRef(null);

  const requestAssistant = async (path, init = {}) => {
    const tokenCandidates = getAssistantTokenCandidates();
    const authCandidates = [...tokenCandidates, null];

    let lastError = null;

    for (const base of assistantBaseCandidates) {
      const useCookieSession = isLikelySameOrigin(base);

      for (const token of authCandidates) {
        try {
          const response = await fetch(`${base}${path}`, {
            ...init,
            credentials: useCookieSession ? "include" : "omit",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(init.headers || {}),
            },
          });

          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            const message = payload?.message || `Assistant request failed (${response.status})`;
            if (response.status === 401 || response.status === 403 || response.status === 404 || response.status >= 500) {
              lastError = new Error(message);
              continue;
            }

            throw new Error(message);
          }

          setConnectedBaseUrl(base);
          return payload;
        } catch (err) {
          lastError = err;
        }
      }
    }

    throw lastError || new Error("Unable to reach NuRavenCorpLLM assistant.");
  };

  const startNewConversation = async () => {
    setError("");
    const conv = await requestAssistant("/assistant/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "RavenChat", persona: "Default" }),
    });
    const normalizedConversation = {
      ...conv,
      id: conv?.id || conv?.Id,
    };
    setConversation(normalizedConversation);
    setMessages([]);
    return normalizedConversation;
  };

  useEffect(() => {
    startNewConversation().catch((err) => setError(err?.message || "Unable to connect to RavenChat."));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (forcedText) => {
    if (sending) return;
    const text = String(forcedText ?? input).trim();
    if (!text) return;
    if (!forcedText) setInput("");

    setSending(true);
    setError("");

    try {
      let conv = conversation;
      if (!conv) conv = await startNewConversation();

      const userMessage = { id: `u-${Date.now()}`, role: "user", content: text };
      const pendingMessage = { id: `p-${Date.now()}`, role: "assistant", content: "", status: "pending" };
      setMessages((prev) => [...prev, userMessage, pendingMessage]);

      const reply = await requestAssistant(`/assistant/conversations/${conv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text, isVoice: false }),
      });

      const role = String(reply?.role || reply?.Role || "assistant").toLowerCase();
      const content = reply?.content || reply?.Content || "";

      setMessages((prev) =>
        prev
          .filter((m) => m.id !== pendingMessage.id)
          .concat({
            id: reply?.id || reply?.Id || `a-${Date.now()}`,
            role,
            content,
          })
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.status !== "pending"));
      const message = err?.message || "Could not reach RavenChat.";
      setError(
        message.includes("Failed to fetch")
          ? "Unable to reach NuRavenCorpLLM right now. Please try again in a moment."
          : message
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const starters = [
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
                Robotic raven assistant powered by NuRavenCorpLLM
                {connectedBaseUrl ? ` · connected to ${connectedBaseUrl}` : ""}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={startNewConversation} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Chat
          </Button>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 overflow-y-auto mb-4 min-h-[460px] space-y-4">
          {error && (
            <div className="text-sm rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2">
              {error}
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-5 py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                <Bot className="w-8 h-8 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-lg">RavenChat is ready</p>
                <p className="text-muted-foreground text-sm mt-1">Ask about strategy, content, research, or your next move.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-2 w-full max-w-lg">
                {starters.map((starter) => (
                  <button
                    key={starter}
                    onClick={() => sendMessage(starter)}
                    className="text-xs text-left bg-background hover:bg-violet-50 border border-border hover:border-violet-300 text-muted-foreground hover:text-violet-700 rounded-xl px-3 py-2 transition-colors"
                    disabled={sending}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to RavenChat..."
            rows={2}
            className="resize-none flex-1"
            disabled={sending}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || sending} className="h-10 px-4">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
