import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Feather, LayoutDashboard, Swords, ShieldCheck, Coins, Award, ArrowLeft, Users, DollarSign, BarChart3,   Radar, UserPlus, FileX, Database, TrendingUp, ShieldAlert, Rocket, Newspaper } from "lucide-react";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminChallenges from "@/components/admin/AdminChallenges";
import AdminTruthScores from "@/components/admin/AdminTruthScores";
import AdminWiseCoins from "@/components/admin/AdminWiseCoins";
import AdminBadges from "@/components/admin/AdminBadges";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminPaywalls from "@/components/admin/AdminPaywalls";
import AdminMetrics from "@/components/admin/AdminMetrics";
import AdminCrawler from "@/components/admin/AdminCrawler";
import AdminAccessRequests from "@/components/admin/AdminAccessRequests";
import AdminContent from "@/components/admin/AdminContent";
import AdminModeration from "@/components/admin/AdminModeration";
import AdminPgAnalytics from "@/components/admin/AdminPgAnalytics";
import AdminTruthTrends from "@/components/admin/AdminTruthTrends";
import AdminGoogleAnalytics from "@/components/admin/AdminGoogleAnalytics";
import AdminFeatureReleases from "@/components/admin/AdminFeatureReleases";
import AdminJournalism from "@/components/admin/AdminJournalism";
import AdminEntityCatalog from "@/components/admin/AdminEntityCatalog";
import AdminCommandCenter from "@/components/admin/AdminCommandCenter";

const tabs = [
  { id: "command-center", label: "Command Center", icon: ShieldAlert },
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "metrics", label: "Site Metrics", icon: BarChart3 },
  { id: "crawler", label: "Crawler", icon: Radar },
  { id: "users", label: "Users", icon: Users },
  { id: "content", label: "Content", icon: FileX },
  { id: "moderation", label: "Moderation", icon: ShieldAlert },
  { id: "paywalls", label: "Paywalls", icon: DollarSign },
  { id: "challenges", label: "Challenges", icon: Swords },
  { id: "truth", label: "Truth Scores", icon: ShieldCheck },
  { id: "truth-trends", label: "Truth Trends", icon: TrendingUp },
  { id: "coins", label: "Wise-Coins", icon: Coins },
  { id: "badges", label: "Badges", icon: Award },
  { id: "access", label: "Access Requests", icon: UserPlus },
  { id: "pg-analytics", label: "PG Analytics", icon: Database },
  { id: "ga-analytics", label: "Google Analytics", icon: BarChart3 },
  { id: "releases", label: "Feature Releases", icon: Rocket },
  { id: "journalism", label: "Journalism", icon: Newspaper },
  { id: "entities", label: "Entities", icon: Database },
];

export default function AdminDashboard() {
  const [active, setActive] = useState("command-center");

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 shrink-0 border-r border-border bg-card/40 flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Feather className="w-6 h-6 text-primary" />
            <span className="font-display text-sm tracking-[0.15em] text-foreground">
              WISE<span className="text-accent">RAVEN</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 tracking-wider uppercase">Admin Console</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                active === t.id
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/60"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to site
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-8 md:p-12 max-w-5xl">
          <h1 className="font-heading text-3xl md:text-4xl text-foreground mb-8 capitalize">
            {tabs.find((t) => t.id === active)?.label}
          </h1>
          {active === "command-center" && <AdminCommandCenter onOpenTab={setActive} />}
          {active === "overview" && <AdminOverview />}
          {active === "metrics" && <AdminMetrics />}
          {active === "crawler" && <AdminCrawler />}
          {active === "users" && <AdminUsers />}
          {active === "content" && <AdminContent />}
          {active === "moderation" && <AdminModeration />}
          {active === "paywalls" && <AdminPaywalls />}
          {active === "challenges" && <AdminChallenges />}
          {active === "truth" && <AdminTruthScores />}
          {active === "truth-trends" && <AdminTruthTrends />}
          {active === "coins" && <AdminWiseCoins />}
          {active === "badges" && <AdminBadges />}
          {active === "access" && <AdminAccessRequests />}
          {active === "pg-analytics" && <AdminPgAnalytics />}
          {active === "ga-analytics" && <AdminGoogleAnalytics />}
          {active === "releases" && <AdminFeatureReleases />}
          {active === "journalism" && <AdminJournalism />}
          {active === "entities" && <AdminEntityCatalog />}
        </div>
      </main>
    </div>
  );
}