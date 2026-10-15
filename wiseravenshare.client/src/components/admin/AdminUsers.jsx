import React, { useState, useEffect, useMemo } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Ban, PauseCircle, PlayCircle, Shield, Mail, Search, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";

const statusStyles = {
  active: "bg-green-500/15 text-green-500",
  suspended: "bg-amber-500/15 text-amber-500",
  blocked: "bg-red-500/15 text-red-500",
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiClient.entities.User.filter({});
      const userArr = Array.isArray(result) ? result : result.items || [];
      setUsers(userArr);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="space-y-4">
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