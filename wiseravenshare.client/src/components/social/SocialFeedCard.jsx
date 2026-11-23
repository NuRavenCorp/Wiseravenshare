import React, { useState } from "react";
import { ExternalLink, Clock, Rss, Globe, Share2 } from "lucide-react";
import ShareMenu from "@/components/feed/ShareMenu";

const PLATFORM_META = {
  facebook:  { label: "Facebook",  color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30"   },
  tiktok:    { label: "TikTok",    color: "text-pink-400",   bg: "bg-pink-500/10",   border: "border-pink-500/30"   },
  bluesky:   { label: "Bluesky",   color: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/30"    },
  youtube:   { label: "YouTube",   color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30"    },
  twitter:   { label: "X / Twitter", color: "text-zinc-300", bg: "bg-zinc-500/10",   border: "border-zinc-500/30"   },
  instagram: { label: "Instagram", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  rss:       { label: "RSS",       color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  atom:      { label: "Atom",      color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SocialFeedCard({ item, onRead }) {
  const meta = PLATFORM_META[item.platform?.toLowerCase()] || PLATFORM_META.rss;
  const [shareOpen, setShareOpen] = useState(false);
  const shareUrl = item.permalinkUrl || (typeof window !== "undefined" ? window.location.href : "");
  const shareText = item.title || item.bodyText || item.sourceName || "WiseRavenShare";

  const handleClick = () => {
    if (!item.isRead && onRead) onRead(item.id);
    if (item.permalinkUrl) window.open(item.permalinkUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <article
      onClick={handleClick}
      className={`
        group relative cursor-pointer rounded-xl border transition-all duration-200
        ${meta.border} ${item.isRead ? "bg-card/40 opacity-70" : "bg-card hover:bg-secondary/30"}
        hover:shadow-md hover:scale-[1.005] active:scale-[0.998]
      `}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      aria-label={`Open: ${item.title || item.bodyText || "Feed item"}`}
    >
      {/* Image hero */}
      {item.imageUrl && (
        <div className="relative w-full aspect-video rounded-t-xl overflow-hidden bg-black/20">
          <img
            src={item.imageUrl}
            alt={item.title || "Feed image"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          {/* Platform badge overlay */}
          <span className={`
            absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
            ${meta.bg} ${meta.color} ${meta.border} border backdrop-blur-sm
          `}>
            {item.faviconUrl
              ? <img src={item.faviconUrl} alt="" className="w-3 h-3 rounded-sm" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              : <Rss className="w-3 h-3" />
            }
            {meta.label}
          </span>
        </div>
      )}

      <div className="p-4 space-y-2">
        {/* Source row (when no image — show platform badge inline) */}
        {!item.imageUrl && (
          <div className="flex items-center gap-2">
            <span className={`
              flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
              ${meta.bg} ${meta.color} ${meta.border} border
            `}>
              {item.faviconUrl
                ? <img src={item.faviconUrl} alt="" className="w-3 h-3 rounded-sm" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                : <Rss className="w-3 h-3" />
              }
              {meta.label}
            </span>
            {item.sourceName && (
              <span className="text-xs text-muted-foreground truncate">{item.sourceName}</span>
            )}
          </div>
        )}

        {/* Title */}
        {item.title && (
          <h3 className={`
            font-semibold leading-snug line-clamp-2
            ${item.isRead ? "text-muted-foreground" : "text-foreground"}
          `}>
            {item.title}
          </h3>
        )}

        {/* Body snippet */}
        {item.bodyText && (
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {item.bodyText}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.imageUrl && item.sourceName && (
              <>
                <Globe className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[140px]">{item.sourceName}</span>
                <span>·</span>
              </>
            )}
            <Clock className="w-3 h-3 shrink-0" />
            <span>{formatRelativeTime(item.publishedAt)}</span>
          </div>
          <div
            className="relative flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShareOpen((open) => !open);
              }}
              className="p-1 rounded-full text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
              aria-label="Share item"
              title="Share item"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            {item.permalinkUrl && (
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            )}
            <ShareMenu
              open={shareOpen}
              url={shareUrl}
              text={shareText}
              onClose={() => setShareOpen(false)}
            />
          </div>
        </div>
      </div>

      {/* Unread dot */}
      {!item.isRead && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary" aria-label="Unread" />
      )}
    </article>
  );
}
