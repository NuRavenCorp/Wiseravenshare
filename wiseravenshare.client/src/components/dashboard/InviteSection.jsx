import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import {
  UserPlus,
  Gift,
  Loader2,
  Mail,
  CheckCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTier, getNextTier } from "@/lib/wiseCoinTiers";

const REWARD_AMOUNT = 25;

export default function InviteSection() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchData = async () => {
    try {
      const [invRes, balAgg] = await Promise.all([
        apiClient.entities.Invitation.filter(
          {},
          { sort: "-created_date", limit: 50 }
        ),
        apiClient.entities.WiseCoinTransaction.aggregate({ sum: "amount" }),
      ]);
      setInvitations(invRes.items || []);
      setBalance(balAgg.rows[0]?.sum_amount || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiClient.functions.invoke("InviteUserWithReward", {
        email: email.trim(),
      });
      setSuccess(
        `Invitation sent to ${email.trim()}. ${REWARD_AMOUNT} WiseCoins will be credited when they join.`
      );
      setEmail("");
      fetchData();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Failed to send invitation";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Invite & Earn
            </p>
            <p className="text-xs text-muted-foreground">
              Earn {REWARD_AMOUNT} WiseCoins when your invitee joins
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-lg font-display text-accent text-glow-gold">
              {balance}
            </p>
            <p className={`text-xs font-medium ${getTier(balance).color}`}>
              {getTier(balance).name}
            </p>
          </div>
        </div>

        {getNextTier(balance) && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-muted-foreground">
                Progress to {getNextTier(balance).name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {balance} / {getNextTier(balance).min}
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (balance / getNextTier(balance).min) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              className="pl-9"
            />
          </div>
          <Button
            onClick={handleInvite}
            disabled={submitting || !email.trim()}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            Invite
          </Button>
        </div>

        {error && (
          <p className="text-xs text-destructive mt-2">{error}</p>
        )}
        {success && (
          <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> {success}
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Sent Invitations
        </p>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No invitations sent yet.
          </p>
        ) : (
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  {inv.status === "accepted" ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {inv.invitee_email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.status === "accepted"
                      ? `Joined - +${inv.reward_amount} WiseCoins`
                      : `Pending - +${inv.reward_amount} on join`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}