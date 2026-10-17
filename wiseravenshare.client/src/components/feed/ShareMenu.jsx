import React, { useEffect, useRef, useState } from "react";
import { Facebook, Twitter, Youtube, Link2, Share2, MessageCircle, Send } from "lucide-react";

const PLATFORMS = [
  { key: "facebook", label: "Facebook", icon: Facebook, color: "text-[#1877F2]",
    href: (url, text) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}` },
  { key: "x", label: "X", icon: Twitter, color: "text-foreground",
    href: (url, text) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "text-[#25D366]",
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
  { key: "youtube", label: "YouTube", icon: Youtube, color: "text-[#FF0000]",
    href: (_url, text) => `https://www.youtube.com/results?search_query=${encodeURIComponent(text)}` },
  { key: "telegram", label: "Telegram", icon: Send, color: "text-[#0088cc]",
    href: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
];

export default function ShareMenu({ open, url, text, onClose, onShare }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const openShare = (href) => {
    window.open(href, "_blank", "noopener,noreferrer,width=640,height=560");
    onShare?.();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onShare?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { /* clipboard unavailable */ }
  };

  return (
    <div ref={ref} className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-border bg-popover shadow-xl z-30 p-2">
      <p className="px-2 pt-1 pb-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-1.5">
        <Share2 className="w-3 h-3" /> Share to
      </p>
      <div className="flex flex-col gap-0.5">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            onClick={() => openShare(p.href(url, text))}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors text-left"
          >
            <p.icon className={`w-4 h-4 ${p.color}`} />
            {p.label}
          </button>
        ))}
        <div className="h-px bg-border my-1" />
        <button
          onClick={copyLink}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors text-left"
        >
          <Link2 className={`w-4 h-4 ${copied ? "text-emerald-400" : "text-primary"}`} />
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}