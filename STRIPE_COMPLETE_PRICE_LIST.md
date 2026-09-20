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

---

## E — Copyright Office Filing Service (New Revenue Model)

**Wiseravenshare is now a full Copyright Office filing service — we handle the complete registration process.**  
**Users pay Wiseravenshare 50% markup on Copyright Office fees. Wiseravenshare keeps the service revenue.**

### E.1 — Pricing Breakdown

| Form Code | Work Type | Copyright Office Fee | Wiseravenshare Service Fee (50%) | User Pays | Wiseravenshare Earns |
|---|---|---|---|---|---|
| **SR** | Sound Recording | $65.00 | $32.50 | **$97.50** | **$32.50** |
| **PA** | Musical Composition | $65.00 | $32.50 | **$97.50** | **$32.50** |
| **TX** | Lyrics/Script | $65.00 | $32.50 | **$97.50** | **$32.50** |
| **SR + PA** | Bundle (Recording + Composition) | $130.00 | $65.00 | **$195.00** | **$65.00** |

### E.2 — What Wiseravenshare Handles

1. **Form Guidance** — Recommend appropriate forms based on user work type
2. **File Uploads** — Audio, sheet music, text document storage
3. **Metadata Collection** — Work title, creator name, description, year of creation
4. **Payment Processing** — Stripe payment integration (50% markup)
5. **Copyright Office Submission** — Actual form filing (SR, PA, TX) to U.S. Copyright Office
6. **Status Tracking** — Monitor registration progress (4-6 weeks typical)
7. **Certificate Management** — Receive and deliver registration certificate to user
8. **Archive** — Keep copies of all filings and certificates

### E.3 — Filing Workflow

```
1. User creates filing (selects form type)
   ↓
2. User fills form metadata (title, creator, description)
   ↓
3. User uploads required files (audio/sheet music/text)
   ↓
4. Wiseravenshare validates filing is complete
   ↓
5. User initiates checkout (Stripe payment)
   ↓
6. Payment succeeds
   ↓
7. Wiseravenshare submits to Copyright Office
   ↓
8. Copyright Office processes (4-6 weeks)
   ↓
9. Wiseravenshare receives registration certificate
   ↓
10. User receives certificate via email + dashboard
```

### E.4 — Required Documents by Form

**Form SR (Sound Recording)**
- Audio file (MP3, WAV, FLAC, max 50MB)
- Work title
- Artist/creator name
- Year of creation
- Work description

**Form PA (Musical Composition)**
- Sheet music or lead sheet (PDF/image)
- MIDI file (optional, recommended)
- Lyric sheet (if applicable)
- Work title
- Composer name
- Year of creation
- Composition description

**Form TX (Lyrics/Script)**
- Text document (TXT, PDF, DOCX)
- Work title
- Author name
- Year of creation
- Work type (lyrics, script, poetry, etc.)
- Content description

**Combined Bundle (SR + PA)**
- All files for both SR and PA forms

### E.5 — Revenue Model

**Wiseravenshare Economics:**
- **User pays:** $97.50 per SR/PA/TX form, $195 for combined
- **Wiseravenshare passes to Copyright Office:** $65 per form, $130 for combined
- **Wiseravenshare keeps:** $32.50-$65 per filing
- **Margin:** 50% of user payment

**At scale:**
- 100 filings/month × $32.50 average = **$3,250/month revenue**
- 1000 filings/month × $32.50 average = **$32,500/month revenue**

### E.6 — Registration Lifecycle

| Status | Meaning | Timeline |
|--------|---------|----------|
| **Draft** | User building form, no payment | Flexible |
| **ReadyForPayment** | Form complete, validated, awaiting payment | Minutes |
| **SubmittedToOffice** | Payment received, Wiseravenshare submitted to Copyright Office | Hours |
| **Processing** | Copyright Office processing registration | 4-6 weeks typical |
| **Registered** | Certificate received from Copyright Office | Complete |
| **Failed** | Registration rejected by Copyright Office | Varies |
| **Cancelled** | User cancelled (refund processed) | Immediate |

### E.7 — API Endpoints

```
GET /api/copyright-filing/forms
  → Get available forms with pricing

POST /api/copyright-filing/create
  → Create new filing (Draft status)
  
PUT /api/copyright-filing/{filingId}/update
  → Update filing metadata

POST /api/copyright-filing/{filingId}/upload
  → Upload file (audio/sheet/text)

POST /api/copyright-filing/{filingId}/validate
  → Validate filing completeness

POST /api/copyright-filing/{filingId}/checkout
  → Initiate Stripe payment intent

POST /api/copyright-filing/{filingId}/confirm-payment
  → Confirm payment, submit to Copyright Office

GET /api/copyright-filing/{filingId}/status
  → Get filing status and registration number

GET /api/copyright-filing/user/filings
  → List all filings for authenticated user
```

### E.8 — Environment Variables

