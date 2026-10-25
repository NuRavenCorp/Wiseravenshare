import React, { useState, useRef } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Feather, Image, Video, Music, Type, X, Hash } from "lucide-react";
import PostTemplatePicker from "./PostTemplatePicker";

const POST_TYPES = [
  { value: "text", label: "Text", icon: Type, accept: null },
  { value: "photo", label: "Photo", icon: Image, accept: "image/*" },
  { value: "video", label: "Video", icon: Video, accept: "video/*" },
  { value: "music", label: "Music", icon: Music, accept: "audio/*" },
];

export default function PostComposer({ onPosted, compact }) {
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState("text");
  const [hashtags, setHashtags] = useState("");
  const [partials, setPartials] = useState("");
  const [mediaUrls, setMediaUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const MAX_POST_LENGTH = 1000;

  const currentType = POST_TYPES.find((t) => t.value === postType);

  const applyTemplate = (tpl) => {
    setContent(tpl.content);
    setPostType(tpl.postType);
    setHashtags(tpl.hashtags.join(", "));
    setPartials("");
    setMediaUrls([]);
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = [];
      for (const file of files) {
        const { file_url } = await apiClient.integrations.Core.UploadPublicFile({ file });
        uploaded.push(file_url);
      }
      setMediaUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeMedia = (idx) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const tags = hashtags
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, "").trim())
        .filter(Boolean);
      const partialTags = partials
        .split(/[ ,\s]+/)
        .map((value) => value.replace(/^%/, "").trim())
        .filter(Boolean)
        .map((tag) => `%${tag}`);
      const taggedContent = [content.trim(), ...tags, ...partialTags].join(" ");
      if (taggedContent.length > MAX_POST_LENGTH) {
        setError(`Post is too long (${taggedContent.length}/${MAX_POST_LENGTH}). Shorten text or tags.`);
        return;
      }

      const createdPost = await apiClient.entities.Post.create({
        content: taggedContent,
        post_type: postType,
        media_uris: mediaUrls,
        hashtags: tags,
        status: "published",
      });
      setContent("");
      setHashtags("");
      setPartials("");
      setMediaUrls([]);
      setPostType("text");
      onPosted?.(createdPost);
    } catch (err) {
      setError(err?.data?.error || err?.message || "Failed to post. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className={`rounded-xl border border-border bg-card ${compact ? "p-4" : "p-5"} space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Feather className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Create a Post</span>
        </div>
        <PostTemplatePicker onApply={applyTemplate} />
      </div>

      <div className="flex flex-wrap gap-2">
        {POST_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => {
                setPostType(t.value);
                setMediaUrls([]);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                postType === t.value
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share your truth..."
        rows={compact ? 2 : 3}
        className="resize-none"
      />

      {currentType.accept && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={currentType.accept}
            multiple
            onChange={handleFiles}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <currentType.icon className="w-4 h-4" />}
              Attach {currentType.label}
            </Button>
            {mediaUrls.length > 0 && (
              <span className="text-xs text-muted-foreground">{mediaUrls.length} file(s)</span>
            )}
          </div>
          {mediaUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {mediaUrls.map((url, idx) => (
                <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
                  {postType === "photo" ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : postType === "video" ? (
                    <video src={url} className="w-full h-full object-cover" muted />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                      <Music className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <button
                    onClick={() => removeMedia(idx)}
                    className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Hash className="w-4 h-4 text-muted-foreground" />
        <Input
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          placeholder="hashtags (comma separated)"
          className="text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="w-4 text-center text-sm font-semibold text-accent">%</span>
        <Input
          value={partials}
          onChange={(e) => setPartials(e.target.value)}
          placeholder="partials (e.g. %human, %truth, %in-progress)"
          className="text-sm"
          aria-label="Partials"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={handleSubmit}
        disabled={posting || uploading || !content.trim()}
        className="w-full"
      >
        {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Feather className="w-4 h-4" />}
        Publish Post
      </Button>
    </div>
  );
}
