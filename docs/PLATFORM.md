# WiseRavenShare — Platform Documentation
**Services, Rules & Regulations, Feature List, and Site Map**
_Version: February 2026 · Prepared for QA testing_

---

## 1. What WiseRavenShare Is

WiseRavenShare is a creator-first social platform (codename **Ravensight**) where users post content,
cross-publish to major social networks, earn **WiseCoin (WSC)** — a work-hour-backed platform currency —
and collaborate in real time. It includes AI assistance, a truth/claims engine, news aggregation, and
badge-based reputation.

### Platform symbol notation
- **$** — money, good, valuable, or excellence. *"that idea is $"* = a valuable, excellent idea.
- **%** — part of, not complete, not the whole story. *"a %answer"* = a partial answer.

---

## 2. Major Services (what runs where)

| Service | What it does |
|---|---|
| **Auth / UserStore** | Registration, login (JWT), team invites, roles (Admin/Moderator), access policies |
| **PostService / SocialPlatformService** | Creating posts, media payloads, likes, bookmarks, feeds |
| **WiseCoinService** | WSC wallets, earn/spend/transfer, staking, work-hour valuation, fee burns |
| **LedgerHashService** | Tamper-evident hash chain over every WSC transaction |
| **LedgerAnchorBackgroundService** | Daily automatic integrity check + chain head anchoring |
| **BadgeService / EvolutionService** | Badge earning, milestone checks, badge evolution paths |
| **AiJobQueueService** | Background AI generation queue (captions, drafts) with prompt cache |
| **LocalChatService** | AI assistant chat via local llama.cpp nodes (round-robin + failover) |
| **CrossPlatformPublishService** | One-click publishing to Facebook, Instagram, YouTube, TikTok, X, LinkedIn |
| **ProjectService / Collaboration** | Real-time collaboration rooms (SignalR hubs), project content, file transfer |
| **TruthEngine / TruthClaimService** | Claim verification, consensus, knowledge base |
| **NewsAggregationService** | AI news + breaking news feeds, article handling |
| **VideoService / Ravensight media** | Video streaming, photo/music/video media libraries, retention cleanup |
| **GrowthService / PerformanceMetricsService** | Admin growth dashboards and metrics |
| **SubscriptionService / Billing / Payments** | Subscriptions, billing, payments |
| **EmailService / Notifications** | Email delivery, in-app notifications, reminders |
| **DigitalOceanSpacesBlobStorageService** | Media blob storage |
| **RavensightMediaRetentionCleanupService** | Automatic media retention enforcement |

---

## 3. WiseCoin (WSC) Rules & Regulations

### 3.1 Core economics
- WSC is a **closed, work-hour-backed platform currency** — not a tradable cryptocurrency.
- Valuation is anchored to a **minimum wage reference of $15.00/hour**, baseline issuance
  **10 WSC per work hour**, adjusted by a supply/demand rate formula.
- **Maximum inflation rate: 5%**; burn rate target ~1%; transaction fees are **0.5%** and are
  **burned** (deflationary).

### 3.2 Ledger integrity (tamper protection)
- Every transaction is stamped with a **SHA-256 hash** that includes the previous transaction's hash
  (a hash chain). Editing, deleting, or inserting rows breaks the chain — detectable, provable.
- A daily background job verifies the last 1,000 transactions and **anchors** the chain head.
- Users can check integrity: `GET /api/wisecoin/ledger/verify`.

### 3.3 Earning rules
- Earnings come from: content creation, verification work, staking rewards, tips, referrals,
  community bonuses, creativity work, governance participation.