```yaml
# Stripe payment processing (add to section E: Stripe Shared Infrastructure Keys)
- key: STRIPE_PRICE_COPYRIGHT_FILING_SR_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_COPYRIGHT_FILING_PA_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_COPYRIGHT_FILING_TX_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_COPYRIGHT_FILING_COMBINED_ID
  value: price_XXXX
  type: SECRET
```

### E.9 — Stripe Setup

1. Create 4 Products in Stripe Dashboard:
   - "Copyright Filing - Sound Recording (SR)" → $97.50
   - "Copyright Filing - Composition (PA)" → $97.50
   - "Copyright Filing - Lyrics/Text (TX)" → $97.50
   - "Copyright Filing - Bundle (SR+PA)" → $195.00

2. Paste `price_XXXX` IDs into `.env` (section E.8 above)

3. Optional: Set up Stripe recurring billing if offering "annual filing credits"

### E.10 — Copyright Office Integration (TODO)

- [ ] Set up Copyright Office account for business filing
- [ ] Document Copyright Office submission process (forms, formats, deadlines)
- [ ] Build automated Copyright Office form generation (SR/PA/TX templates)
- [ ] Implement file conversion/validation (audio → WAV, music → PDF if needed)
- [ ] Set up email parsing to detect Copyright Office responses
- [ ] Build certificate OCR/extraction from email PDF attachments
- [ ] Implement background job for status polling + notifications

---

## F — Podcast Trademark Filing Service (50% Markup Model)

**Wiseravenshare is a full USPTO trademark filing service for podcast brands.**  
**Users pay Wiseravenshare 50% markup on USPTO fees. Wiseravenshare keeps the service revenue.**

### F.1 — Pricing Breakdown

| Form Code | Protection Type | USPTO Fee | Wiseravenshare Service Fee (50%) | User Pays | Wiseravenshare Earns |
|---|---|---|---|---|---|
| **TX** | Word/Text Mark (podcast name, tagline, catchphrase) | $250.00 | $125.00 | **$375.00** | **$125.00** |
| **VI** | Visual Mark (logo, artwork, visual branding) | $350.00 | $175.00 | **$525.00** | **$175.00** |
| **SR** | Sound Mark (theme song, intro jingle, audio) | $400.00 | $200.00 | **$600.00** | **$200.00** |
| **COMBINED** | Word + Visual Protection (TX + VI bundled) | $500.00 | $250.00 | **$750.00** | **$250.00** |

### F.2 — What Wiseravenshare Handles

1. **Form Guidance** — Recommend appropriate trademark form based on podcast branding
2. **File Uploads** — Logo images, audio samples, specimen screenshots
3. **Metadata Collection** — Exact trademark text, description, goods/services classification
4. **Payment Processing** — Stripe payment integration (50% markup)
5. **USPTO Submission** — Actual trademark application filing
6. **Status Tracking** — Monitor examination progress (typically 12-18 weeks)
7. **Office Action Response** — If examiner issues office action (refusal/requirement), handle response
8. **Certificate Management** — Receive and deliver registration certificate to user
9. **Archive** — Keep copies of all applications and registration certificates

### F.3 — Trademark Filing Workflow

```
1. User creates trademark filing (selects form type: TX, VI, SR, or COMBINED)
   ↓
2. User fills in trademark details (exact text, description, goods/services)
   ↓
3. User uploads documents (logo image for VI, audio sample for SR, or both)
   ↓
4. Wiseravenshare validates filing is complete
   ↓
5. User initiates checkout (Stripe payment)
   ↓
6. Payment succeeds
   ↓
7. Wiseravenshare submits application to USPTO
   ↓
8. USPTO examines application (typically 12-18 weeks)
   ↓
9. If approved → Wiseravenshare receives registration certificate → User notified
   ↓
10. If office action issued → Wiseravenshare notifies user → User responds
```

### F.4 — Required Documents by Form

**Form TX (Word/Text Mark) — Podcast Name/Tagline**
- Exact text to be protected (e.g., "The Daily Raven")
- Podcast name and description
- Goods/services description (e.g., "podcasting services, entertainment")
- Specimen of use (screenshot from podcast app, website, or social media showing the mark)
- Owner name, address, email

**Form VI (Visual Mark) — Logo/Artwork**
- High-quality logo image (JPG or PNG, color version)
- Description of colors (if color protection is important)
- Podcast name and description
- Goods/services description
- Specimen of use (screenshot showing logo on podcast platform, website, or social media)
- Owner name, address, email

**Form SR (Sound Mark) — Theme Song/Audio**
- Audio file (MP3 or WAV, max 5 minutes)
- Detailed description of the audio (e.g., "opening orchestral theme with distinctive rising horn melody")
- Waveform visual representation (provided by USPTO tools)
- Podcast name and description
- Goods/services description
- Evidence that listeners recognize the sound (examples from reviews, social media)
- Owner name, address, email

**Form COMBINED (TX + VI Bundle)**
- Exact text mark
- Logo image (high-quality)
- Color description (if applicable)
- Podcast name and description
- Two specimens (one showing text, one showing visual)
- Owner name, address, email

### F.5 — Revenue Model

