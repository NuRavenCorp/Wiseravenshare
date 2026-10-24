import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Lock, Crown, Sparkles, Rocket, Music, Mic2 } from "lucide-react";

const PLAN_ICONS = {
  rights_basic: Music,
  rights_standard: Music,
  rights_pro: Music,
  creator_pro: Crown,
  growth_suite: Rocket,
  studio_plus: Sparkles,
  karaoke_pro: Mic2,
  podcast_pro: Music,
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatAmount = (amount, billingCycle) =>
  `${currencyFormatter.format(amount)}/${billingCycle === "annual" ? "yr" : "mo"}`;

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [catalog, subscription] = await Promise.all([
          apiClient.payments.getCatalog(),
          apiClient.billing.getSubscription(),
        ]);

        if (cancelled) {
          return;
        }

        setPlans(catalog?.plans || []);
        setActiveSubscription(subscription || null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Could not load subscription plans.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const activePlanKey = activeSubscription?.hasActiveSubscription ? activeSubscription.planKey : null;

  const plansWithIcons = useMemo(
    () =>
      plans.map((plan) => ({
        ...plan,
        Icon: PLAN_ICONS[plan.planId] || Crown,
      })),
    [plans]
  );

  const handleCheckout = async (planId, billingCycle, priceId) => {
    setError("");
    const isFramed = window.self !== window.top;
    const checkoutTab = isFramed ? window.open("", "_blank") : null;

    if (isFramed && !checkoutTab) {
      setError("Allow popups to continue to checkout.");
      return;
    }

    if (checkoutTab) {
      checkoutTab.opener = null;
    }

    const loadingKey = `${planId}:${billingCycle}`;
    setCheckoutLoading(loadingKey);

    try {
      const baseUrl = window.location.origin;
      const response = await apiClient.billing.createCheckoutSession({
        plan: planId,
        billingCycle,
        priceId,
        successUrl: `${baseUrl}/dashboard?subscription=success`,
        cancelUrl: `${baseUrl}/dashboard?subscription=cancelled`,
      });

      if (!response?.url) {
        throw new Error("No checkout URL returned.");
      }

      if (checkoutTab) {
        checkoutTab.location.replace(response.url);
      } else {
        window.location.assign(response.url);
      }
    } catch (checkoutError) {
      checkoutTab?.close();
      setError(checkoutError?.data?.message || checkoutError.message || "Checkout failed.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setError("");
    setPortalLoading(true);

    try {
      const response = await apiClient.billing.createPortalSession({
        returnUrl: `${window.location.origin}/dashboard`,
      });

      if (!response?.url) {
        throw new Error("No billing portal URL returned.");
      }

      window.location.assign(response.url);
    } catch (portalError) {
      setError(portalError?.data?.message || portalError.message || "Could not open the Stripe billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          Subscribe to unlock premium creator tools with the server-backed Stripe catalog.
        </p>
        {activeSubscription?.hasActiveSubscription && (
          <Button
            type="button"
            variant="outline"
            disabled={portalLoading}
            onClick={handleManageSubscription}
          >
            {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Manage subscription
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plansWithIcons.map((plan) => {
          const Icon = plan.Icon;
          const isActivePlan = activePlanKey === plan.planId;

          return (
            <div
              key={plan.planId}
              className="rounded-2xl border border-border bg-card/50 p-6 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-lg text-foreground">{plan.name}</h3>
                    {plan.badge && (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                </div>
              </div>

              {isActivePlan && (
                <div className="flex items-center gap-2 text-xs text-green-500 bg-green-500/10 rounded-lg px-3 py-2">
                  <CheckCircle className="w-4 h-4" />
                  Active: {activeSubscription.status}
                </div>
              )}

              <div className="space-y-2">
                {["monthly", "annual"].map((billingCycle) => {
                  const option = plan[billingCycle];
                  const loadingKey = `${plan.planId}:${billingCycle}`;
                  const configured = Boolean(option?.configured && option?.priceId);

                  return (
                    <Button
                      key={billingCycle}
                      type="button"
                      variant={isActivePlan ? "outline" : "default"}
                      disabled={!configured || checkoutLoading !== null || portalLoading}
                      onClick={() => handleCheckout(plan.planId, billingCycle, option.priceId)}
                      className="w-full flex items-center justify-between h-auto py-3"
                    >
                      {checkoutLoading === loadingKey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isActivePlan ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                      <span className="font-semibold capitalize">{billingCycle}</span>
                      <span>
                        {configured ? formatAmount(option.amountUsd, billingCycle) : "Not configured"}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
