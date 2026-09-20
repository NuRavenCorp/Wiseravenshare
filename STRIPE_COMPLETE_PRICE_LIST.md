# WiseRavenShare — Complete Stripe Price List
**For wiring into Stripe Dashboard and `.env` / DigitalOcean App Spec**

Last updated: 2026-09-20 | Status: Ready to create in Stripe

---

## How to use this document

For every item below:
1. **Create a Product** in the [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. **Add a Price** for each billing interval (monthly + annual)
3. **Copy the `price_` ID** into the environment variable shown
4. Add the env var to DigitalOcean `.do/app.yaml` (both backend and frontend where noted)

Enable **Stripe Customer Portal** so subscribers can manage/cancel their own plans.  
Set up a **Webhook** endpoint at `https://wise-ravens.com/api/billing/webhook` for events:
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

---

## A — Core Platform Subscriptions

These gate **platform features** (Podcast Studio flow, analytics, team workflows).

| # | Product Name | Monthly | Annual | Monthly Env Var | Annual Env Var |
|---|---|---|---|---|---|
| A1 | **Creator Pro** | $19.00 / mo | $190.00 / yr | `STRIPE_PRICE_CREATOR_PRO_MONTHLY_ID` | `STRIPE_PRICE_CREATOR_PRO_ANNUAL_ID` |
| A2 | **Growth Suite** | $49.00 / mo | $490.00 / yr | `STRIPE_PRICE_GROWTH_SUITE_MONTHLY_ID` | `STRIPE_PRICE_GROWTH_SUITE_ANNUAL_ID` |
| A3 | **Studio Plus** | $99.00 / mo | $990.00 / yr | `STRIPE_PRICE_STUDIO_PLUS_MONTHLY_ID` | `STRIPE_PRICE_STUDIO_PLUS_ANNUAL_ID` |
| A4 | **Podcast Pro Bundle** | $149.00 / mo | $1,490.00 / yr | `STRIPE_PRICE_PODCAST_PRO_MONTHLY_ID` | `STRIPE_PRICE_PODCAST_PRO_ANNUAL_ID` |

### A — Feature access per tier
| Feature | Creator Pro | Growth Suite | Studio Plus | Podcast Pro |
|---|---|---|---|---|
| Media library | ✅ | ✅ | ✅ | ✅ |
| Revenue console | ✅ | ✅ | ✅ | ✅ |
| Podcast analytics | — | ✅ | ✅ | ✅ |
| Growth analytics | — | ✅ | ✅ | ✅ |
| Team workflows | — | — | ✅ | ✅ |
| Guided Studio Flow | — | — | — | ✅ |
| Podcast Pro Bundle | — | — | — | ✅ |

### A — DigitalOcean `.do/app.yaml` snippet (backend + frontend)
```yaml
# Backend (ASP.NET)
- key: STRIPE_PRICE_CREATOR_PRO_MONTHLY_ID
  value: price_XXXX   # replace with Stripe price_ ID
  type: SECRET
- key: STRIPE_PRICE_CREATOR_PRO_ANNUAL_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_GROWTH_SUITE_MONTHLY_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_GROWTH_SUITE_ANNUAL_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_STUDIO_PLUS_MONTHLY_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_STUDIO_PLUS_ANNUAL_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_PODCAST_PRO_MONTHLY_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_PODCAST_PRO_ANNUAL_ID
  value: price_XXXX
  type: SECRET
```

---

## B — Copywriting Add-ons

These gate **copywriting and AI script generation** features.

| # | Product Name | Monthly | Annual | Monthly Env Var | Annual Env Var |
|---|---|---|---|---|---|
| B1 | **Copy Standard** | $9.00 / mo | $90.00 / yr | `STRIPE_PRICE_COPY_STANDARD_MONTHLY_ID` | `STRIPE_PRICE_COPY_STANDARD_ANNUAL_ID` |
| B2 | **Copy Pro** | $29.00 / mo | $290.00 / yr | `STRIPE_PRICE_COPY_PRO_MONTHLY_ID` | `STRIPE_PRICE_COPY_PRO_ANNUAL_ID` |

### B — Feature access per tier
| Feature | Copy Standard | Copy Pro |
|---|---|---|
| Script Pipeline (4-segment) | ✅ | ✅ |
| AI Copywriting assistant | — | ✅ |
| Custom episode templates | — | ✅ |

### B — DigitalOcean `.do/app.yaml` snippet
```yaml
- key: STRIPE_PRICE_COPY_STANDARD_MONTHLY_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_COPY_STANDARD_ANNUAL_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_COPY_PRO_MONTHLY_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_COPY_PRO_ANNUAL_ID
  value: price_XXXX
  type: SECRET
```

---

## C — Music Rights IP Protection

These gate **IP registration and protection** features in Music Rights Studio.  
**Existing Stripe products** (already created — see `STRIPE_PRODUCT_IDS.md`):

| # | Product Name | Monthly | Annual | Product ID | Monthly Env Var | Annual Env Var |
|---|---|---|---|---|---|---|
| C1 | **IP Basic Protection** | $4.99 / mo | $49.99 / yr | `prod_VC3xoP4UjLvOF2` | `VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_MONTHLY_PRICE_ID` | `VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_ANNUAL_PRICE_ID` |
| C2 | **IP Standard Protection** | $14.99 / mo | $149.99 / yr | `prod_VC3yeDSQcWcgqG` | `VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_MONTHLY_PRICE_ID` | `VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_ANNUAL_PRICE_ID` |
| C3 | **IP Pro Protection** | $29.99 / mo | $299.99 / yr | `prod_VC3zXy445DbV0w` | `VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_MONTHLY_PRICE_ID` | `VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_ANNUAL_PRICE_ID` |

### C — Feature access per tier
| Feature | Basic | Standard | Pro |
|---|---|---|---|
| Timestamped proof-of-creation | ✅ | ✅ | ✅ |
| SHA-256 fingerprint | ✅ | ✅ | ✅ |
| Ownership certificate (HTML/PDF) | ✅ | ✅ | ✅ |
| Register Original Track | ✅ | ✅ | ✅ |
| DMCA takedown template | ✅ | ✅ | ✅ |
| Cross-platform infringement monitoring | — | ✅ | ✅ |
| Automated takedown filing support | — | ✅ | ✅ |
| Licensing agreement templates | — | ✅ | ✅ |
| PRO registration guidance (ASCAP/BMI/SESAC) | — | — | ✅ |
| Master + publishing rights documentation | — | — | ✅ |
| Priority DMCA legal escalation | — | — | ✅ |
| Licensing deal tracking dashboard | — | — | ✅ |

### C — DigitalOcean `.do/app.yaml` snippet (price_ IDs for billing controller)
```yaml
# Backend
- key: STRIPE_PRICE_IP_BASIC_MONTHLY_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_IP_BASIC_ANNUAL_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_IP_STANDARD_MONTHLY_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_IP_STANDARD_ANNUAL_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_IP_PRO_MONTHLY_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_IP_PRO_ANNUAL_ID
  value: price_XXXX
  type: SECRET
# Frontend (Vite)
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_MONTHLY_PRICE_ID
  value: price_XXXX
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_ANNUAL_PRICE_ID
  value: price_XXXX
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_MONTHLY_PRICE_ID
  value: price_XXXX
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_ANNUAL_PRICE_ID
  value: price_XXXX
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_MONTHLY_PRICE_ID
  value: price_XXXX
- key: VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_ANNUAL_PRICE_ID
  value: price_XXXX
```

---

## D — One-Time Purchases (Not yet in Stripe)

| # | Product Name | Price | Env Var | Notes |
|---|---|---|---|---|
| D1 | **Track Registration Certificate** | $4.99 one-time | `STRIPE_PRICE_TRACK_REGISTRATION_ID` | Single payment_intent, not subscription |
| D2 | **DMCA Takedown Filing** | $9.99 one-time | `STRIPE_PRICE_DMCA_FILING_ID` | Per takedown action |
| D3 | **Licensing Template Pack** | $19.99 one-time | `STRIPE_PRICE_LICENSE_PACK_ID` | Sync, master, performance templates |

### D — DigitalOcean snippet
```yaml
- key: STRIPE_PRICE_TRACK_REGISTRATION_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_DMCA_FILING_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_LICENSE_PACK_ID
  value: price_XXXX
  type: SECRET
```

## D — One-Time Purchases (Not yet in Stripe)

| # | Product Name | Price | Env Var | Notes |
|---|---|---|---|---|
| D1 | **Track Registration Certificate** | $4.99 one-time | `STRIPE_PRICE_TRACK_REGISTRATION_ID` | Single payment_intent, not subscription |
| D2 | **DMCA Takedown Filing** | $9.99 one-time | `STRIPE_PRICE_DMCA_FILING_ID` | Per takedown action |
| D3 | **Licensing Template Pack** | $19.99 one-time | `STRIPE_PRICE_LICENSE_PACK_ID` | Sync, master, performance templates |

### D — DigitalOcean snippet
```yaml
- key: STRIPE_PRICE_TRACK_REGISTRATION_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_DMCA_FILING_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_LICENSE_PACK_ID
  value: price_XXXX
  type: SECRET
```

---

## E — Copyright Office Registration Services

**Pass-through (0% markup) pricing for U.S. Copyright Office music forms.**  
**Wiseravenshare does NOT process registrations** — users register directly with copyright.gov.  
These are **informational products** that help users understand copyright registration costs.

| Form Code | Work Type | Price | Notes |
|---|---|---|---|
| **SR** | Sound Recording | $65.00 | Fixed audio recording, performer rights |
| **PA** | Musical/Dramatic Work | $65.00 | Song composition, melody, structure |
| **TX** | Literary Work | $65.00 | Lyrics, scripts, spoken word (standalone) |
| **SR + PA** | Combined Bundle | $130.00 | Sound recording + composition (most comprehensive) |

### E — How it works

1. **User visits CopyrightRegistrationPage** → Browse available forms, get recommendations based on work description
2. **User selects forms** → Calculate total cost (always equals Copyright Office fee, no markup)
3. **User reviews guidance** → View Copyright Office requirements, links to official resources
4. **User goes to copyright.gov** → Complete registration directly with U.S. Copyright Office
5. **Wiseravenshare provides links + educational content only**

### E — Environment variables (informational only)
```yaml
# These are NOT Stripe prices — just references
- key: VITE_COPYRIGHT_REGISTRATION_API_URL
  value: /api/copyright-registration
```

### E — Copyright Office contact info
- **Website:** https://www.copyright.gov/
- **Phone:** 1-202-707-3000
- **Registration portal:** https://www.copyright.gov/registration/
- **Forms:** https://www.copyright.gov/forms/
- **Current processing time:** 4-6 weeks
- **Filing fee** (2024): $65 per form (subject to change)

---

## F — Stripe Shared Infrastructure Keys

Required for all payment flows. Set in both backend and frontend services.

```yaml
# Backend — Stripe secret key, webhook signing secret
- key: Stripe__SecretKey
  value: sk_live_XXXX
  type: SECRET
- key: STRIPE_SECRET_API
  value: sk_live_XXXX      # fallback env key name also checked
  type: SECRET
- key: Stripe__WebhookSecret
  value: whsec_XXXX
  type: SECRET
- key: STRIPE_WEBHOOK_SECRET
  value: whsec_XXXX
  type: SECRET

# Frontend — Stripe publishable key
- key: VITE_STRIPE_PUBLISHABLE_KEY
  value: pk_live_XXXX
- key: Stripe__PublishableKey
  value: pk_live_XXXX
```

---

## F — Full `.env` Template (local dev)

```env
# ── Stripe core ──────────────────────────────────────────────────────────
STRIPE_SECRET_API=sk_test_XXXX
STRIPE_PUBLISHABLE_KEY=pk_test_XXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXX
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_XXXX

# ── A: Core Platform ─────────────────────────────────────────────────────
STRIPE_PRICE_CREATOR_PRO_MONTHLY_ID=price_XXXX
STRIPE_PRICE_CREATOR_PRO_ANNUAL_ID=price_XXXX
STRIPE_PRICE_GROWTH_SUITE_MONTHLY_ID=price_XXXX
STRIPE_PRICE_GROWTH_SUITE_ANNUAL_ID=price_XXXX
STRIPE_PRICE_STUDIO_PLUS_MONTHLY_ID=price_XXXX
STRIPE_PRICE_STUDIO_PLUS_ANNUAL_ID=price_XXXX
STRIPE_PRICE_PODCAST_PRO_MONTHLY_ID=price_XXXX
STRIPE_PRICE_PODCAST_PRO_ANNUAL_ID=price_XXXX

# ── B: Copywriting ───────────────────────────────────────────────────────
STRIPE_PRICE_COPY_STANDARD_MONTHLY_ID=price_XXXX
STRIPE_PRICE_COPY_STANDARD_ANNUAL_ID=price_XXXX
STRIPE_PRICE_COPY_PRO_MONTHLY_ID=price_XXXX
STRIPE_PRICE_COPY_PRO_ANNUAL_ID=price_XXXX

# ── C: IP Protection ─────────────────────────────────────────────────────
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_MONTHLY_PRICE_ID=price_XXXX
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_ANNUAL_PRICE_ID=price_XXXX
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_MONTHLY_PRICE_ID=price_XXXX
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_ANNUAL_PRICE_ID=price_XXXX
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_MONTHLY_PRICE_ID=price_XXXX
VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_ANNUAL_PRICE_ID=price_XXXX
STRIPE_PRICE_IP_BASIC_MONTHLY_ID=price_XXXX
STRIPE_PRICE_IP_BASIC_ANNUAL_ID=price_XXXX
STRIPE_PRICE_IP_STANDARD_MONTHLY_ID=price_XXXX
STRIPE_PRICE_IP_STANDARD_ANNUAL_ID=price_XXXX
STRIPE_PRICE_IP_PRO_MONTHLY_ID=price_XXXX
STRIPE_PRICE_IP_PRO_ANNUAL_ID=price_XXXX

# ── D: One-time ──────────────────────────────────────────────────────────
STRIPE_PRICE_TRACK_REGISTRATION_ID=price_XXXX
STRIPE_PRICE_DMCA_FILING_ID=price_XXXX
STRIPE_PRICE_LICENSE_PACK_ID=price_XXXX
```

---

## G — Revenue Summary (MRR potential at full saturation)

| Tier | Monthly | Annual |
|---|---|---|
| Creator Pro | $19 | $190 |
| Growth Suite | $49 | $490 |
| Studio Plus | $99 | $990 |
| Podcast Pro Bundle | $149 | $1,490 |
| Copy Standard | $9 | $90 |
| Copy Pro | $29 | $290 |
| IP Basic | $4.99 | $49.99 |
| IP Standard | $14.99 | $149.99 |
| IP Pro | $29.99 | $299.99 |
| **Total (all tiers, 1 user each)** | **$403.97** | **$4,039.97** |

> **Break-even estimate:** 3 Podcast Pro users covers basic hosting on DigitalOcean (~$50–$100/mo).  
> **100-user milestone:** 100 × Creator Pro = $1,900 MRR / $22,800 ARR.

---

## H — Stripe Products to Create (Quick checklist)

- [ ] A1 Creator Pro — monthly + annual prices
- [ ] A2 Growth Suite — monthly + annual prices
- [ ] A3 Studio Plus — monthly + annual prices
- [ ] A4 Podcast Pro Bundle — monthly + annual prices
- [ ] B1 Copy Standard — monthly + annual prices
- [ ] B2 Copy Pro — monthly + annual prices
- [ ] C1 IP Basic — monthly price *(product exists: `prod_VC3xoP4UjLvOF2`)* — add annual price
- [ ] C2 IP Standard — monthly price *(product exists: `prod_VC3yeDSQcWcgqG`)* — add annual price
- [ ] C3 IP Pro — monthly price *(product exists: `prod_VC3zXy445DbV0w`)* — add annual price
- [ ] D1 Track Registration Certificate — one-time price
- [ ] D2 DMCA Takedown Filing — one-time price
- [ ] D3 Licensing Template Pack — one-time price
- [ ] **E: Copyright Registration** — No Stripe products needed (informational only, pass-through to copyright.gov)
- [ ] Configure webhook endpoint
- [ ] Enable Customer Portal
- [ ] Paste all `price_` IDs into `.do/app.yaml` and local `.env`
