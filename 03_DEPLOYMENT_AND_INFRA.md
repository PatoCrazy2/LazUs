# Deployment & Infrastructure — Couple PWA

## 1. Deployment goal

Initial target:

> Deploy the application with **$0/month infrastructure cost** while usage remains inside the current free tiers.

The architecture should also have a straightforward upgrade path once usage grows.

The intended production platform is **Cloudflare**, not Vercel.

---

# 2. Why Cloudflare instead of Vercel for this project

The project can technically run on Vercel, but Cloudflare is the preferred target because the chosen backend architecture already depends on Cloudflare primitives:

```text
Workers
Hyperdrive
Durable Objects
R2
Images transformations
```

Deploying frontend + Hono API to the same Cloudflare environment gives one origin:

```text
https://app.example.com/
https://app.example.com/api/...
https://app.example.com/tap/...
```

This is particularly convenient for NFC deep links, cookies/sessions and avoiding unnecessary cross-origin boundaries.

Vercel Hobby should not be treated as the production free plan for a commercial SaaS; current Vercel documentation states the Hobby plan is intended for personal, non-commercial use.

---

# 3. Frontend/API deployment model

Use the Cloudflare Vite plugin to build/deploy the React/Vite client and Worker.

Conceptually:

```text
GitHub
  ↓
CI/deploy
  ↓
Cloudflare Vite build
  ├── React client assets
  └── Hono Worker
  ↓
Cloudflare Workers deployment
```

Cloudflare documents that a Worker and its static assets can be deployed as one integrated unit.

For an SPA, configure the static asset routing so non-asset application routes fall back to the SPA entry point as required.

API routes should be explicitly routed through the Worker.

---

# 4. Recommended repository shape

A single repository is preferred for the initial project.

Example:

```text
couple-pwa/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── routes/
│   ├── lib/
│   └── db/
│
├── server/
│   ├── routes/
│   ├── services/
│   ├── repositories/
│   ├── middleware/
│   ├── realtime/
│   ├── push/
│   ├── media/
│   └── index.ts
│
├── worker/
│   └── index.ts
│
├── public/
├── drizzle/
├── tests/
├── vite.config.ts
├── wrangler.jsonc
├── package.json
└── README.md
```

The exact structure can differ, but frontend, API/domain logic, database access and infrastructure bindings should remain reasonably separated.

---

# 5. Environment configuration

Use environment variables/secrets for all credentials and private configuration.

Conceptual variables/bindings:

```text
DATABASE / HYPERDRIVE binding
AUTH secrets
OAUTH client secrets
WEB_PUSH_VAPID_PRIVATE_KEY
WEB_PUSH_VAPID_PUBLIC_KEY
R2 bucket binding
Durable Object namespace binding
APP_BASE_URL
```

Never place:

- database credentials;
- private VAPID keys;
- OAuth client secrets;
- signing secrets

in client-side Vite environment variables.

Only explicitly public configuration may be exposed to the frontend.

---

# 6. Database deployment

Neon PostgreSQL is the authoritative production database.

Recommended environments:

```text
Neon
├── development
├── staging (optional)
└── production
```

Use migrations for schema changes.

Do not mutate production schema manually without a migration record.

The application should be able to recreate the database schema from version-controlled migrations.

---

# 7. Hyperdrive configuration

Use Hyperdrive as the Worker → PostgreSQL connection/acceleration layer.

Architecture:

```text
Worker
  ↓
Hyperdrive
  ↓
Neon
```

For data that must be fresh immediately after a write (authentication, authorization, reveal eligibility, etc.), use a cache-disabled/fresh database path if the implementation exposes multiple Hyperdrive bindings/configurations.

Do not use cached reads for security-critical reveal decisions.

---

# 8. Durable Objects deployment

Create a Durable Object class for the realtime couple-room concept.

Conceptual mapping:

```text
coupleId
  ↓
Durable Object ID
```

A couple room can maintain the active WebSocket connections for the two partners.

Use the SQLite-backed Durable Object storage model if any local object state is required, because the Workers Free plan currently supports SQLite-backed Durable Objects.

Do not store the complete permanent application data model in Durable Objects; Neon remains authoritative.

WebSocket traffic should be limited to safe realtime signals.

Example event vocabulary:

```text
partner_online
partner_offline
submission_status_changed
activity_ready_to_reveal
affection_received
```

Do not broadcast secret response content until the server has established the reveal condition.

---

# 9. R2 media deployment

Create a private R2 bucket for user media.

Do not make the entire bucket public.

Recommended object-key pattern:

```text
couples/<couple-id>/activities/<activity-id>/<submission-id>/<uuid>.<ext>
```

This is an example; exact keys may change.

The key must not be treated as an authorization mechanism.

Every protected read still needs application-level authorization or an appropriately scoped signed/temporary URL.

---

# 10. Images transformation strategy

Use R2 as original/private storage.

Use Cloudflare Images Free transformations for optimized variants.

Example conceptual transformations:

