import React, { useState, useEffect, useMemo } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Ban, PauseCircle, PlayCircle, Shield, Mail, Search, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";

const statusStyles = {
  active: "bg-green-500/15 text-green-500",
  suspended: "bg-amber-500/15 text-amber-500",
  blocked: "bg-red-500/15 text-red-500",
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [activitySummary, setActivitySummary] = useState({
    activeUserCount: 0,
    inactiveUserCount: 0,
    totalAffirmations: 0,
    activeAffirmations: 0,
    inactiveAffirmations: 0,
  });
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    setActivityLoading(true);
    setActivityError("");
    const [usersResult, activityResult] = await Promise.allSettled([
      apiClient.entities.User.filter({}),
      apiClient.admin.getUserActivityFeed(),
    ]);

    if (usersResult.status === "fulfilled") {
      const result = usersResult.value;
      const userArr = Array.isArray(result) ? result : result.items || [];
      setUsers(userArr);
    } else {
      setUsers([]);
    }

    if (activityResult.status === "fulfilled") {
      const feed = activityResult.value || {};
      setActivityFeed(Array.isArray(feed.items) ? feed.items : []);
      setActivitySummary({
        activeUserCount: Number(feed.activeUserCount ?? feed.loggedOnUsers ?? 0),
        inactiveUserCount: Number(feed.inactiveUserCount ?? feed.loggedOffUsers ?? 0),
        totalAffirmations: Number(feed.totalAffirmations ?? 0),
        activeAffirmations: Number(feed.activeAffirmations ?? 0),
        inactiveAffirmations: Number(feed.inactiveAffirmations ?? 0),
      });
    } else {
      const message = activityResult.reason?.message || "Could not load active user feed.";
      setActivityError(message);
      setActivityFeed([]);
      setActivitySummary({
        activeUserCount: 0,
        inactiveUserCount: 0,
        totalAffirmations: 0,
        activeAffirmations: 0,
        inactiveAffirmations: 0,
      });
    }

    setLoading(false);
    setActivityLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const filteredActivity = useMemo(() => {
    if (!search.trim()) return activityFeed;
    const q = search.toLowerCase();
    return activityFeed.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.handle || "").toLowerCase().includes(q)
    );
  }, [activityFeed, search]);

  const handleStatusChange = async (userId, newStatus) => {
    setUpdating(userId);
    try {
      await apiClient.entities.User.update(userId, { status: newStatus });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
      );
    } catch (e) {
      console.error("Failed to update user:", e);
    } finally {
      setUpdating(null);
      setConfirm(null);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setUpdating(userId);
    try {
      await apiClient.entities.User.update(userId, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } finally {
      setUpdating(null);
    }
  };

  const requestConfirm = (userId, action, label) => {
    setConfirm({ userId, action, label });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const activeCount = users.filter((u) => (u.status || "active") === "active").length;
  const suspendedCount = users.filter((u) => u.status === "suspended").length;
  const blockedCount = users.filter((u) => u.status === "blocked").length;
  const activeWindowCount = activitySummary.activeUserCount || activityFeed.filter((u) => Boolean(u.isLoggedOn)).length;
  const inactiveCount = activitySummary.inactiveUserCount || (activityFeed.length - activeWindowCount);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Active User Window</h2>
          <button
            onClick={load}
            disabled={loading || activityLoading}
            className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-border bg-background/50">
            <p className="text-2xl font-heading text-foreground">{activityFeed.length}</p>
            <p className="text-xs text-muted-foreground">All users</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-background/50">
            <p className="text-2xl font-heading text-green-500">{activeWindowCount}</p>
            <p className="text-xs text-muted-foreground">Active users</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-background/50">
            <p className="text-2xl font-heading text-muted-foreground">{inactiveCount}</p>
            <p className="text-xs text-muted-foreground">Inactive users</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-background/50">
            <p className="text-2xl font-heading text-primary">{activitySummary.totalAffirmations}</p>
            <p className="text-xs text-muted-foreground">Affirmations tallied</p>
          </div>
        </div>

        {activityError && <p className="text-xs text-destructive">{activityError}</p>}

        {activityLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {filteredActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No users found.</p>
            ) : (
              filteredActivity.map((u) => (
                <div
                  key={`activity-${u.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{u.name || u.email || "Unknown user"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Affirmations: {u.affirmationTally ?? 0}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.isLoggedOn ? "bg-green-500/15 text-green-500" : "bg-muted text-muted-foreground"}`}>
                      {u.isLoggedOn ? "active" : "inactive"}
                    </span>
                    {u.isLoggedOn ? (
                      <Wifi className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-border bg-card/50">
          <p className="text-2xl font-heading text-green-500">{activeCount}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card/50">
          <p className="text-2xl font-heading text-amber-500">{suspendedCount}</p>
          <p className="text-xs text-muted-foreground">Suspended</p>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card/50">
          <p className="text-2xl font-heading text-red-500">{blockedCount}</p>
          <p className="text-xs text-muted-foreground">Blocked</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} user{filtered.length !== 1 ? "s" : ""}.
        {search && users.length !== filtered.length && ` (${users.length} total)`}
      </p>

      {/* User list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
        ) : (
          filtered.map((u) => {
            const status = u.status || "active";
            const isAdmin = u.role === "admin";
            return (
              <div
                key={u.id}
                className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {u.full_name || u.email}
                    </p>
                    {u.full_name && (
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusStyles[status]}`}>
                    {status}
                  </span>
                  {isAdmin && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary flex items-center gap-1">
                      <Shield className="w-3 h-3" /> admin
                    </span>
                  )}

                  {updating === u.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="flex items-center gap-1">
                      {status === "active" && (
                        <>
                          <button
                            onClick={() => requestConfirm(u.id, "suspended", `Suspend ${u.full_name || u.email}?`)}
                            title="Suspend"
                            className="p-1.5 rounded-lg hover:bg-amber-500/15 text-amber-500 transition-colors"
                          >
                            <PauseCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => requestConfirm(u.id, "blocked", `Block ${u.full_name || u.email}?`)}
                            title="Block"
                            className="p-1.5 rounded-lg hover:bg-red-500/15 text-red-500 transition-colors"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {status === "suspended" && (
                        <>
                          <button
                            onClick={() => handleStatusChange(u.id, "active")}
                            title="Activate"
                            className="p-1.5 rounded-lg hover:bg-green-500/15 text-green-500 transition-colors"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => requestConfirm(u.id, "blocked", `Block ${u.full_name || u.email}?`)}
                            title="Block"
                            className="p-1.5 rounded-lg hover:bg-red-500/15 text-red-500 transition-colors"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {status === "blocked" && (
                        <button
                          onClick={() => handleStatusChange(u.id, "active")}
                          title="Activate"
                          className="p-1.5 rounded-lg hover:bg-green-500/15 text-green-500 transition-colors"
                        >
                          <PlayCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleRoleChange(u.id, isAdmin ? "user" : "admin")}
                        title={isAdmin ? "Demote to user" : "Promote to admin"}
                        className="p-1.5 rounded-lg hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div className="max-w-sm w-full mx-4 p-6 rounded-2xl border border-border bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="font-heading text-lg text-foreground">Confirm Action</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">{confirm.label} This will restrict the user's access immediately.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusChange(confirm.userId, confirm.action)}
                disabled={updating === confirm.userId}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
                  confirm.action === "blocked" ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {updating === confirm.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : confirm.action === "blocked" ? "Block" : "Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}