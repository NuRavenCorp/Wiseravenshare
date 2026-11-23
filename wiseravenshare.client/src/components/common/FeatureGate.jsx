import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Sparkles, Shield, ArrowRight, Loader2 } from "lucide-react";

const AccessGateContext = createContext(null);

export function AccessGateProvider({ children }) {
  const [status, setStatus] = useState({
    masterGateOpen: true,
    userHasAccess: true,
    isPayingUser: false,
    isAdmin: false,
    discountPercent: 70,
    loading: true,
    error: null,
  });

  const refreshStatus = useCallback(async () => {
    try {
      const data = await apiClient.accessGates.getStatus();
      setStatus((prev) => ({
        ...prev,
        masterGateOpen: Boolean(data?.masterGateOpen ?? true),
        userHasAccess: Boolean(data?.userHasAccess ?? true),
        isPayingUser: Boolean(data?.isPayingUser ?? false),
        isAdmin: Boolean(data?.isAdmin ?? false),
        discountPercent: data?.discountPercent ?? 70,
        loading: false,
        error: null,
      }));
      return data;
    } catch (err) {
      // Default to open if network/offline error occurs so users are not trapped
      setStatus((prev) => ({
        ...prev,
        masterGateOpen: true,
        userHasAccess: true,
        loading: false,
        error: err.message,
      }));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    // Poll every 30 seconds for dynamic administrative gate updates
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  return (
    <AccessGateContext.Provider value={{ ...status, refreshStatus }}>
      {children}
    </AccessGateContext.Provider>
  );
}

export function useAccessGate() {
  const context = useContext(AccessGateContext);
  if (!context) {
    // Fallback if rendered outside of provider
    return {
      masterGateOpen: true,
      userHasAccess: true,
      isPayingUser: false,
      isAdmin: false,
      discountPercent: 70,
      loading: false,
      refreshStatus: async () => {},
    };
  }
  return context;
}

export default function FeatureGate({
  featureKey,
  featureName = "Premium Feature",
  description,
  fallback,
  children,
}) {
  const { masterGateOpen, userHasAccess, isPayingUser, isAdmin, discountPercent, loading } = useAccessGate();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  // If user has access (either Master Gate is OPEN, user has paid, or is admin), render children
  if (userHasAccess || masterGateOpen || isPayingUser || isAdmin) {
    return <>{children}</>;
  }

  // If custom fallback provided
  if (fallback) {
    return typeof fallback === "function" ? fallback({ discountPercent }) : fallback;
  }

  // Default Locked Gate Presentation
  return (
    <div className="rounded-2xl border border-destructive/30 bg-card/80 p-8 text-center max-w-xl mx-auto my-6 shadow-xl backdrop-blur-sm space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto text-destructive">
        <Lock className="w-7 h-7" />
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
          <Sparkles className="w-3.5 h-3.5" />
          <span>70% OFF All Plans Active</span>
        </div>
        <h3 className="text-xl font-heading font-bold text-foreground">
          {featureName} is Gated
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description ||
            "Master feature gates have been closed by administration. Complete a purchase to unlock all feature gates permanently, or contact an administrator."}
        </p>
      </div>

      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/dashboard?tab=subscriptions">
          <Button className="w-full sm:w-auto font-semibold gap-2 shadow-lg">
            <span>Unlock All Gates (70% OFF)</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
        <Link to="/admin">
          <Button variant="outline" className="w-full sm:w-auto text-xs text-muted-foreground gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>Admin Access</span>
          </Button>
        </Link>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        All plans reduced by 70% · Starting at $1.50/mo · Instant unlock
      </p>
    </div>
  );
}
