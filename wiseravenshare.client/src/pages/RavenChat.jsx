import { useCallback, useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import Navbar from "@/components/landing/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Plus, Loader2, Sparkles, Wifi, WifiOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { resolveApiUrl } from "@/api/client";

// ── Token helpers ────────────────────────────────────────────────────────────

function getAccessToken() {
  return (
    localStorage.getItem("wiseravenshare_access_token") ||
    localStorage.getItem("nr_token") ||
    localStorage.getItem("token") ||
    ""
  );
}

// ── REST helper – used only for conversation lifecycle (create/list) ─────────

async function restRequest(path, init = {}) {
  const token = getAccessToken();
  if (!token) throw new Error("You need to sign in first.");

  const response = await fetch(resolveApiUrl(`/api${path}`), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.message || `NuRavenCorpLLM request failed (${response.status})`
    );
  }
  return payload;
}

// ── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isStreaming = message.role === "assistant" && message.status === "streaming";
  const isPending = message.role === "assistant" && !message.content && message.status === "pending";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-1 shadow">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}
      <div className={`${isUser ? "max-w-[80%] flex flex-col items-end" : "max-w-[80%]"}`}>
        {isPending ? (
          <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Raven is thinking…
          </div>
        ) : message.content ? (
          <div
            className={`rounded-2xl px-4 py-3 ${
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground"
            }`}
          >
            {isUser ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            ) : (
              <ReactMarkdown className="text-sm prose prose-sm max-w-none prose-p:my-2 prose-headings:my-2">
                {message.content}
              </ReactMarkdown>
            )}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-0.5 bg-violet-500 animate-pulse rounded-sm align-middle" />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RavenChat() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [hubStatus, setHubStatus] = useState("connecting"); // connecting | connected | disconnected
  const bottomRef = useRef(null);
  const hubRef = useRef(null);
  const streamingIdRef = useRef(null);

  // ── SignalR hub connection ──────────────────────────────────────────────────

  useEffect(() => {
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(resolveApiUrl("/api/hubs/assistant"), {
        accessTokenFactory: () => getAccessToken(),
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    hubRef.current = conn;

    // NuRavenCorpLLM streams token deltas – each chunk is an AssistantStreamEvent
    conn.on("chunk", (evt) => {
      const type = evt?.type ?? evt?.Type ?? "";
      const delta = evt?.delta ?? evt?.Delta ?? null;
      const msg = evt?.message ?? evt?.Message ?? null;

      if (type === "delta" && delta) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingIdRef.current
              ? { ...m, content: (m.content || "") + delta, status: "streaming" }
              : m
          )
        );
      } else if (type === "done") {
        const finalContent = msg?.content ?? msg?.Content ?? null;
        const finalId = msg?.id ?? msg?.Id ?? streamingIdRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingIdRef.current
              ? { ...m, id: finalId, content: finalContent ?? m.content, status: "done" }
              : m
          )
        );
        streamingIdRef.current = null;
        setSending(false);
      } else if (type === "blocked") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingIdRef.current
              ? { ...m, content: "⚠️ Content was blocked by safety filters.", status: "done" }
              : m
          )
        );
        streamingIdRef.current = null;
        setSending(false);
      }
    });

    conn.on("error", (message) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.status === "pending" || m.status === "streaming"
            ? { ...m, status: "done", content: m.content || "⚠️ An error occurred." }
            : m
        )
      );
      streamingIdRef.current = null;
      setSending(false);
      setError(message || "NuRavenCorpLLM returned an error.");
    });

    conn.onreconnecting(() => setHubStatus("connecting"));
    conn.onreconnected(() => setHubStatus("connected"));
    conn.onclose(() => setHubStatus("disconnected"));

    conn
      .start()
      .then(() => setHubStatus("connected"))
      .catch(() => setHubStatus("disconnected"));

    return () => {
      conn.stop();
      hubRef.current = null;
    };
  }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Conversation management ────────────────────────────────────────────────

  const startNewConversation = useCallback(async () => {
    setError("");
    const conv = await restRequest("/assistant/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "RavenChat", persona: "Default" }),
    });
    const normalized = { ...conv, id: conv?.id ?? conv?.Id };
    setConversation(normalized);
    setMessages([]);
    return normalized;
  }, []);

  useEffect(() => {
    startNewConversation().catch((err) =>
      setError(err?.message || "Unable to start a RavenChat conversation.")
    );
  }, [startNewConversation]);

  // ── Send via SignalR stream (falls back to REST if hub unavailable) ─────────

  const sendMessage = useCallback(
    async (forcedText) => {
      if (sending) return;
      const text = String(forcedText ?? input).trim();
      if (!text) return;
      if (!forcedText) setInput("");

      setSending(true);
      setError("");

      try {
        let conv = conversation;
        if (!conv) conv = await startNewConversation();

        const userMsg = { id: `u-${Date.now()}`, role: "user", content: text };
        const streamId = `s-${Date.now()}`;
        streamingIdRef.current = streamId;
        const pendingMsg = { id: streamId, role: "assistant", content: "", status: "pending" };
        setMessages((prev) => [...prev, userMsg, pendingMsg]);

        const hub = hubRef.current;
        if (hub?.state === signalR.HubConnectionState.Connected) {
          // Stream from NuRavenCorpLLM via AssistantHub – setSending(false) fires on "done"/"error"
          await hub.invoke("SendText", conv.id, text, false);
        } else {
          // Fallback: REST round-trip when SignalR is unavailable
          const reply = await restRequest(`/assistant/conversations/${conv.id}/messages`, {
            method: "POST",
            body: JSON.stringify({ text, isVoice: false }),
          });
          const role = String(reply?.role ?? reply?.Role ?? "assistant").toLowerCase();
          const content = reply?.content ?? reply?.Content ?? "";
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== streamId)
              .concat({
                id: reply?.id ?? reply?.Id ?? `a-${Date.now()}`,
                role,
                content,
                status: "done",
              })
          );
          streamingIdRef.current = null;
          setSending(false);
        }
      } catch (err) {
        setMessages((prev) =>
          prev.filter((m) => m.status !== "pending" && m.status !== "streaming")
        );
        streamingIdRef.current = null;
        const msg = err?.message || "Could not reach RavenChat.";
        setError(
          msg.includes("Failed to fetch")
            ? "Unable to reach NuRavenCorpLLM right now. Please try again in a moment."
            : msg
        );
        setSending(false);
      }
    },
    [sending, input, conversation, startNewConversation]
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const starters = [
    "Summarize top platform updates from my activity.",
    "Help me draft a post for the Wiseraven feed.",
    "What should I research next to improve my content?",
    "Give me a quick action plan for today.",
  ];

  const hubIcon =
    hubStatus === "connected" ? (
      <Wifi className="w-3 h-3 text-emerald-500" />
    ) : hubStatus === "connecting" ? (
      <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
    ) : (
      <WifiOff className="w-3 h-3 text-red-400" />
    );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-2xl text-foreground flex items-center gap-2">
                RavenChat <Sparkles className="w-4 h-4 text-violet-500" />
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {hubIcon}
                Powered by NuRavenCorpLLM · live streaming
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={startNewConversation} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Chat
          </Button>
        </div>

        {/* Message thread */}
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
                <p className="text-muted-foreground text-sm mt-1">
                  Ask about strategy, content, research, or your next move.
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-2 w-full max-w-lg">
                {starters.map((s) => (
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

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to RavenChat…"
            rows={2}
            className="resize-none flex-1"
            disabled={sending}
          />
          <Button onClick={() => sendMessage()} disabled={!input.trim() || sending} className="h-10 px-4">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
