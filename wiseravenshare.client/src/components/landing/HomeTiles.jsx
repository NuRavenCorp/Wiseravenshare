import React from "react";
import { Link } from "react-router-dom";
import {
  MessageCircle,
  Radio,
  Newspaper,
  Scale,
  Music4,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const tiles = [
  {
    icon: MessageCircle,
    title: "Social Feed",
    to: "/social",
    body: "Posts, likes, comments, shares, and hashtags — the social fabric woven with integrity.",
  },
  {
    icon: Radio,
    title: "Podcasts",
    to: "/podcasts",
    body: "Multi-camera podcast studio with a four-source video feed array — collaborate across rooms and cities.",
  },
  {
    icon: Newspaper,
    title: "Journalism",
    to: "/journalism",
    body: "Anyone can report. Stories run through truth filters and AI detection, then fill the who, what, where, when, why, and how.",
  },
  {
    icon: Scale,
    title: "Truth Scoring",
    to: "/truthseeker",
    body: "AI-verified truth scoring on every post — earn trust, build reputation, and let honesty lead.",
  },
  {
    icon: Music4,
    title: "Music & Media",
    to: "/media",
    body: "Upload tracks, connect instruments, sync recordings, and jam in real time with creators worldwide.",
  },
  {
    icon: Radio,
    title: "FM Radio",
    to: "/fm-radio",
    body: "Listen to live stations, tune in, and explore the FM Radio tools.",
  },
  {
    icon: LayoutDashboard,
    title: "Creator Studio",
    to: "/dashboard",
    body: "Your dashboard — posts, analytics, planner, teams, incentives, and subscriptions in one place.",
  },
];

export default function HomeTiles({ detailed = false }) {
  const { isAuthenticated } = useAuth();
  const dest = (to) => (isAuthenticated ? to : "/login");

  if (detailed) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full text-left">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.title}
              to={dest(t.to)}
              className="group block p-5 rounded-xl border border-border bg-card/50 hover:border-primary/40 hover:bg-card transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-heading text-foreground">{t.title}</p>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors ml-auto shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.body}</p>
              <p className="text-[11px] text-primary mt-2">
                {isAuthenticated ? "Open" : "Login to open"}
              </p>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.title}
            to={dest(t.to)}
            className="group flex items-center gap-3 p-4 rounded-xl border border-border bg-card/50 hover:border-primary/40 hover:bg-card transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t.title}</p>
              <p className="text-xs text-muted-foreground">
                {isAuthenticated ? "Open" : "Login to open"}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}