**Wiseravenshare Economics:**
- **User pays:** $375 (TX), $525 (VI), $600 (SR), $750 (Combined)
- **Wiseravenshare passes to USPTO:** $250/$350/$400/$500
- **Wiseravenshare keeps:** $125-$250 per filing
- **Margin:** 50% of user payment

**At scale:**
- 100 filings/month × $175 average = **$17,500/month revenue**
- 500 filings/month × $175 average = **$87,500/month revenue**
- 1000 filings/month × $175 average = **$175,000/month revenue**

### F.6 — Application Lifecycle

| Status | Meaning | Timeline |
|--------|---------|----------|
| **Draft** | User building form, no payment | Flexible |
| **ReadyForPayment** | Form complete & validated, awaiting payment | Minutes |
| **SubmittedToUSPTO** | Payment received, Wiseravenshare submitted to USPTO | Hours |
| **PendingExamination** | USPTO examiner reviewing (typical: 12-18 weeks) | 12-18 weeks |
| **ExaminerResponseRequired** | Office action issued (refusal/requirement), user must respond | 6 months to respond |
| **RegistrationGranted** | Trademark registered, certificate issued | Complete |
| **Abandoned** | Application abandoned (didn't respond to office action) | Terminal |
| **Refused** | Application refused by USPTO | Terminal |

### F.7 — API Endpoints

```
GET /api/podcast-trademark/forms
  → Get available trademark forms with pricing

POST /api/podcast-trademark/create
  → Create new trademark filing (Draft status)
  
PUT /api/podcast-trademark/{filingId}/update
  → Update filing with trademark details

POST /api/podcast-trademark/{filingId}/upload?documentType=Logo
  → Upload file (logo image for VI, audio for SR, specimen screenshot)

POST /api/podcast-trademark/{filingId}/validate
  → Validate filing completeness before payment

POST /api/podcast-trademark/{filingId}/checkout
  → Initiate Stripe payment intent

POST /api/podcast-trademark/{filingId}/confirm-payment
  → Confirm payment, submit to USPTO

GET /api/podcast-trademark/{filingId}/status
  → Get filing status, office action notices, registration number

GET /api/podcast-trademark/user/filings?podcastId={podcastId}
  → List all trademark filings for podcast
```

### F.8 — Environment Variables

```yaml
# Stripe payment processing (add to Stripe Shared Infrastructure Keys section)
- key: STRIPE_PRICE_PODCAST_TRADEMARK_TX_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_PODCAST_TRADEMARK_VI_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_PODCAST_TRADEMARK_SR_ID
  value: price_XXXX
  type: SECRET
- key: STRIPE_PRICE_PODCAST_TRADEMARK_COMBINED_ID
  value: price_XXXX
  type: SECRET
```

### F.9 — Stripe Setup

1. Create 4 Products in Stripe Dashboard:
   - "Podcast Trademark - Word Mark (TX)" → $375.00
   - "Podcast Trademark - Visual Mark (VI)" → $525.00
   - "Podcast Trademark - Sound Mark (SR)" → $600.00
   - "Podcast Trademark - Combined (TX+VI)" → $750.00

2. Paste `price_XXXX` IDs into `.env` (section F.8 above)

3. Optional: Offer "annual trademark protection renewals" ($100/filing/year for renewal fees after 5-10 years)

### F.10 — USPTO Integration (TODO)

- [ ] Set up TEAS+ system account (Trademark Electronic Application System)
- [ ] Build automated form generation for TX, VI, SR applications
- [ ] Implement TEAS submission module (XML payload generation)
- [ ] Set up email parsing to detect USPTO office actions
- [ ] Build office action response handler
- [ ] Implement status polling via USPTO search API or email notifications
- [ ] Create certificate archival system (storage + retrieval)

### F.11 — Key Differences from Copyright Filing

| Aspect | Copyright (CO) | Trademark (USPTO) |
|--------|---|---|
| **Base Fee** | $65-$130 | $250-$400 |
| **User Price (50% markup)** | $97.50-$195 | $375-$600 |
| **Wiseravenshare Margin** | $32.50-$65 | $125-$200 |
| **Processing Time** | 4-6 weeks | 12-18 weeks |
| **Form Types** | SR, PA, TX, Combined | TX, VI, SR, Combined |
| **Protects** | Creative works (music, lyrics, audio) | Brand identifiers (names, logos, sounds) |
| **Duration** | Life + 70 years (automatic) | 10 years (renewable) |
| **Renewal Required** | No | Yes (every 10 years, ~$350/form) |
| **Likelihood of Refusal** | Low (~5%) | Medium (~30%) |

---

## G — Stripe Shared Infrastructure Keys

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

## G — Full `.env` Template (local dev)

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

## H — Revenue Summary (MRR potential at full saturation)

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

## I — Stripe Products to Create (Quick checklist)

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
- [ ] **F: Podcast Trademark Filing** — 4 products (TX, VI, SR, Combined)
- [ ] Configure webhook endpoint
- [ ] Enable Customer Portal
- [ ] Paste all `price_` IDs into `.do/app.yaml` and local `.env`
