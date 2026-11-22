import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Menu, X, MessageCircle, LogOut, Bot, CalendarDays, User, Loader2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import RavenChirpToast from "@/components/RavenChirpToast";
import VibePill from "@/components/vibe/VibePill";

const links = [
  { label: "Mission", href: "/#mission" },
  { label: "Features", href: "/#features" },
  { label: "Ravensight", to: "/ravensight" },
  { label: "Music", to: "/media" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const fileInputRef = useRef(null);
  const { user, isAuthenticated, logout, checkUserAuth } = useAuth();
  const avatarUrl = user?.avatar || user?.avatar_uri || user?.avatarUrl || "";
  const avatarLabel = user?.displayName || user?.name || user?.handle || user?.username || "Account";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setFollowCounts({ followers: 0, following: 0 });
      return;
    }

    let active = true;
    const loadFollowCounts = async () => {
      const [followingRes, followersRes] = await Promise.allSettled([
        apiClient.follows.following(),
        apiClient.follows.followers(user.id),
      ]);

      if (!active) return;

      setFollowCounts({
        following: followingRes.status === "fulfilled" ? (followingRes.value?.followingCount ?? 0) : 0,
        followers: followersRes.status === "fulfilled" ? (followersRes.value?.followersCount ?? 0) : 0,
      });
    };

    loadFollowCounts();
    const refreshTimer = window.setInterval(loadFollowCounts, 60000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [isAuthenticated, user?.id]);

  const handleAvatarSelect = () => {
    if (!isAuthenticated || avatarUploading) return;
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event) => {
    const file = event.target?.files?.[0];
    event.target.value = "";
    if (!file || !isAuthenticated) return;
    setAvatarUploading(true);
    try {
      await apiClient.users.uploadAvatar(user?.id || "me", file);
      await checkUserAuth();
    } catch {
      // Preserve existing navbar behavior on upload failure (silent non-blocking).
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <>
    <RavenChirpToast />
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-background/80 backdrop-blur-xl border-b border-border/60" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-2.5 group shrink-0">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={handleAvatarSelect}
                className="relative w-10 h-10 rounded-full overflow-hidden border border-border bg-secondary/40 flex items-center justify-center group-hover:scale-110 transition-transform duration-500"
                aria-label="User avatar upload container"
                title={avatarUploading ? "Uploading avatar..." : "Click to upload avatar photo"}
              >
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={avatarLabel} className="w-full h-full object-cover" fittingType="fill" />
                ) : (
                  <User className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center border border-background">
                  {avatarUploading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Camera className="w-2.5 h-2.5" />}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <div className="flex flex-col leading-none">
                <span className="font-display text-lg tracking-[0.2em] text-foreground">WRS</span>
                <span className="text-[10px] text-muted-foreground mt-1">
                  {followCounts.followers.toLocaleString()} followers • {followCounts.following.toLocaleString()} following
                </span>
              </div>
            </>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2.5"
              aria-label="Sign in to upload avatar"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden border border-border bg-secondary/40 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="font-display text-lg tracking-[0.2em] text-foreground">WRS</span>
            </Link>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-9">
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
              <Link to="/messages" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Messages
              </Link>
              <Link to="/ravenchat" className="text-sm text-accent hover:text-accent/80 transition-colors flex items-center gap-1.5">
                <Bot className="w-4 h-4" /> RavenChat
              </Link>
              <Link to="/planner" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" /> Planner
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

        <button className="lg:hidden text-foreground" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {open && (
        <div className="lg:hidden bg-background/95 backdrop-blur-xl border-b border-border/60 px-6 py-6 flex flex-col gap-5">
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
              <Link to="/messages" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Messages
              </Link>
              <Link to="/ravenchat" onClick={() => setOpen(false)} className="text-accent hover:text-accent/80 flex items-center gap-1.5">
                <Bot className="w-4 h-4" /> RavenChat
              </Link>
              <Link to="/planner" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" /> Planner
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