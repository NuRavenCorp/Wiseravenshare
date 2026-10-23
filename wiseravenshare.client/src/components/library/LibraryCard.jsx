import React, { useState, useEffect } from "react";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Image } from "@/components/ui/image";
import { Music, Play, Check, Trash2, Loader2 } from "lucide-react";

export default function LibraryCard({ item, selected, confirming, deleting = false, onSelect, onPreview, onDelete }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    getPlayableUrl(item.file_uri).then((u) => active && setUrl(u));
    return () => { active = false; };
  }, [item.file_uri]);

  return (
    <div
      className={`relative rounded-lg border overflow-hidden bg-card transition-colors ${
        selected ? "border-primary" : "border-border hover:border-primary/50"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        disabled={deleting}
        className="absolute top-2 left-2 z-10 w-4 h-4 accent-primary"
      />
      <button onClick={onPreview} disabled={deleting} className="block w-full text-left disabled:opacity-60">
        {item.asset_type === "photo" ? (
          url ? (
            <Image src={url} alt={item.title} className="w-full aspect-square" fittingType="fill" />
          ) : (
            <div className="w-full aspect-square bg-secondary/30 animate-pulse" />
          )
        ) : item.asset_type === "video" ? (
          <div className="w-full aspect-square bg-secondary/30 flex items-center justify-center relative overflow-hidden">
            {url && <video src={url} className="absolute inset-0 w-full h-full object-cover" muted />}
            <Play className="w-8 h-8 text-white/80 relative z-10 drop-shadow-lg" />
          </div>
        ) : (
          <div className="w-full aspect-square bg-secondary/30 flex flex-col items-center justify-center gap-2">
            <Music className="w-8 h-8 text-primary" />
            <span className="text-xs text-muted-foreground truncate max-w-full px-2">{item.title}</span>
          </div>
        )}
      </button>
      <div className="p-2 flex items-center justify-between gap-1">
        <p className="text-xs text-foreground truncate flex-1">{item.title}</p>
        <button
          onClick={onDelete}
          disabled={deleting}
          className={`p-1 rounded transition-colors shrink-0 ${
            confirming
              ? "bg-destructive text-destructive-foreground"
              : "text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-60 disabled:pointer-events-none"
          }`}
          title={deleting ? "Deleting…" : (confirming ? "Click again to confirm" : "Delete")}
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (confirming ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />)}
        </button>
      </div>
    </div>
  );
}