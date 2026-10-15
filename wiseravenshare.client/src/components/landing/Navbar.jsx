import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X, MessageCircle, LogOut, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { useAuth } from "@/lib/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import RavenChirpToast from "@/components/RavenChirpToast";
import VibePill from "@/components/vibe/VibePill";

const BRAND_LOGO = "https://media.apiClient.com/images/public/6acad64c240f9153977f3360/5f68aaa8d_FullLogo_Transparent_NoBuffer.png";

const links = [
  { label: "Mission", href: "/#mission" },
  { label: "Features", href: "/#features" },
  { label: "Ravensight", to: "/ravensight" },
  { label: "Music", to: "/media" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
    <RavenChirpToast />
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-background/80 backdrop-blur-xl border-b border-border/60" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5 group">
          <Image src={BRAND_LOGO} alt="WiseRavenShare" className="w-10 h-10 rounded-full group-hover:scale-110 transition-transform duration-500" fittingType="fill" />
          <span className="font-display text-lg tracking-[0.2em] text-foreground">
            WISE<span className="text-accent">RAVEN</span>SHARE
          </span>
        </a>

        <div className="hidden md:flex items-center gap-9">
          {links.map((l) => {
            if (l.to) {
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className="text-sm text-accent hover:text-accent/80 transition-colors tracking-wide"
                >
                  {l.label}
                </Link>
              );
            }
            return (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-wide"
              >
                {l.label}
              </a>
            );
          })}
          <Link
            to="/ai-news"
            className="text-sm text-accent hover:text-accent/80 transition-colors tracking-wide flex items-center gap-1.5"
          >
            AI News
          </Link>
          <Link
            to="/social"
            className="text-sm text-accent hover:text-accent/80 transition-colors tracking-wide flex items-center gap-1.5"
          >
            Social
          </Link>
          <VibePill />
          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              <Link to="/truthseeker" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                TruthSeeker
              </Link>
              <Link to="/journalism" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Journalism
              </Link>
              <Link to="/dashboard" className="text-sm text-accent hover:text-accent/80 transition-colors">
                Studio
              </Link>
              <Link to="/media" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Media
              </Link>
              <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Library
              </Link>
              <Link to="/webrtc-studio" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                <Radio className="w-4 h-4" /> WebRTC
              </Link>
              <Link to="/matrix-lab" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Matrix Lab
              </Link>
              <Link to="/messages" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Messages
              </Link>
              <NotificationBell />
              <Button onClick={() => logout()} variant="outline" className="rounded-full px-6">
                <LogOut className="w-4 h-4" /> Leave
              </Button>
            </div>
          ) : (
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6">
              <Link to="/login">Enter the Flock</Link>
            </Button>
          )}
        </div>

        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border/60 px-6 py-6 flex flex-col gap-5">
          {links.map((l) => {
            if (l.to) {
              return (
                <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="text-accent hover:text-accent/80">
                  {l.label}
                </Link>
              );
            }
            return (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                {l.label}
              </a>
            );
          })}
          <Link to="/ai-news" onClick={() => setOpen(false)} className="text-accent hover:text-accent/80">
            AI News
          </Link>
          <Link to="/social" onClick={() => setOpen(false)} className="text-accent hover:text-accent/80">
            Social
          </Link>
          {isAuthenticated ? (
            <>
              <Link to="/truthseeker" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                TruthSeeker
              </Link>
              <Link to="/journalism" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                Journalism
              </Link>
              <Link to="/dashboard" onClick={() => setOpen(false)} className="text-accent hover:text-accent/80">
                Studio
              </Link>
              <Link to="/media" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                Media
              </Link>
              <Link to="/library" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                Library
              </Link>
              <Link to="/webrtc-studio" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <Radio className="w-4 h-4" /> WebRTC
              </Link>
              <Link to="/matrix-lab" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                Matrix Lab
              </Link>
              <Link to="/messages" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Messages
              </Link>
              <Button onClick={() => logout()} variant="outline" className="rounded-full">
                <LogOut className="w-4 h-4" /> Leave
              </Button>
            </>
          ) : (
            <Button asChild className="bg-primary text-primary-foreground rounded-full">
              <Link to="/login">Enter the Flock</Link>
            </Button>
          )}
        </div>
      )}
    </header>
    </>
  );
}