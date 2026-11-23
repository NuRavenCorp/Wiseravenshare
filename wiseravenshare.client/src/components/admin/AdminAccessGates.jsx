import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  DollarSign,
  UserCheck,
  UserX,
  Sparkles,
  RefreshCw,
  Plus,
  History,
} from "lucide-react";

export default function AdminAccessGates() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [granting, setGranting] = useState(false);
  const [newIdentifier, setNewIdentifier] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [summaryData, setSummaryData] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await apiClient.accessGates.getAdminSummary();
      setSummaryData(data);
    } catch (err) {
      toast({
        title: "Failed to load gate status",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleGate = async (shouldOpen) => {
    try {
      setToggling(true);
      const res = await apiClient.accessGates.toggle(
        shouldOpen,
        shouldOpen ? "All access granted by admin" : "Default locked until payment received"
      );
      toast({
        title: shouldOpen ? "Gates Opened" : "Gates Closed",
        description: res.message,
      });
      await loadData();
    } catch (err) {
      toast({
        title: "Failed to toggle gates",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setToggling(false);
    }
  };

  const handleGrantKey = async (e) => {
    e.preventDefault();
    if (!newIdentifier.trim()) return;

    try {
      setGranting(true);
      await apiClient.accessGates.grantUser(newIdentifier.trim(), grantReason.trim() || "Manual grant from admin console");
      toast({
        title: "All-Access Key Granted",
        description: `Key given to ${newIdentifier}. All gates unlocked for this user.`,
      });
      setNewIdentifier("");
      setGrantReason("");
      await loadData();
    } catch (err) {
      toast({
        title: "Failed to grant key",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGranting(false);
    }
  };

  const handleRevokeKey = async (identifier) => {
    try {
      await apiClient.accessGates.revokeUser(identifier, "Revoked from admin console");
      toast({
        title: "Key Revoked",
        description: `Access key revoked for ${identifier}.`,
      });
      await loadData();
    } catch (err) {
      toast({
        title: "Failed to revoke key",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const status = summaryData?.status;
  const state = summaryData?.state;
  const isOpen = Boolean(status?.masterGateOpen);
  const paidGrants = state?.paymentGrants || [];
  const auditLogs = state?.auditLog || [];

  const catalogPricing = [
    { name: "IP Protection Basic", orig: "$5/mo ($50/yr)", discounted: "$1.50/mo ($15/yr)", tag: "Rights" },
    { name: "IP Protection Standard", orig: "$15/mo ($150/yr)", discounted: "$4.50/mo ($45/yr)", tag: "Rights" },
    { name: "IP Protection Pro", orig: "$30/mo ($300/yr)", discounted: "$9.00/mo ($90/yr)", tag: "Rights" },
    { name: "Creator Pro", orig: "$19/mo ($190/yr)", discounted: "$5.70/mo ($57/yr)", tag: "Core" },
    { name: "WRS Growth Suite", orig: "$49/mo ($490/yr)", discounted: "$14.70/mo ($147/yr)", tag: "Growth" },
    { name: "WRS Studio Plus", orig: "$99/mo ($990/yr)", discounted: "$29.70/mo ($297/yr)", tag: "Studio" },
    { name: "WRS Karaoke Pro", orig: "$5/mo ($50/yr)", discounted: "$1.50/mo ($15/yr)", tag: "Karaoke" },
    { name: "WRS Podcast Pro Bundle", orig: "$149/mo ($1490/yr)", discounted: "$44.70/mo ($447/yr)", tag: "Bundle" },
  ];

  return (
    <div className="space-y-8">
      {/* ── Master Gate Switch Card ──────────────────────── */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          isOpen
            ? "border-green-500/40 bg-gradient-to-br from-green-500/10 via-card/50 to-transparent"
            : "border-red-500/40 bg-gradient-to-br from-red-500/10 via-card/50 to-transparent"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isOpen ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }`}
              >
                {isOpen ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-heading font-bold text-foreground">
                    Master Feature Gate: {isOpen ? "OPEN (All Access)" : "CLOSED (Default Locked)"}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      isOpen
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-red-500/20 text-red-400 border border-red-500/30"
                    }`}
                  >
                    {isOpen ? "Keys Active" : "Locked by Default"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last changed: {status?.lastChangedUtc ? new Date(status.lastChangedUtc).toLocaleString() : "System default"}{" "}
                  by <span className="text-foreground font-mono">{status?.changedBy || "system"}</span>
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground max-w-xl">
              {isOpen
                ? "The master keys are currently in place giving all users full, unrestricted access to every pricing feature. To enforce subscription payments, close the gates below."
                : "The master gates are currently CLOSED. All pricing feature elements are default locked. Access is granted only to users with confirmed payments received or manual keys."}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isOpen ? (
              <Button
                variant="destructive"
                size="lg"
                disabled={toggling}
                onClick={() => handleToggleGate(false)}
                className="gap-2 shadow-lg"
              >
                {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Close Gates (Default Locked)
              </Button>
            ) : (
              <Button
                variant="default"
                size="lg"
                disabled={toggling}
                onClick={() => handleToggleGate(true)}
                className="gap-2 bg-green-600 hover:bg-green-500 text-white shadow-lg"
              >
                {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                Open Gates (Grant All Access)
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={loadData} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── 70% Discounted Pricing Tier Element Grid ────────── */}
      <div className="p-6 rounded-2xl border border-border bg-card/50 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-bold text-foreground">
              Redone Stripe Subscriptions (70% Price Reduction Active)
            </h3>
          </div>
          <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            70% OFF Applied Across All Tiers
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          All catalog amounts have been reduced by 70%. When payments are received for any plan, paying users automatically receive permanent access keys to all gates.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {catalogPricing.map((item) => (
            <div key={item.name} className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {item.tag}
                </span>
              </div>
              <div className="text-xs text-muted-foreground line-through">{item.orig}</div>
              <div className="text-sm font-bold text-green-400">{item.discounted}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Key Grants & Paying Users Section ──────────────── */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-2xl border border-border bg-card/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h3 className="font-heading text-lg font-bold text-foreground">
                All-Access Key Holders ({paidGrants.length})
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">
              Paying users & admin key grants
            </span>
          </div>

          {paidGrants.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border rounded-xl">
              <p className="text-sm text-muted-foreground">
                No individual user grants recorded yet. When a user completes checkout or receives payment, their access key is automatically recorded here.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {paidGrants.map((grant) => (
                <div
                  key={grant.grantId || grant.userId + grant.paymentReceivedAtUtc}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-background/50 text-sm"
                >
                  <div className="space-y-0.5 min-w-0 pr-3">
                    <p className="font-medium text-foreground truncate">
                      {grant.email || grant.userId || "Authorized User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      Plan: <span className="text-primary font-mono">{grant.planKey}</span> · Source: {grant.source} ·{" "}
                      {new Date(grant.paymentReceivedAtUtc).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeKey(grant.userId || grant.email)}
                    className="text-destructive hover:bg-destructive/10 text-xs shrink-0"
                  >
                    <UserX className="w-3.5 h-3.5 mr-1" />
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Manual Key Grant Form ─────────────────────────── */}
        <div className="p-6 rounded-2xl border border-border bg-card/50 space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-bold text-foreground">
              Grant All-Access Key
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Place an all-access key directly in a user&apos;s hands. Unlocks all feature gates permanently even when gates are closed.
          </p>

          <form onSubmit={handleGrantKey} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                User Email or ID
              </label>
              <Input
                placeholder="user@example.com or user_id"
                value={newIdentifier}
                onChange={(e) => setNewIdentifier(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Reason / Note (Optional)
              </label>
              <Input
                placeholder="VIP creator / Early subscriber"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={granting || !newIdentifier.trim()} className="w-full gap-2">
              {granting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              Grant Permanent Key
            </Button>
          </form>
        </div>
      </div>

      {/* ── Audit History ──────────────────────────────────── */}
      {auditLogs.length > 0 && (
        <div className="p-6 rounded-2xl border border-border bg-card/50 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="font-heading text-base font-bold text-foreground">Gate Action Audit Log</h3>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs text-muted-foreground font-mono">
            {auditLogs.slice().reverse().map((log, idx) => (
              <div key={idx} className="p-2 rounded-lg bg-background/40 flex items-center justify-between gap-4">
                <span className="text-primary">{new Date(log.timestampUtc).toLocaleString()}</span>
                <span className="font-semibold text-foreground">{log.action}</span>
                <span className="truncate text-muted-foreground">{log.details}</span>
                <span className="text-[10px] text-muted-foreground/70 shrink-0">by {log.actor}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
