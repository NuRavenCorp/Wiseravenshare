import React, { useState, useEffect } from "react";
import { getPlayableUrl } from "@/lib/mediaUtils";
import ZoomableImage from "@/components/media/ZoomableImage";
import { X, Loader2, Music } from "lucide-react";

export default function LibraryPreview({ item, onClose }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    setUrl(null);
    let active = true;
    getPlayableUrl(item.file_uri).then((u) => {
      if (active) { setUrl(u); setLoading(false); }
    });
    return () => { active = false; };
  }, [item?.file_uri]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : item.asset_type === "photo" ? (
          <ZoomableImage src={url} alt={item.title} className="w-full rounded-lg max-h-[75vh]" fittingType="fit" />
        ) : item.asset_type === "video" ? (
          <video src={url} controls autoPlay className="w-full rounded-lg border border-border bg-black max-h-[75vh]" />
        ) : (
          <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <Music className="w-7 h-7 text-primary" />
            </div>
            <audio src={url} controls autoPlay className="w-full max-w-md" />
          </div>
        )}
      </div>
    </div>
  );
}