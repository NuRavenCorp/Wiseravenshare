import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, RefreshCw } from "lucide-react";

export default function PaywallButtons({
  monthlyPrice,
  oneTimePrice,
  checkoutLoading,
  onCheckout,
  error,
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
        {monthlyPrice && (
          <Button
            onClick={() => onCheckout("subscription")}
            disabled={checkoutLoading !== null}
            className="flex flex-col items-center gap-1 h-auto py-3"
          >
            {checkoutLoading === "subscription" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5" />
            )}
            <span className="text-base font-semibold">
              ${monthlyPrice}/mo
            </span>
            <span className="text-xs opacity-80">Monthly Subscription</span>
          </Button>
        )}
        {oneTimePrice && (
          <Button
            onClick={() => onCheckout("one_time")}
            disabled={checkoutLoading !== null}
            variant="outline"
            className="flex flex-col items-center gap-1 h-auto py-3"
          >
            {checkoutLoading === "one_time" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CreditCard className="w-5 h-5" />
            )}
            <span className="text-base font-semibold">
              ${oneTimePrice}
            </span>
            <span className="text-xs opacity-80">One-Time Purchase</span>
          </Button>
        )}
      </div>

      {!monthlyPrice && !oneTimePrice && (
        <p className="text-sm text-muted-foreground text-center mt-4">
          Pricing not yet configured for this episode.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive mt-3 text-center">{error}</p>
      )}
    </>
  );
}