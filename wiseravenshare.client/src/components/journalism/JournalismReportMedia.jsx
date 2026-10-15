import React, { useState } from "react";
import { apiClient } from "@/api/client";
import { ChevronDown, ChevronRight, Image as ImageIcon } from "lucide-react";
import MediaManager from "@/components/media/MediaManager";

export default function JournalismReportMedia({ post, isAuthor, onMediaChange }) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);

  const items = (post.media_uris || []).map((url) => ({
    url,
    type: /\.(mp4|webm|mov|avi)(\?|$)/i.test(url) ? "video" : "photo",
  }));

  const handleUpload = async (files) => {
    if (!isAuthor) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const { file_url } = await apiClient.integrations.Core.UploadPublicFile({ file });
        uploaded.push(file_url);
      }
      const updated = [...(post.media_uris || []), ...uploaded];
      await apiClient.entities.Post.update(post.id, { media_uris: updated });
      onMediaChange?.();
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (idx) => {
    if (!isAuthor) return;
    const updated = (post.media_uris || []).filter((_, i) => i !== idx);
    await apiClient.entities.Post.update(post.id, { media_uris: updated });
    onMediaChange?.();
  };

  if (!isAuthor && items.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <ImageIcon className="w-3.5 h-3.5" />
        {items.length} media {isAuthor ? "(manage)" : ""}
      </button>
      {expanded && (
        <div className="mt-2">
          {isAuthor ? (
            <MediaManager
              items={items}
              onUpload={handleUpload}
              onDelete={handleDelete}
              accept="image/*,video/*"
              uploading={uploading}
              emptyText="No media attached"
            />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {items.map((item, idx) => (
                <div key={idx} className="rounded-lg overflow-hidden border border-border aspect-square bg-muted/20">
                  {item.type === "video" ? (
                    <video src={item.url} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}