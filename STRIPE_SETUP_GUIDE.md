# Stripe Integration Setup Guide

## Overview
Music Rights Studio pricing plans are now integrated with Stripe for recurring subscription billing. Users can enroll in one of three tiers:
- **Basic**: $4.99/mo ($49.99/yr) — Timestamped proof of creation + fingerprinting
- **Standard**: $14.99/mo ($149.99/yr) — Cross-platform monitoring + automated takedowns
- **Pro**: $29.99/mo ($299.99/mo) — IP advisor + licensing templates + PRO registration

## Frontend Setup (✅ Complete)

### 1. Environment Variables
Add to `.env.example` and DO dashboard:
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...  # or pk_live_...
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_PROD_ID=prod_...
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_PROD_ID=prod_...
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_PROD_ID=prod_...
```

### 1b. Stripe CLI Price Creation
Use the Stripe CLI to create the products and recurring prices, then copy the returned `price_...` IDs into the env vars above:
```bash
stripe login

stripe products create --name="Music Rights Studio - Basic Protection"
stripe prices create --product=prod_basic --currency=usd --unit-amount=499 --recurring[interval]=month
stripe prices create --product=prod_basic --currency=usd --unit-amount=4999 --recurring[interval]=year

stripe products create --name="Music Rights Studio - Standard Protection"
stripe prices create --product=prod_standard --currency=usd --unit-amount=1499 --recurring[interval]=month
stripe prices create --product=prod_standard --currency=usd --unit-amount=14999 --recurring[interval]=year

stripe products create --name="Music Rights Studio - Pro Protection"
stripe prices create --product=prod_pro --currency=usd --unit-amount=2999 --recurring[interval]=month
stripe prices create --product=prod_pro --currency=usd --unit-amount=29999 --recurring[interval]=year
```
Replace `prod_basic`, `prod_standard`, and `prod_pro` with the product IDs returned by the CLI.

### 2. Frontend Flow (Ready)
1. User clicks "Start [Plan]" on MusicRightsStudioPage
2. `handleStripeCheckout(plan)` is triggered
3. Frontend calls `/api/billing/checkout-session` (backend endpoint)
4. Backend returns `sessionId`
5. Frontend redirects to Stripe Checkout via `stripe.redirectToCheckout()`
6. User completes payment and is redirected to success URL

### 3. Stripe.js Integration
- `Stripe.js v3` loaded in `public/Index.html`
- `window.Stripe` available globally

## Backend Setup (⏳ In Progress)

### 1. Create Stripe Products
Go to [Stripe Dashboard](https://dashboard.stripe.com/products):
1. Create product "Music Rights Studio — Basic Protection"
   - Description: Timestamp, fingerprinting, proof-of-creation certificate...
   - Create price: $4.99/mo recurring (monthly)
   - Create price: $49.99/yr recurring (annual) — copy Price ID
   - **Copy the product ID to env var: `STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_PROD_ID`**

2. Repeat for Standard ($14.99/mo, $149.99/yr) and Pro ($29.99/mo, $299.99/mo)

### 2. Environment Variables (Backend)
Add to DO dashboard:
```
STRIPE_PRICE_IP_BASIC_MONTHLY_ID=price_...
STRIPE_PRICE_IP_BASIC_ANNUAL_ID=price_...
STRIPE_PRICE_IP_STANDARD_MONTHLY_ID=price_...
STRIPE_PRICE_IP_STANDARD_ANNUAL_ID=price_...
STRIPE_PRICE_IP_PRO_MONTHLY_ID=price_...
STRIPE_PRICE_IP_PRO_ANNUAL_ID=price_...
Stripe_WiseravenShare_MusicStudioRights_BasicProdId=prod_...
Stripe_WiseravenShare_MusicStudioRights_StandardProdId=prod_...
Stripe_WiseravenShare_MusicStudioRights_ProProdId=prod_...
STRIPE_SECRET_KEY=sk_test_... (already configured)
STRIPE_WEBHOOK_SECRET=whsec_... (already configured)
STRIPE_PUBLISHABLE_API=pk_test_... (DO alias)
STRIPE_RESTRICTED_API=rk_test_... (optional DO alias)
STRIPE_SECRET_API=sk_test_... (DO alias)
```

### 3. Stripe CLI Checkout Usage
If you want the backend catalog/checkout endpoint to use the IP Protection plans directly, call `/api/payments/checkout-session` with these plan IDs:
- `ip_basic`
- `ip_standard`
- `ip_pro`

The backend now resolves each plan to the Stripe price IDs above and exposes them in `/api/payments/catalog` and `/api/payments/health`.

### 4. Implement Backend Endpoint ⏳

Create `POST /api/payments/checkout-session`:
```csharp
[HttpPost("checkout-session")]
[Authorize]
public async Task<IActionResult> CreateCheckoutSession([FromBody] CheckoutSessionRequest request)
{
    // Get authenticated user
    var userId = User.GetUserId();
    var user = await _userRepository.GetByIdAsync(userId);
    
    // Create Stripe Checkout Session
    var options = new SessionCreateOptions
    {
        PaymentMethodTypes = new List<string> { "card" },
        LineItems = new List<SessionLineItemOptions>
        {
            new SessionLineItemOptions
            {
                Price = request.PriceId,  // e.g., "price_1234..." (monthly price ID)
                Quantity = 1,
            }
        },
        Mode = "subscription",
        SuccessUrl = "https://wiseravenshare.com/music-rights-studio?session_id={CHECKOUT_SESSION_ID}",
        CancelUrl = "https://wiseravenshare.com/music-rights-studio?cancelled=true",
        CustomerEmail = user.Email,
    };
    
    var service = new SessionService();
    var session = await service.CreateAsync(options);
    
    return Ok(new { sessionId = session.Id });
}

