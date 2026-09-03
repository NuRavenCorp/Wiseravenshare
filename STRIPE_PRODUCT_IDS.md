# Stripe Product IDs Reference

## Active Stripe Products (Music Rights Studio)

### Production IDs
These are the active Stripe product IDs for Music Rights Studio plans:

| Plan | Product ID | Pricing | Status |
|------|-----------|---------|--------|
| **Basic Protection** | `prod_VC3xoP4UjLvOF2` | $4.99/mo, $49.99/yr | ✅ Active |
| **Standard Protection** | `prod_VC3yeDSQcWcgqG` | $14.99/mo, $149.99/yr | ✅ Active |
| **Pro Protection** | `prod_VC3zXy445DbV0w` | $29.99/mo, $299.99/mo | ✅ Active |

### Deployment Configuration

#### DigitalOcean `.do/app.yaml`
Backend service (ASP.NET):
```yaml
- key: Stripe_WiseravenShare_MusicStudioRights_BasicProdId
  value: prod_VC3xoP4UjLvOF2
  type: SECRET
- key: Stripe_WiseravenShare_MusicStudioRights_StandardProdId
  value: prod_VC3yeDSQcWcgqG
  type: SECRET
- key: Stripe_WiseravenShare_MusicStudioRights_ProProdId
  value: prod_VC3zXy445DbV0w
  type: SECRET
```

Static site (React Frontend):
```yaml
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_PROD_ID
  value: prod_VC3xoP4UjLvOF2
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_PROD_ID
  value: prod_VC3yeDSQcWcgqG
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_PROD_ID
  value: prod_VC3zXy445DbV0w
```

#### Local Development `.env`
```env
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_PROD_ID=prod_VC3xoP4UjLvOF2
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_PROD_ID=prod_VC3yeDSQcWcgqG
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_PROD_ID=prod_VC3zXy445DbV0w
```

### Component Implementation

**File:** `wiseravenshare.client/src/Pages/MusicRightsStudioPage.jsx`

```javascript
const STRIPE_PRODUCT_IDS = {
  basic: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_PROD_ID || 'prod_basic_fallback',
  standard: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_PROD_ID || 'prod_standard_fallback',
  pro: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_PROD_ID || 'prod_pro_fallback',
};
```

Each plan object includes:
```javascript
{
  id: 'basic',
  name: 'Basic Protection',
  stripeProductId: STRIPE_PRODUCT_IDS.basic,  // prod_VC3xoP4UjLvOF2
  price: '$4.99 / mo',
  annualPrice: '$49.99 / yr',
  // ... features
}
```

### User Flow

1. User visits Music Rights Studio page
2. Plans render with real Stripe product IDs loaded from env
3. User clicks "Start [Plan]" button
4. Frontend calls `/api/stripe/checkout-session` with `productId`
5. Backend creates Stripe CheckoutSession using product ID
6. Frontend redirects to Stripe Checkout
7. User completes payment
8. Stripe webhook notifies backend to grant access

### Testing Checklist

- [x] Product IDs created in Stripe Dashboard
- [x] Product IDs added to `.do/app.yaml` (both backend and frontend)
- [x] MusicRightsStudioPage component loads IDs from env
- [ ] Stripe publishable key configured in DO
- [ ] Backend `/api/stripe/checkout-session` endpoint created
- [ ] Local test: Verify IDs are loaded in browser console
  ```javascript
  // In browser console on Music Rights Studio page:
  console.log(import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_PROD_ID)
  // Should output: prod_VC3xoP4UjLvOF2
  ```
- [ ] Test checkout flow with Stripe test card: `4242 4242 4242 4242`

### Stripe Dashboard Links

- [All Products](https://dashboard.stripe.com/products)
- [Music Rights Studio - Basic](https://dashboard.stripe.com/products/prod_VC3xoP4UjLvOF2)
- [Music Rights Studio - Standard](https://dashboard.stripe.com/products/prod_VC3yeDSQcWcgqG)
- [Music Rights Studio - Pro](https://dashboard.stripe.com/products/prod_VC3zXy445DbV0w)

### Features Per Tier

#### Basic ($4.99/mo)
- Timestamped upload proof of creation
- SHA-256 cryptographic fingerprint stored per track
- WiseRavenShare rights registration record
- DMCA takedown request template & guidance
- Permanent proof-of-creation certificate (PDF)

#### Standard ($14.99/mo) 
- Everything in Basic
- Cross-platform infringement monitoring (FB, TikTok, YouTube, IG)
- Automated takedown filing support
- Sync & mechanical licensing agreement templates
- Revenue split tracking for collaborators
- Streaming royalty registration guidance

#### Pro ($29.99/mo)
- Everything in Standard
- PRO (ASCAP / BMI / SESAC) registration guidance
- Master + publishing rights documentation
- Priority DMCA legal escalation support
- Custom licensing deal templates (sync, master, performance)
- Dedicated IP advisor on-call
- Monetization & licensing deal tracking dashboard

---

**Last Updated:** 2026-09-03  
**Deployed:** `.do/app.yaml` commit `fe6a015`  
**Status:** Ready for backend `/api/stripe/checkout-session` implementation
