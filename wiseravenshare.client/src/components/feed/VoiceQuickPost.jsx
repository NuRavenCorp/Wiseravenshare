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
  History,
  Play,
} from "lucide-react";

const TRIGGERS = ["post", "send", "thread", "like", "repost", "delete", "review", "play"];

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

const normalizeCollection = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const splitThreadSegments = (text) => {
  const segments = String(text || "")
    .split(/\n\s*\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [String(text || "").trim()].filter(Boolean);
};

export default function VoiceQuickPost({ onPosted }) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [isThread, setIsThread] = useState(false);
  const [posting, setPosting] = useState(false);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [heard, setHeard] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [showPastPosts, setShowPastPosts] = useState(false);
  const [pastPosts, setPastPosts] = useState([]);
  const recRef = useRef(null);
  const handlerRef = useRef(null);

  const loadPastPosts = async () => {
    setReviewing(true);
    try {
      const me = await apiClient.auth.me();
      const userId = me?.id || me?.userId || me?.sub;
      if (!userId) {
        throw new Error("Could not resolve your account.");
      }

      const res = await apiClient.posts.userPosts(userId, 1, 20);
      const posts = normalizeCollection(res).map((post) => ({
        ...post,
        media_uris: post.mediaUrls || post.media_uris || (post.mediaUrl ? [post.mediaUrl] : []),
        created_date: post.createdAt || post.created_date,
        post_type: post.type || post.post_type || "Text",
      }));
      setPastPosts(posts);
      setShowPastPosts(true);
      if (posts.length === 0) {
        toast({ title: "No past posts found" });
      } else {
        toast({ title: `Loaded ${posts.length} past post${posts.length === 1 ? "" : "s"}` });
      }
    } catch (e) {
      toast({ title: "Review failed", description: e?.message, variant: "destructive" });
    } finally {
      setReviewing(false);
    }
  };

  const publishPost = async (text, thread) => {
    const body = (text || "").trim();
    if (!body) {
      toast({ title: "Nothing to post", variant: "destructive" });
      return;
    }
    setPosting(true);
    try {
      if (thread) {
        const posts = splitThreadSegments(body).map((segment) => ({ content: segment, type: "Text" }));
        if (posts.length > 1) {
          await apiClient.posts.createThread({ posts });
        } else {
          await apiClient.createPost({
            content: body,
            type: "Text",
          });
        }
      } else {
        await apiClient.createPost({
          content: body,
          type: "Text",
        });
      }
      toast({ title: thread ? "Thread started" : "Post published" });
      setContent("");
      setIsThread(false);
      onPosted?.();
    } catch (e) {
      toast({ title: "Failed to post", description: e?.message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const likeRecent = async () => {
    try {
      const feed = await apiClient.posts.feed(1, 25);
      const post = normalizeCollection(feed)[0];
      if (!post) { toast({ title: "No post to like" }); return; }
      if (post.isLiked === true || post.is_liked === true) {
        await apiClient.posts.unlike(post.id);
        toast({ title: "Unliked latest post" });
      } else {
        await apiClient.posts.like(post.id);
        toast({ title: "Liked latest post" });
      }
      onPosted?.();
    } catch (e) {
      toast({ title: "Like failed", description: e?.message, variant: "destructive" });
    }
  };

  const repostRecent = async () => {
    try {
      const feed = await apiClient.posts.feed(1, 25);
      const post = normalizeCollection(feed)[0];
      if (!post) { toast({ title: "No post to repost" }); return; }
      if (post.isReposted === true || post.is_reposted === true) {
        toast({ title: "Already reposted" });
        return;
      }
      await apiClient.posts.repost(post.id);
      toast({ title: "Reposted latest post" });
      onPosted?.();
    } catch (e) {
      toast({ title: "Repost failed", description: e?.message, variant: "destructive" });
    }
  };

  const deleteRecent = async () => {
    try {
      const me = await apiClient.auth.me();
      const userId = me?.id || me?.userId || me?.sub;
      if (!userId) {
        toast({ title: "Delete failed", description: "Could not resolve your account.", variant: "destructive" });
        return;
      }
      const res = await apiClient.posts.userPosts(userId, 1, 1);
      const post = normalizeCollection(res)[0];
      if (!post) { toast({ title: "You have no post to delete" }); return; }
      await apiClient.posts.delete(post.id);
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
      case "review":
      case "play":
        await loadPastPosts();
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
          <Button onClick={loadPastPosts} disabled={reviewing} variant="outline">
            {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
            Review Past Posts
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
          Trigger words: post · send · thread · like · repost · delete · review · play
        </p>
      </div>

      {showPastPosts && (
        <div className="mt-5 rounded-2xl border border-border bg-card/60 backdrop-blur p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Past Posts Review</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowPastPosts(false)}>Hide</Button>
          </div>

          {pastPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No past posts available yet.</p>
          ) : (
            <div className="space-y-4">
              {pastPosts.map((post) => {
                const media = Array.isArray(post.media_uris) ? post.media_uris : [];
                const primaryMedia = media[0];
                const type = String(post.post_type || "").toLowerCase();
                return (
                  <article key={post.id} className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">{post.post_type || "Text"}</span>
                      <span className="text-xs text-muted-foreground">
                        {post.created_date ? new Date(post.created_date).toLocaleString() : "Unknown time"}
                      </span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{post.content || ""}</p>
                    {primaryMedia && (
                      type.includes("video") ? (
                        <video src={primaryMedia} controls playsInline className="w-full max-h-72 rounded-lg bg-black" />
                      ) : type.includes("audio") || type.includes("music") ? (
                        <audio src={primaryMedia} controls className="w-full" />
                      ) : (
                        <img src={primaryMedia} alt="Past post media" className="w-full max-h-72 rounded-lg object-cover" loading="lazy" />
                      )
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}