public class CheckoutSessionRequest
{
    public string PlanId { get; set; }
    public string PriceId { get; set; }
    public string ProductId { get; set; }
    public string UserEmail { get; set; }
    public string UserName { get; set; }
}
```

### 4. Webhook Listener ⏳

Create webhook endpoint to handle:
- `checkout.session.completed` — Grant subscription access
- `customer.subscription.updated` — Upgrade/downgrade tiers
- `customer.subscription.deleted` — Revoke access

```csharp
[HttpPost("webhook")]
[AllowAnonymous]
public async Task<IActionResult> HandleWebhook()
{
    var json = await new StreamReader(Request.Body).ReadToEndAsync();
    
    try
    {
        var stripeEvent = EventUtility.ParseEvent(json);
        
        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
                var session = stripeEvent.Data.Object as Session;
                // Grant subscription access to user
                await _subscriptionService.GrantAccessAsync(session.CustomerEmail, session.SubscriptionId);
                break;
                
            case "customer.subscription.updated":
                var subscription = stripeEvent.Data.Object as Subscription;
                // Update user's subscription tier
                await _subscriptionService.UpdateTierAsync(subscription.CustomerId, subscription.Items[0].Price.Id);
                break;
                
            case "customer.subscription.deleted":
                var cancelledSub = stripeEvent.Data.Object as Subscription;
                // Revoke access
                await _subscriptionService.RevokeAccessAsync(cancelledSub.CustomerId);
                break;
        }
        
        return Ok();
    }
    catch (StripeException ex)
    {
        return BadRequest(ex.Message);
    }
}
```

## Database Schema

Add to User entity:
```csharp
public string? StripeCustomerId { get; set; }
public string? StripeSubscriptionId { get; set; }
public string? SubscriptionTier { get; set; }  // "basic", "standard", "pro"
public DateTime? SubscriptionExpiresAt { get; set; }
```

## Testing Flow

### Local Dev
1. Set `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`
2. Set Stripe product IDs to valid test product IDs
3. Click "Start [Plan]" button
4. Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC

### Production (DO)
1. Set `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
2. Set Stripe product IDs to live product IDs
3. Enable webhook at `https://wiseravenshare.com/api/stripe/webhook`
4. Enable in Stripe dashboard: Events → Endpoints → Add endpoint

## Status Tracker

- [x] Frontend Stripe.js integration
- [x] MusicRightsStudioPage checkout handler
- [x] Environment variables wired (.do/app.yaml)
- [ ] Backend `/api/stripe/checkout-session` endpoint
- [ ] Backend webhook listener
- [ ] User subscription tier tracking (database)
- [ ] Feature gating based on subscription level
- [ ] Cancel subscription UI
- [ ] Billing portal integration

## References
- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe .NET SDK](https://github.com/stripe/stripe-dotnet)

---

**Last Updated:** 2026-09-03  
**Next Phase:** Backend endpoint implementation + webhook listener
