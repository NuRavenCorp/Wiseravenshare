import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/client";
import { Loader2, ShieldAlert, Lock, Unlock, Users, UserCheck, UserX, PauseCircle, Activity, KeyRound } from "lucide-react";

const quickActions = [
  { id: "users", label: "User controls" },
  { id: "moderation", label: "Moderation queue" },
  { id: "access", label: "Admin access requests" },
  { id: "releases", label: "Feature releases" },
  { id: "metrics", label: "Site metrics" },
  { id: "entities", label: "Entity catalog" },
];

export default function AdminCommandCenter({ onOpenTab }) {
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState(null);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [users, setUsers] = useState([]);
  const [featureCatalog, setFeatureCatalog] = useState(null);
  const [performance, setPerformance] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [statusRes, meRes, usersRes, catalogRes, perfRes] = await Promise.allSettled([
          apiClient.requestJson("/api/auth/status", { method: "GET" }),
          apiClient.auth.me(),
          apiClient.requestJson("/api/admin/users?page=1&pageSize=500", { method: "GET" }),
          apiClient.requestJson("/api/admin/feature-release/catalog", { method: "GET" }),
          apiClient.requestJson("/api/metrics/performance?top=10", { method: "GET" }),
        ]);

        if (cancelled) return;

        setAuthStatus(statusRes.status === "fulfilled" ? statusRes.value : null);
        setCurrentAdmin(meRes.status === "fulfilled" ? meRes.value : null);
        setFeatureCatalog(catalogRes.status === "fulfilled" ? catalogRes.value : null);
        setPerformance(perfRes.status === "fulfilled" ? perfRes.value : null);

        if (usersRes.status === "fulfilled" && Array.isArray(usersRes.value?.items)) {
          setUsers(usersRes.value.items);
        } else {
          const fallbackUsers = await apiClient.entities.User.filter({}, { limit: 500 });
          if (!cancelled) setUsers(Array.isArray(fallbackUsers?.items) ? fallbackUsers.items : []);
        }
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  const statusCounts = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => (u.status || "active") === "active").length;
    const suspended = users.filter((u) => u.status === "suspended").length;
    const blocked = users.filter((u) => u.status === "blocked").length;
    const admins = users.filter((u) => (u.role || "").toLowerCase() === "admin").length;
    return { total, active, suspended, blocked, admins };
  }, [users]);

  const watchUsers = useMemo(
    () => users.filter((u) => ["suspended", "blocked"].includes((u.status || "").toLowerCase())).slice(0, 12),
    [users],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const cards = [
    { label: "Total users", value: statusCounts.total, icon: Users, tone: "text-primary" },
    { label: "Active users", value: statusCounts.active, icon: UserCheck, tone: "text-green-500" },
    { label: "Suspended", value: statusCounts.suspended, icon: PauseCircle, tone: "text-amber-500" },
    { label: "Blocked", value: statusCounts.blocked, icon: UserX, tone: "text-red-500" },
    { label: "Admin accounts", value: statusCounts.admins, icon: ShieldAlert, tone: "text-cyan-400" },
    { label: "Feature gates active", value: featureCatalog?.gatedCount ?? 0, icon: Lock, tone: "text-violet-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl border border-border bg-card/50">
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <p className="text-base text-foreground font-medium mt-1">
          {currentAdmin?.full_name || currentAdmin?.email || "Admin user"}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="p-5 rounded-2xl border border-border bg-card/50">
            <div className="flex items-center justify-between">
              <card.icon className={`w-5 h-5 ${card.tone}`} />
              <span className="text-3xl font-heading text-foreground">{card.value}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-3">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl border border-border bg-card/50 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h3 className="font-heading text-lg text-foreground">Login & access posture</h3>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Self-registration:{" "}
              <span className={authStatus?.selfRegistrationEnabled ? "text-green-500" : "text-amber-500"}>
                {authStatus?.selfRegistrationEnabled ? "Enabled" : "Disabled"}
              </span>
            </p>
            <p className="text-muted-foreground">
              Team invite login:{" "}
              <span className={authStatus?.teamInviteLoginEnabled ? "text-green-500" : "text-amber-500"}>
                {authStatus?.teamInviteLoginEnabled ? "Enabled" : "Disabled"}
              </span>
            </p>
            <p className="text-muted-foreground">
              JWT issuer/audience/key:{" "}
              <span className={(authStatus?.jwt?.issuerConfigured && authStatus?.jwt?.audienceConfigured && authStatus?.jwt?.keyConfigured) ? "text-green-500" : "text-red-500"}>
                {(authStatus?.jwt?.issuerConfigured && authStatus?.jwt?.audienceConfigured && authStatus?.jwt?.keyConfigured) ? "Configured" : "Incomplete"}
              </span>
            </p>
            <p className="text-muted-foreground">
              Feature release state:{" "}
              <span className="text-foreground">
                {featureCatalog?.releasedCount ?? 0} released / {featureCatalog?.gatedCount ?? 0} gated
              </span>
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card/50 space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="font-heading text-lg text-foreground">Runtime metrics</h3>
          </div>
          {performance ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Total requests: <span className="text-foreground">{performance?.totalRequests ?? 0}</span>
              </p>
              <p className="text-muted-foreground">
                Failed requests: <span className="text-foreground">{performance?.failedRequests ?? 0}</span>
              </p>
              <p className="text-muted-foreground">
                P95 latency: <span className="text-foreground">{Math.round(performance?.p95Ms ?? 0)} ms</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Performance metrics unavailable.</p>
          )}
        </div>
      </div>

      <div className="p-5 rounded-2xl border border-border bg-card/50">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <h3 className="font-heading text-lg text-foreground">Suspensions & blocks watchlist</h3>
        </div>
        {watchUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suspended or blocked users.</p>
        ) : (
          <div className="space-y-2">
            {watchUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{user.name || user.full_name || user.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    user.status === "blocked" ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500"
                  }`}
                >
                  {user.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-5 rounded-2xl border border-border bg-card/50">
        <h3 className="font-heading text-lg text-foreground mb-3">Admin functions</h3>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => onOpenTab?.(action.id)}
              className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors"
            >
              {action.label}
            </button>
          ))}
          <button
            onClick={() => onOpenTab?.("ga-analytics")}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors"
          >
            Google analytics
          </button>
          <button
            onClick={() => onOpenTab?.("pg-analytics")}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors"
          >
            Protected-growth analytics
          </button>
          <button
            onClick={() => onOpenTab?.("truth-trends")}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors"
          >
            Truth trends
          </button>
          <button
            onClick={() => onOpenTab?.("coins")}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors"
          >
            Wise-coin controls
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Use this command center for cross-system state, then open focused tabs for full CRUD operations.
        </p>
      </div>
    </div>
  );
}

