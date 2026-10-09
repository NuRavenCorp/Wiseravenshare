/**
 * Paywall bypass switch.
 *
 * While the site runs free, gated features are treated as available to every
 * signed-in user, as if they held an active subscription. This is a switch, not
 * a removal: the plan cards, Stripe checkout, and 402 handling all stay in
 * place, and paid gating returns the moment this reports false.
 *
 * Server counterpart: AuthAccessPolicy.ArePaywallsBypassed
 * (config key `Features:Paywalls:Bypass`). The two are read independently, so
 * set BOTH to re-enable paid gating:
 *
 *   server:  Features__Paywalls__Bypass=false
 *   client:  VITE_PAYWALLS_BYPASS=false
 *
 * Default is bypassed (true) because the site is free until pricing is settled.
 */

const readBypassFlag = () => {
    const configured = String(import.meta.env.VITE_PAYWALLS_BYPASS ?? '').trim();
    if (!configured) {
        return true; // free by default
    }
    return configured.toLowerCase() !== 'false';
};

export const PAYWALLS_BYPASSED = readBypassFlag();

/**
 * Treat the supplied subscription status as active while paywalls are bypassed.
 * Preserves the original object so callers can still read real fields (planKey,
 * priceId, currentPeriodEnd) for display without unlocking anything further.
 */
export const withPaywallBypass = (subscriptionStatus) => {
    if (!PAYWALLS_BYPASSED) {
        return subscriptionStatus;
    }

    return {
        ...(subscriptionStatus || {}),
        hasActiveSubscription: true,
        paywallsBypassed: true,
    };
};

/**
 * True when the user should be allowed past a subscription gate — either they
 * genuinely hold a plan, or paywalls are suspended.
 */
export const hasGatedAccess = (subscriptionStatus, isAdmin = false) =>
    Boolean(isAdmin || PAYWALLS_BYPASSED || subscriptionStatus?.hasActiveSubscription);
