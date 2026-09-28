# WRS Stripe Products — Environment Variables

## Backend Configuration (.env or DigitalOcean Dashboard)

Add these environment variables for the three Podcast Studio tiers:

### WRS Growth Suite ($49/month, $490/year)
```env
STRIPE_PRICE_GROWTH_SUITE_MONTHLY_ID=price_1XXXXXXXXXXXXXXXX
STRIPE_PRICE_GROWTH_SUITE_ANNUAL_ID=price_1XXXXXXXXXXXXXXXX
STRIPE_WRS_GROWTH_SUITE_PROD_ID=prod_XXXXXXXXX
```

**Features auto-released:**
- Growth analytics & trending content dashboard
- Audience sentiment tracking across platforms
- 30-day performance history
- Topic recommendations based on trends
- Monthly download reports
- Podcast analytics

---

### WRS Studio Plus ($99/month, $990/year)
```env
STRIPE_PRICE_STUDIO_PLUS_MONTHLY_ID=price_1XXXXXXXXXXXXXXXX
STRIPE_PRICE_STUDIO_PLUS_ANNUAL_ID=price_1XXXXXXXXXXXXXXXX
STRIPE_WRS_STUDIO_PLUS_PROD_ID=prod_XXXXXXXXX
```

**Features auto-released (includes all Growth Suite + these):**
- Team review workflows (unlimited reviewers)
- Assignment & approval chains
- Permission-based editing roles
- Team member analytics & activity logs
- Multi-role simultaneous editing
- Team workspace with shared assets
- Persistent workspace pages

---

### WRS Podcast Pro Bundle ($149/month, $1,490/year)
```env
STRIPE_PRICE_PODCAST_PRO_MONTHLY_ID=price_1XXXXXXXXXXXXXXXX
STRIPE_PRICE_PODCAST_PRO_ANNUAL_ID=price_1XXXXXXXXXXXXXXXX
STRIPE_WRS_PODCAST_PRO_PROD_ID=prod_XXXXXXXXX
```

**Features auto-released (includes all Growth Suite + all Studio Plus + these):**
- Guided studio flow
- Podcast Pro Bundle (full access marker)
- 24/7 priority email support
- Monthly strategy calls with our team
- Custom episode templates
- Advanced analytics export

---

## Stripe API Keys (Required)

These must already be configured in DigitalOcean:

```env
STRIPE_SECRET_KEY=sk_test_XXXXXXXXXX  (or sk_live_... for production)
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXX
STRIPE_PUBLISHABLE_KEY=pk_test_XXXXXXXXXX  (or pk_live_... for production)
```

---

## Setup Instructions

1. **Create products in Stripe Dashboard:**
   - Go to https://dashboard.stripe.com/products
   - Create "WRS Growth Suite" with monthly + annual prices
   - Create "WRS Studio Plus" with monthly + annual prices
   - Create "WRS Podcast Pro Bundle" with monthly + annual prices

2. **Copy Price IDs from Stripe:**
   - For each product, copy the monthly price ID (starts with `price_`)
   - For each product, copy the annual price ID (starts with `price_`)

3. **Add to DigitalOcean:**
   - Go to https://cloud.digitalocean.com/apps/[APP_ID]/settings/envs
   - Add each `STRIPE_PRICE_*_ID` and `STRIPE_WRS_*_PROD_ID` as SECRET
   - Deploy the app

4. **Verify Configuration:**
   - Navigate to: `GET /api/payments/health`
   - Should show all three plan prices as configured (no warnings)

---

## Trial Configuration

Default trial periods per tier (set in `SubscriptionService.ResolveTrialDays`):
- Growth Suite: 14 days free
- Studio Plus: 7 days free
- Podcast Pro Bundle: 30 days free

---

## Auto-Feature Release Workflow

When Stripe webhook fires `checkout.session.completed` or `customer.subscription.updated` with status = "active":

1. User subscription record is created/updated in database
2. Plan key is resolved from Stripe price ID
3. **Automatic feature unlock:** Based on plan, features are instantly released via `FeatureCompartmentService.ReleaseFeatureAsync()`
4. User can immediately access all tier features without delay

**No manual feature gating required.** Features are locked until Stripe payment succeeds.

---

**Last Updated:** 2026-09-28  
**Status:** Ready for Stripe product creation
