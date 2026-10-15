import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, CheckCircle, XCircle, Clock, Mail, UserPlus } from "lucide-react";

export default function AdminAccessRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const page = await apiClient.entities.AdminAccessRequest.filter(
        {},
        { sort: "-created_date", limit: 50 }
      );
      setRequests(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAction = async (requestId, action) => {
    setProcessing(requestId);
    try {
      const res = await apiClient.functions.invoke("ApproveAdminAccess", {
        request_id: requestId,
        action,
      });
      if (res.data?.error) {
        alert(res.data.error);
      } else {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? { ...r, status: action === "approve" ? "approved" : "denied" }
              : r
          )
        );
      }
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Action failed");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12">
        <UserPlus className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No access requests yet.</p>
      </div>
    );
  }

  const statusStyles = {
    pending: "bg-amber-500/15 text-amber-500",
    approved: "bg-green-500/15 text-green-500",
    denied: "bg-red-500/15 text-red-500",
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Admin access requests are reviewed here. Approving assigns an
        admin-prefixed email (admin-user@domain) and sends an invite so the
        chosen administrator can create a password and join.
      </p>
      {requests.map((r) => (
        <div
          key={r.id}
          className="p-4 rounded-xl border border-border bg-card/50 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">
                  {r.requester_name || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.requester_email}
                </p>
                {r.requested_userid && (
                  <p className="text-xs text-primary/80 truncate">
                    User ID: {r.requested_userid}
                  </p>
                )}
                {r.contact_email && r.contact_email !== r.requester_email && (
                  <a
                    href={`mailto:${r.contact_email}`}
                    className="text-xs text-primary/80 hover:text-primary hover:underline truncate flex items-center gap-1"
                  >
                    Contact: {r.contact_email}
                  </a>
                )}
              </div>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ${statusStyles[r.status]}`}
            >
              {r.status}
            </span>
          </div>

          {r.reason && (
            <p className="text-xs text-muted-foreground bg-background/40 p-3 rounded-lg">
              {r.reason}
            </p>
          )}

          {r.status === "pending" && (
            <div className="flex gap-2">
              <button
                onClick={() => handleAction(r.id, "approve")}
                disabled={processing === r.id}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500/15 text-green-500 hover:bg-green-500/25 transition-colors text-sm disabled:opacity-50"
              >
                {processing === r.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Approve
              </button>
              <button
                onClick={() => handleAction(r.id, "deny")}
                disabled={processing === r.id}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors text-sm disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Deny
              </button>
            </div>
          )}

          {r.status === "approved" && (
            <div className="space-y-1">
              <p className="text-xs text-green-500 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Invite sent — admin can create
                their password
              </p>
              {r.assigned_admin_email && (
                <p className="text-xs text-primary/80 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {r.assigned_admin_email}
                </p>
              )}
            </div>
          )}
          {r.status === "denied" && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Access denied
            </p>
          )}
        </div>
      ))}
    </div>
  );
}