```text
original → width 1600 → quality 85 → auto format
original → width 800  → quality 85 → auto format
original → width 400  → quality 80 → auto format
```

Keep the number of unique transformation variants controlled so the initial 5,000 transformation/month free allowance is not wasted by uncontrolled dynamic parameters.

Do not generate an unbounded combination of:

```text
width × quality × crop × format × arbitrary query parameters
```

unless that variability is actually necessary.

---

# 11. Web Push deployment

Generate a VAPID key pair for the production application.

Store:

```text
VAPID_PRIVATE_KEY
```

only on the backend.

The browser receives:

```text
VAPID public key
```

and creates a PushSubscription.

Persist the subscription in Neon tied to:

```text
user
+ device/browser context
```

When a user logs out or a subscription expires/changes, the backend should clean up stale subscriptions.

Push delivery is independent of realtime WebSockets.

---

# 12. NFC deployment considerations

The NFC tag should point to a stable public HTTPS URL:

```text
https://app.example.com/tap/<tag-id>
```

or:

```text
https://app.example.com/link/<tag-id>
```

The domain should remain stable once tags are printed/encoded.

Avoid hard-coding temporary deployment URLs into tags.

For development, use disposable/test tags or a configurable test domain.

---

# 13. Domain strategy

Development can use the default Cloudflare-provided deployment hostname.

Production should use a custom domain when available, for example:

```text
https://app.example.com
```

A custom domain is recommended because NFC tags are physical and long-lived.

The custom domain is the one that should be encoded into production tags.

---

# 14. Free-tier strategy — current snapshot

The following is a planning snapshot for **September 17, 2026**. Free-tier terms can change and should be rechecked before launch.

### Cloudflare Workers

Current documented Workers Free plan:

```text
100,000 Worker requests/day
10 ms CPU time/invocation
```

Static asset requests for Workers static assets are documented as free/unlimited.

### Hyperdrive

Current documented Free plan:

```text
100,000 database queries/day
```

Hyperdrive is available on Workers Free.

### Durable Objects

Current documented Workers Free plan:

```text
100,000 requests/day
13,000 GB-s/day
```

The Free plan supports SQLite-backed Durable Objects.

### R2

Current documented Free tier:

```text
10 GB-month Standard storage
1,000,000 Class A operations/month
10,000,000 Class B operations/month
egress: free
```

### Cloudflare Images Free

Current documented Images Free plan:

```text
5,000 unique transformations/month
```

This free transformation tier can optimize images stored outside Images, such as R2. Images Storage itself is paid.

### Neon

Neon has a Free plan. Exact included compute/storage/resource quotas change over time; check Neon pricing before launch and keep monitoring usage.

### Important billing principle

The application should be designed to stay efficient even if free-tier limits disappear.

Free tier is a budget constraint, not an excuse to create inefficient traffic.

---

# 15. How to stay inside the free tier

Prefer:

```text
local reads
↓
silent synchronization
↓
coalesced mutations
↓
realtime events
```

Avoid:

```text
poll every 5 seconds
poll every screen
refetch identical data repeatedly
upload image through Worker
```

Examples:

Bad:

```text
GET /api/couple every 5 seconds
```

Better:

```text
Dexie cache
   ↓
Realtime event when partner changes something
   ↓
Targeted refetch when necessary
```

---

# 16. CI/CD recommendation

Use GitHub as the source repository.

Deployment should be automated from the main production branch.

Recommended flow:

```text
Pull Request
  ↓
Typecheck
  ↓
Lint
  ↓
Unit tests
  ↓
Build
  ↓
Preview deployment (when supported)

Merge to production branch
  ↓
Production build
  ↓
Database migration (controlled)
  ↓
Cloudflare deployment
```

Do not silently run destructive database operations during every deployment.

---

# 17. Observability

Even on a free-first project, log enough information to diagnose:

- sync failures;
- duplicate mutation attempts;
- authentication failures;
- media upload failures;
- push delivery failures;
- realtime connection failures;
- reveal authorization failures.

Never log secret answer content, private media URLs, authentication tokens or private OAuth data.

Use stable IDs and event names rather than logging private payloads.

---

# 18. Scaling path

Initial:

```text
Cloudflare Workers Free
+ Neon Free
+ R2 Free
+ Images Free
+ Durable Objects Free
```

Growth:

```text
Cloudflare Workers Paid
+ larger Hyperdrive usage
+ paid Durable Objects usage as required
+ larger R2 usage
+ paid Images if Images Storage becomes valuable
+ upgraded Neon plan as DB workload grows
```

The goal is to scale the same architecture rather than migrate away from it.

---

# 19. Official references

These are the primary vendor references that should be consulted before making infrastructure/billing decisions:

- Cloudflare Workers static assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Workers/Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Hyperdrive overview: https://developers.cloudflare.com/hyperdrive/
- Hyperdrive pricing: https://developers.cloudflare.com/hyperdrive/platform/pricing/
- Neon integration: https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Images pricing: https://developers.cloudflare.com/images/pricing/
- Apple Web Push: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Web NFC browser support: https://caniuse.com/webnfc
