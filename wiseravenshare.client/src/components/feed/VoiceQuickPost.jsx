import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Mic,
  MicOff,
  Loader2,
  Feather,
  MessagesSquare,
  Heart,
  Repeat2,
  Trash2,
  Send,
} from "lucide-react";

const TRIGGERS = ["post", "send", "thread", "like", "repost", "delete"];

const toServerPostType = (postType) => {
  switch ((postType || "").toLowerCase()) {
    case "photo":
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "music":
    case "audio":
      return "Audio";
    default:
      return "Text";
  }
};

function parseCommand(transcript) {
  const t = transcript.trim();
  if (!t) return { action: null, text: "" };
  const firstRaw = t.split(/\s+/)[0];
  const first = firstRaw.toLowerCase().replace(/[^a-z]/g, "");
  if (TRIGGERS.includes(first)) {
    return { action: first, text: t.slice(firstRaw.length).trim() };
  }
  return { action: "post", text: t };
}

export default function VoiceQuickPost({ onPosted }) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [isThread, setIsThread] = useState(false);
  const [posting, setPosting] = useState(false);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [heard, setHeard] = useState("");
  const recRef = useRef(null);
  const handlerRef = useRef(null);

  const publishPost = async (text, thread) => {
    const body = (text || "").trim();
    if (!body) {
      toast({ title: "Nothing to post", variant: "destructive" });
      return;
    }
    setPosting(true);
    try {
      await apiClient.createPost({
        content: body,
        type: "Text",
      });
      toast({ title: thread ? "Thread started" : "Post published" });
      setContent("");
      onPosted?.();
    } catch (e) {
      toast({ title: "Failed to post", description: e?.message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const likeRecent = async () => {
    try {
      const res = await apiClient.entities.Post.filter(
        { status: "published" },
        { sort: "-created_date", limit: 1 }
      );
      const post = (res.items || [])[0];
      if (!post) { toast({ title: "No post to like" }); return; }
      const me = await apiClient.auth.me();
      const lk = await apiClient.entities.Like.filter(
        { target_id: post.id, target_type: "post", created_by_id: me.id },
        { limit: 1 }
      );
      if ((lk.items || []).length) {
        await apiClient.entities.Like.delete(lk.items[0].id);
        await apiClient.entities.Post.update(post.id, { like_count: Math.max(0, (post.like_count || 0) - 1) });
        toast({ title: "Unliked latest post" });
      } else {
        await apiClient.entities.Like.create({ target_id: post.id, target_type: "post" });
        await apiClient.entities.Post.update(post.id, { like_count: (post.like_count || 0) + 1 });
        toast({ title: "Liked latest post" });
      }
    } catch (e) {
      toast({ title: "Like failed", description: e?.message, variant: "destructive" });
    }
  };

  const repostRecent = async () => {
    try {
      const res = await apiClient.entities.Post.filter(
        { status: "published" },
        { sort: "-created_date", limit: 1 }
      );
      const post = (res.items || [])[0];
      if (!post) { toast({ title: "No post to repost" }); return; }
      const me = await apiClient.auth.me();
      const dup = await apiClient.entities.Post.filter(
        { external_source: post.id, created_by_id: me.id },
        { limit: 1 }
      );
      if ((dup.items || []).length) { toast({ title: "Already reposted" }); return; }
      await apiClient.createPost({
        content: post.content,
        type: toServerPostType(post.post_type),
        mediaUrl: Array.isArray(post.media_uris) && post.media_uris.length > 0 ? post.media_uris[0] : null,
        mediaUrls: Array.isArray(post.media_uris) && post.media_uris.length > 0 ? JSON.stringify(post.media_uris) : null,
        repostOfId: post.id,
      });
      await apiClient.entities.Post.update(post.id, { repost_count: (post.repost_count || 0) + 1 });
      toast({ title: "Reposted latest post" });
    } catch (e) {
      toast({ title: "Repost failed", description: e?.message, variant: "destructive" });
    }
  };

  const deleteRecent = async () => {
    try {
      const me = await apiClient.auth.me();
      const res = await apiClient.entities.Post.filter(
        { created_by_id: me.id, status: "published" },
        { sort: "-created_date", limit: 1 }
      );
      const post = (res.items || [])[0];
      if (!post) { toast({ title: "You have no post to delete" }); return; }
      await apiClient.entities.Post.delete(post.id);
      toast({ title: "Deleted your last post" });
      onPosted?.();
    } catch (e) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleCommand = async (transcript) => {
    const { action, text } = parseCommand(transcript);
    if (!action) return;
    switch (action) {
      case "post":
      case "send":
        if (text) setContent(text);
        await publishPost(text || content, false);
        break;
      case "thread":
        if (text) setContent(text);
        setIsThread(true);
        await publishPost(text || content, true);
        break;
      case "like":
        await likeRecent();
        break;
      case "repost":
        await repostRecent();
        break;
      case "delete":
        await deleteRecent();
        break;
    }
  };

  handlerRef.current = handleCommand;

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setHeard(transcript);
      handlerRef.current?.(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.abort(); } catch {} };
  }, []);

  const toggleMic = () => {
    if (!recRef.current) return;
    if (listening) {
      recRef.current.stop();
      setListening(false);
    } else {
      setHeard("");
      try {
        recRef.current.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  };

  const submitManual = () => {
    publishPost(content, isThread);
  };

  if (!isAuthenticated) {
    return (
      <section className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6 text-center">
          <Feather className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="font-heading text-xl text-foreground mb-1">Speak it into being</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Sign in to post or start a thread with your voice — say "post", "send", "thread", "like", "repost", or "delete".
          </p>
          <Button onClick={() => apiClient.auth.redirectToLogin()}>Sign in to post</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-3xl mx-auto px-6 py-10">
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Feather className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Quick Post</span>
            <span className="text-xs text-muted-foreground">— type or speak</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsThread(false)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                !isThread ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Feather className="w-3.5 h-3.5" /> Post
            </button>
            <button
              onClick={() => setIsThread(true)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                isThread ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessagesSquare className="w-3.5 h-3.5" /> Thread
            </button>
          </div>
        </div>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={isThread ? "Start your thread..." : "Share your truth..."}
          rows={3}
          className="resize-none"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={toggleMic}
            disabled={!supported}
            variant={listening ? "default" : "outline"}
            className={listening ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {listening ? "Listening…" : "Speak"}
          </Button>
          <Button onClick={submitManual} disabled={posting || !content.trim()}>
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : isThread ? <MessagesSquare className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {isThread ? "Start Thread" : "Post"}
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto flex-wrap">
            <Heart className="w-3 h-3" /> like
            <Repeat2 className="w-3 h-3 ml-1" /> repost
            <Trash2 className="w-3 h-3 ml-1" /> delete
          </div>
        </div>

        {!supported && (
          <p className="text-xs text-muted-foreground">Voice input isn't supported in this browser — typing still works.</p>
        )}
        {heard && (
          <p className="text-xs text-muted-foreground">
            Heard: <span className="text-foreground">"{heard}"</span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Trigger words: post · send · thread · like · repost · delete
        </p>
      </div>
    </section>
  );
}