- Earnings may be multiplied by **badge, skill, and reputation multipliers** (each adds up to 25%
  of a badge's value multiplier per badge category).
- **Fee burn**: every spend/transfer burns 0.5% of the amount.

### 3.4 Staking rules
- Staking durations: **7 to 365 days**.
- Types and multipliers: **Flexible ×1.0**, **Locked ×1.5** (early exit penalty: 30% of rewards),
  **Work-Backed ×2.0**.
- Base annual rate: **8%** × type multiplier + staking badge bonus.
- Rewards accrue pro-rata by day; unstaking pays amount + net reward (minus penalty) to balance.

### 3.5 Transfer rules
- Cannot transfer to yourself; amounts must be positive; insufficient balance is rejected.
- Recipient receives the net amount (after 0.5% fee); fee is burned.
- **Every transaction is chained into the tamper-evident ledger** — unauthorized seizure, micro
  theft, or retro-editing is detectable and reportable via `ledger/verify`.

### 3.6 Wallet structure
- `Balance` — spendable funds.
- `LockedBalance` — staked funds (counted at 50% for "effective balance" computations).
- `EscrowedBalance` — funds held for pending transactions.

### 3.7 AI job queue rules (AI features)
- AI generation (captions, hashtags, drafts) runs as **background jobs** — you poll for results,
  nothing is lost during traffic spikes.
- Max 4 concurrent generations; queue cap 500 (full queue returns "busy, retry" immediately).
- Identical prompts are served from a **prompt cache** instantly.
- Results are kept 30 minutes after completion.

### 3.8 AI Assistant rules
- The assistant helps with platform questions (posting, cross-posting, accounts, feed, troubleshooting).
- It answers honestly when it doesn't know something platform-specific and directs users to human support.
- Chat history is truncated to the last 12 messages / 4,000 characters per message.
- Replies are capped at 600 tokens; responses are hard-capped at 1 MB.

---

## 4. Platform Rules & Regulations (conduct)

1. **Accounts** — one account per person; you are responsible for activity under your credentials.
   Team invites grant access per the team owner's settings.
2. **Content** — you retain ownership of your content. By posting you grant WiseRavenShare the
   license needed to display it on-platform and to cross-publish to networks you explicitly choose.
3. **Cross-posting** — publishing to external platforms (Meta, YouTube, TikTok, X, LinkedIn) requires
   your explicit connected-account authorization; revoking access stops future publishes.
4. **Truth & verification** — claims submitted to the Truth Engine go through consensus verification.
   Synthetic engagement and moderation tooling is admin-only and audited.
5. **WiseCoin** — WSC has no cash-out guarantee unless explicitly offered; its value derives from
   work-hour valuation. Exploiting earn mechanics (automation, farming, multi-accounting) is prohibited
   and detectable via the ledger.
6. **Collaboration** — rooms are scoped to invited members; shared files follow the same content rules
   as posts. SignalR sessions are logged for moderation purposes.
7. **Admin access** — Growth, Revenue, and Team Access consoles are restricted to admin emails.
8. **Privacy & retention** — see the in-app Privacy Policy page (`/privacy`) and Terms (`/terms`);
   media is subject to automatic retention cleanup policies.
9. **Data protection (WSC ledger)** — financial transaction history is hash-chained; users are entitled
   to request verification of their transaction history integrity.

---

## 5. Complete Feature List

### Social & Content
- Social feed (multi-platform view) with likes, comments, bookmarks
- Cross-posting/publishing to Facebook, Instagram, YouTube, TikTok, Twitter/X, LinkedIn
- Per-platform feed views (facebook-feed, tiktok-feed, instagram-feed, youtube-feed, twitter-feed, linkedin-feed)
- Bookmarks page
- File uploads (images/video) to blob storage

### Ravensight Media Suite
- Ravensight video mode (dedicated tabbed experience)
- Video streaming with retention policies
- Photo media library, music media library, video media library
- Media preferences
- Script studio, podcast studio, newsroom recorder
- Automatic media retention cleanup

### News & Journalism
- AI News feed (aggregated articles)
- Breaking News feed
- Article viewer (internal + external URLs)
- Amateur Journalist tools
- Newsroom video recording

### Truth & Verification
- Truth Seeker experience
- Truth Engine (claims, consensus, knowledge base)
- Truth alerts in feed
- Admin moderation / synthetic engagement console

### WiseCoin Economy
- Wallet (balance, locked, escrowed), earn/spend/transfer
- Staking (Flexible / Locked / Work-Backed)
- Badge & milestone reward multipliers
- Work-hour valuation engine
- Tamper-evident hash-chained ledger + daily anchoring
- Currency agent
- Transaction history (paged)

### Badges & Reputation
- Badge earning, claiming (minting cost), soulbound badges
- Badge evolution paths
- Milestone auto-awards
- Skill / reputation / badge multipliers on earnings

### AI
- AI Assistant chat (streaming + non-streaming)
- Background AI generation jobs (captions, drafts, hashtags) with prompt cache
- Local llama.cpp model serving (round-robin pool, circuit breaker failover)

### Collaboration
- Real-time collaboration rooms (SignalR)
- Project management (projects, members, content)
- File transfer inside rooms
- Collaboration notifications

### Planning & Growth
- Content Planner
- Growth dashboard (admin)
- Revenue console (admin)
- Performance metrics
- Team access administration + invite accept flow

### Accounts & Platform
- Registration, login, JWT auth, profile editing
- Notifications page, reminders, email service
- Messages (direct messaging)
- Subscriptions, billing, payments
- Discover page
- Profile page
- Privacy Policy & Terms of Service pages

---

## 6. Full Site Map (client pages)

```
WiseRavenShare
│
├── Feed (default home) ............................ /feed
│   ├── Platform feeds: facebook / tiktok / instagram /
│   │   youtube / twitter / linkedin (same FeedPage, filtered)
│   └── Truth alerts
│
├── Discover ....................................... /discover
├── Bookmarks ...................................... /bookmarks
├── Messages ....................................... /messages
├── Notifications .................................. /notifications
├── Planner (content planning) ..................... /planner
├── Profile (edit & view) .......................... /profile
│
├── AI Assistant (chat + generation) ............... /ai-assistant
│
├── News
│   ├── AI News .................................... /ainews
│   ├── Breaking News .............................. /breakingnews
│   └── Article view (from either news page) ....... /article
│
├── Truth
│   └── Truth Seeker ............................... /truthseeker
│
├── Ravensight (media mode)
│   ├── Ravensight video hub ....................... /ravensight
│   ├── Newsroom recorder .......................... /newsroom-video
│   │   └── send-to → Podcast Control Room
│   ├── Podcast Studio ............................. (inside Ravensight tabs)
│   ├── Amateur Journalist ......................... /amateur-journalist
│   └── Canvas ..................................... /canvas
│
├── Collaboration (real-time rooms) ................ /collaboration
│
├── Admin (email-gated)
│   ├── Growth dashboard ........................... /growth
│   ├── Revenue console ............................ /revenue
│   └── Team access admin .......................... /team-access-admin
│       └── Invite accept page (invitees) .......... /accept-team-invite (route)
│
├── Auth
│   └── Login / Register ........................... /login
│
└── Legal
    ├── Privacy Policy ............................. /privacy
    └── Terms of Service ........................... /terms
```

*(The client uses page-state navigation, not URL routes — the paths above are conceptual anchors.
Direct URL support exists for `/privacy`.)*

---

## 7. API Map (server endpoints by area)

| Area | Base route | Auth | Highlights |
|---|---|---|---|
| Auth | `/api/auth` | mixed | register, login, team invite accept |
| Users | `/api/users` | ✔ | profiles, admin emails |
| Posts | `/api/post` | ✔ | create, feed, like, bookmark |
| Social | `/api/social` | ✔ | platform connections, dispatch |
| WiseCoin | `/api/wisecoin` | ✔ | balance, earn, spend, transfer, stake/unstake, badges, **ledger/verify, ledger/head, ledger/anchor** |
| Currency Agent | `/api/currency-agent` | ✔ | agent operations |
| AI Assistant | `/api/aiassistant` | ✔ | models, chat, chat/stream, **jobs (POST enqueue / GET poll)** |
| Projects | `/api/projects` | ✔ | collaboration projects, members, content |
| Ravensight videos | `/api/ravensight/videos` | ✔ | video hub |
| RS media (video/photo/music) | `/api/ravensight/media/...` | ✔ | media libraries + preferences |
| RS scripts | `/api/ravensight/scripts` | ✔ | script studio |
| Video | `/api/video` | ✔ | uploads, streaming |
| File upload | `/api/fileupload` | ✔ | media upload |
| News | `/api/news` | mixed | AI news, breaking news |
| Truth Engine | `/api/truthengine` | ✔ | claims, consensus |
| Truth (admin) | `/api/truth` | Admin/Mod | moderation |
| Synthetic engagement | `/api/admin/synthetic-engagement` | ✔ (admin) | moderation tooling |
| Evolution | `/api/evolution` | mixed | badge evolution |
| Growth | `/api/growth` | ✔ (admin) | growth metrics |
| Metrics | `/api/metrics` | ✔ | performance |
| Billing / Payments | `/api/billing`, `/api/payments` | ✔ | subscriptions |
| Notifications | `/api/notifications` | mixed | in-app alerts |
| Persistence | `/api/persistence` | ✔ | diagnostics |
| Market / MarketData | `/api/market`, `/api/marketdata` | ✔ | market features |

**SignalR Hubs:** Project Collaboration Hub, Cross-Platform Collaboration Hub.

---

## 8. QA Testing Checklist (suggested for this afternoon)

1. **Auth** — register → profile → logout → login. Team invite accept flow.
2. **Feed** — post creation (with/without media), like, bookmark, platform-filtered views.
3. **WiseCoin** — earn (post content) → balance updates → transfer to test account (verify 0.5% fee + burn) → stake 7 days Flexible → unstake. Check `GET /api/wisecoin/ledger/verify` returns `isValid: true`.
4. **Badges** — claim an available badge, confirm multipliers change on wallet.
5. **AI Assistant** — chat streams; `POST /api/aiassistant/jobs` enqueue → poll → result; repeat same prompt → instant cached result.
6. **Cross-posting** — connect a platform, publish a test post, confirm dispatch (or graceful error without credentials).
7. **Collaboration** — create project, second user joins, file transfer, notifications.
8. **News** — AI News and Breaking News load; article opens; back navigation returns to the right page.
9. **Ravensight** — video hub loads; newsroom recorder; podcast studio tab.
10. **Admin** — non-admin sees "Admin access required" on growth/revenue/team pages.
11. **Ledger tamper test (dev only)** — manually edit a transaction amount in DB → `ledger/verify` must report broken chain at that row → restore.
12. **Legal** — /privacy and /terms render.
