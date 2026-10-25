import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { useBrandLogo } from "@/lib/branding";
import { LogIn, LogOut, GraduationCap, ChevronUp } from "lucide-react";
import HomeTiles from "@/components/landing/HomeTiles";
import PostsFeed from "@/components/feed/PostsFeed";

const INTRO_KEY = "wrs_intro_seen";

export default function Home() {
  const { isAuthenticated, logout } = useAuth();
  const logoUrl = useBrandLogo();
  const [introSeen, setIntroSeen] = useState(true);
  const [learnMode, setLearnMode] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(INTRO_KEY);
    if (!seen) {
      setIntroSeen(false);
      setLearnMode(true);
    }
  }, []);

  const finishLearning = () => {
    localStorage.setItem(INTRO_KEY, "1");
    setIntroSeen(true);
    setLearnMode(false);
  };

  const returnToLearn = () => setLearnMode(true);
  const collapseLearn = () => setLearnMode(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 h-20 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <Image src={logoUrl} alt="WiseRavenShare" className="w-9 h-9 rounded-full" fittingType="fill" />
          <span className="font-display text-sm tracking-[0.2em] text-foreground">
            WISE<span className="text-accent">RAVEN</span>SHARE
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">Studio</Link>
              <Button onClick={() => logout()} variant="outline" className="rounded-full">
                <LogOut className="w-4 h-4" /> Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/register" className="text-sm text-muted-foreground hover:text-foreground">Sign up</Link>
              <Button asChild className="rounded-full">
                <Link to="/login"><LogIn className="w-4 h-4" /> Login</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 px-6 py-16">
        <div className="mx-auto max-w-5xl space-y-14">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h1 className="font-display text-4xl md:text-5xl tracking-wide text-foreground">
              WISE<span className="text-accent">RAVEN</span>SHARE
            </h1>
            <p className="text-base text-muted-foreground">
              Share, create, and verify — a creator platform built on integrity.
            </p>

            <HomeTiles detailed={learnMode} />

            {learnMode ? (
              <button
                onClick={introSeen ? collapseLearn : finishLearning}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <ChevronUp className="w-3 h-3" />
                {introSeen ? "Show compact view" : "I'm ready — hide the descriptions"}
              </button>
            ) : (
              <button
                onClick={returnToLearn}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
              >
                <GraduationCap className="w-3.5 h-3.5" /> Learn about the features
              </button>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              {isAuthenticated ? (
                <Button asChild className="rounded-full px-8"><Link to="/dashboard">Enter Studio</Link></Button>
              ) : (
                <>
                  <Button asChild className="rounded-full px-8"><Link to="/login"><LogIn className="w-4 h-4" /> Login</Link></Button>
                  <Button asChild variant="outline" className="rounded-full px-8"><Link to="/register">Sign up</Link></Button>
                </>
              )}
            </div>
          </div>

          <section className="space-y-5">
            <div className="text-center space-y-2">
              <h2 className="font-heading text-2xl text-foreground">Recent Posts</h2>
              <p className="text-sm text-muted-foreground">
                See the latest posts from the flock right on the main page.
              </p>
            </div>
            <PostsFeed />
          </section>
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-muted-foreground border-t border-border/40">
        © {new Date().getFullYear()} WiseRavenShare
      </footer>
    </div>
  );
}