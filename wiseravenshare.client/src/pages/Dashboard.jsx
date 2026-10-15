import React, { useState } from "react";
import Navbar from "@/components/landing/Navbar";
import { User, Bookmark, Calendar, Lightbulb, Users, Feather, UserPlus, TrendingUp, BarChart3, Radio, PenSquare, MessageCircle, LayoutDashboard, CreditCard } from "lucide-react";
import TodaysVibe from "@/components/vibe/TodaysVibe";
import VibeSidebarWidget from "@/components/vibe/VibeSidebarWidget";
import ProfileSection from "@/components/dashboard/ProfileSection";
import BookmarksSection from "@/components/dashboard/BookmarksSection";
import PlannerSection from "@/components/dashboard/PlannerSection";
import ScratchboardSection from "@/components/dashboard/ScratchboardSection";
import TeamsSection from "@/components/dashboard/TeamsSection";
import InviteSection from "@/components/dashboard/InviteSection";
import IncentivesSection from "@/components/dashboard/IncentivesSection";
import AnalyticsSection from "@/components/dashboard/AnalyticsSection";
import SubscriptionPlans from "@/components/dashboard/SubscriptionPlans";
import ContentPerformance from "@/components/dashboard/ContentPerformance";
import PostComposer from "@/components/feed/PostComposer";
import ThreadsWidget from "@/components/dashboard/ThreadsWidget";
import ActivityHub from "@/components/dashboard/ActivityHub";

const sections = [
  { id: "hub", label: "Activity Hub", icon: LayoutDashboard },
  { id: "create", label: "Create Post", icon: PenSquare },
  { id: "threads", label: "Threads", icon: MessageCircle },
  { id: "vibe", label: "Today's Vibe", icon: Radio },
  { id: "profile", label: "Profile & Settings", icon: User },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { id: "planner", label: "Daily Planner", icon: Calendar },
  { id: "scratchboard", label: "Scratchboard", icon: Lightbulb },
  { id: "teams", label: "Teams", icon: Users },
  { id: "invite", label: "Invite & Earn", icon: UserPlus },
  { id: "incentives", label: "Incentives", icon: TrendingUp },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "content", label: "Content Performance", icon: TrendingUp },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
];

export default function Dashboard() {
  const [active, setActive] = useState("hub");
  const current = sections.find((s) => s.id === active);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 pt-24 pb-8">
        <div className="grid md:grid-cols-[240px_1fr] gap-6">
          <aside className="rounded-lg border border-border bg-card p-4 h-fit md:sticky md:top-24">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
              <Feather className="w-5 h-5 text-primary" />
              <span className="font-display text-sm tracking-wider">Creator Studio</span>
            </div>
            <VibeSidebarWidget />
            <nav className="space-y-1">
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      active === s.id
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {s.label}
                  </button>
                );
              })}
            </nav>
          </aside>
          <div>
            <h1 className="font-heading text-2xl text-foreground mb-6 text-glow">{current.label}</h1>
            {active === "hub" && <ActivityHub />}
            {active === "create" && <PostComposer />}
            {active === "threads" && <ThreadsWidget />}
            {active === "vibe" && <TodaysVibe />}
            {active === "profile" && <ProfileSection />}
            {active === "bookmarks" && <BookmarksSection />}
            {active === "planner" && <PlannerSection />}
            {active === "scratchboard" && <ScratchboardSection />}
            {active === "teams" && <TeamsSection />}
            {active === "invite" && <InviteSection />}
            {active === "incentives" && <IncentivesSection />}
            {active === "analytics" && <AnalyticsSection />}
            {active === "content" && <ContentPerformance />}
            {active === "subscriptions" && <SubscriptionPlans />}
          </div>
        </div>
      </div>
    </div>
  );
}