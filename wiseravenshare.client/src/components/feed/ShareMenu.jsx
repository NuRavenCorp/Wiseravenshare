import React, { useEffect, useRef, useState } from "react";
import { Facebook, Twitter, Link2, Share2, MessageCircle, Send, Instagram, Globe } from "lucide-react";

const PLATFORMS = [
  { key: "facebook", label: "Facebook", icon: Facebook, color: "text-[#1877F2]",
    href: (url, text) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}` },
  { key: "twitter", label: "Twitter / X", icon: Twitter, color: "text-foreground",
    href: (url, text) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  { key: "reddit", label: "Reddit", icon: MessageCircle, color: "text-[#FF4500]",
    href: (url, text) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
  { key: "instagram", label: "Instagram", icon: Instagram, color: "text-[#E1306C]",
    href: () => "https://www.instagram.com/", copyFirst: true },
  { key: "tiktok", label: "TikTok", icon: Globe, color: "text-[#25F4EE]",
    href: () => "https://www.tiktok.com/upload", copyFirst: true },
  { key: "telegram", label: "Telegram", icon: Send, color: "text-[#0088cc]",
    href: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
];

export default function ShareMenu({ open, url, text, onClose, onShare }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setStatusMessage("");
    }
  }, [open]);

  if (!open) return null;

  const openShare = async (platform) => {
    if (platform.copyFirst) {
      try {
        await navigator.clipboard.writeText(`${text} ${url}`.trim());
        setStatusMessage(`Copied for ${platform.label}. Paste it there.`);
      } catch {
        setStatusMessage(`Open ${platform.label}, then paste your link.`);
      }
    }
    const href = platform.href(url, text);
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
            onClick={() => { void openShare(p); }}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors text-left"
          >
            <p.icon className={`w-4 h-4 ${p.color}`} />
            {p.label}
          </button>
        ))}
        {statusMessage && (
          <p className="px-2.5 py-1 text-[11px] text-muted-foreground">{statusMessage}</p>
        )}
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