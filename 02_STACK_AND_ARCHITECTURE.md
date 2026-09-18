# Stack & Architecture — Couple PWA

## 1. Chosen stack

```text
Frontend
├── React + TypeScript
├── Vite
├── TanStack Router
├── TanStack Query
├── Dexie (IndexedDB)
└── Workbox / Service Worker

Backend
└── Hono

Cloud runtime
├── Cloudflare Workers
├── Hyperdrive
└── Durable Objects

Database
└── Neon PostgreSQL

Media
├── Cloudflare R2
└── Cloudflare Images Free transformations

Notifications
└── Web Push
```

The stack is intentionally optimized for this application, not selected merely because each technology is popular.

---

# 2. Architectural principle

The architecture separates four concerns:

```text
LOCAL EXPERIENCE
    ↓
Dexie + React + TanStack Query

SERVER AUTHORITY
    ↓
Hono + Neon PostgreSQL

REALTIME COORDINATION
    ↓
Durable Objects + WebSocket

EDGE / INFRASTRUCTURE
    ↓
Cloudflare Workers + Hyperdrive + R2
```

The user should feel that the application lives on their phone, while the server remains the authority that synchronizes and protects the relationship state.

---

# 3. React

## Role

React owns the UI and interaction layer.

## Responsibilities in this project

- daily activity screens;
- answer inputs;
- image selection/preview;
- waiting/reveal screens;
- couple onboarding;
- NFC interaction feedback;
- optimistic UI;
- animations and micro-interactions;
- responsive mobile UI.

React should not contain authoritative business rules. For example, React can decide to show a local transition, but it must not be considered the authority for whether a partner's secret answer can be fetched.

---

# 4. Vite

## Role

Vite is the frontend build and development tool.

## Why it fits

This is primarily a client application/PWA. The core post-login experience does not require SSR as a central architectural feature.

Vite gives a straightforward model:

```text
React source
  ↓
Vite build
  ↓
static client assets
  ↓
Cloudflare Workers static assets
```

Cloudflare currently supports deploying a React/Vite SPA together with a Worker in one deployment using the Cloudflare Vite plugin. Static assets are served through Cloudflare's edge network and static-asset requests are free/unlimited under the documented Workers static-assets billing model. See official references below.

---

# 5. TanStack Router

## Role

Client routing and navigation.

## Why it matters here

NFC tags open deep links such as:

```text
/tap/:tagId
/link/:tagId
```

The app also needs normal routes such as:

```text
/
/login
/onboarding
/today
/results/:activityId
/couple
/settings
```

TanStack Router provides typed routing and integrates naturally with modern data-fetching patterns.

Important rule: routes are UX/navigation mechanisms, not authorization boundaries. Backend authorization remains mandatory.

---

# 6. TanStack Query

## Role

Server-state management, cache and mutations.

## Why it matters here

The app has two competing needs:

```text
instant local UI
        +
server synchronization
```

TanStack Query is responsible for server-originated state and its lifecycle:

- fetching;
- caching;
- invalidation;
- mutation handling;
- retries;
- network state;
- synchronization with local persistence.

Use its offline/network capabilities rather than manually scattering fetch logic across components.

Do not use TanStack Query as the permanent database. Dexie is the persistent local store.

---

# 7. Dexie / IndexedDB

## Role

Persistent local application database.

## Data that may live locally

Example conceptual tables:

```text
couple
profile
activities
submissions
partner_status
media_metadata
push_subscription
outbox
sync_metadata
```

## Why it is crucial

NFC interactions and daily usage should not depend on an immediate HTTP round-trip.

Example:

```text
NFC tap
  ↓
Dexie lookup
  ↓
~local decision
  ↓
instant UX
```

Dexie is also where the durable outbox can live.

---

# 8. Outbox pattern

Use an explicit outbox for mutations that must survive intermittent connectivity.

Example:

```text
outbox
------------------------------------------------
id
client_mutation_id
mutation_type
payload
created_at
attempt_count
status
last_error
```

The client creates a stable mutation id before network delivery.

The backend uses that id for idempotency.

This protects against:

```text
submit
 → network times out
 → client retries
 → server sees duplicate mutation
```

The server should safely recognize it as the same mutation rather than creating duplicate submissions.

---

# 9. Workbox / Service Worker

## Role

PWA infrastructure:

- precaching/app shell;
- runtime caching where appropriate;
- offline behavior;
- background synchronization support;
- service-worker-controlled push notification handling.

Important distinction:

```text
Dexie
= business/local persistence

Workbox
= service-worker infrastructure
```

Do not use service-worker caching as a replacement for the application database.

---

# 10. Hono

## Role

HTTP API framework.

The backend can be written in TypeScript and expose endpoints such as:

```text
POST /api/auth/...
GET  /api/couple
POST /api/couple/link
GET  /api/activities/today
POST /api/activities/:id/submissions
GET  /api/activities/:id/results
POST /api/tap/:tagId
POST /api/affection
POST /api/media/upload-url
POST /api/push/subscribe
```

Hono should contain application/domain logic at the API boundary, while actual data access lives in service/repository modules.

Do not build a giant single Hono file.

Suggested backend separation:

```text
server/
├── routes/
├── middleware/
├── services/
├── repositories/
├── schemas/
├── auth/
├── realtime/
├── push/
├── media/
└── lib/
```

---

# 11. Cloudflare Workers

## Role

Production runtime for the Hono API and static client assets.

Cloudflare currently supports a React/Vite SPA + Worker architecture and the Vite plugin can build frontend assets for deployment to Workers.

The desired deployment model is:

```text
one Cloudflare application

/static client assets
        +
/ Worker API
```

This keeps the frontend and API on the same origin whenever practical:

```text
https://app.example.com/
https://app.example.com/tap/<tag-id>
https://app.example.com/api/...
```

Benefits:

- simpler cookies and session behavior;
- no unnecessary CORS setup;
- simple NFC URLs;
- one deployment boundary;
- simple production domain.

---

# 12. Hyperdrive

## Role

Connection management/acceleration between Cloudflare Workers and the external PostgreSQL database.

Architecture:

```text
Worker
  ↓
Hyperdrive
  ↓
Neon PostgreSQL
```

Hyperdrive is not a replacement database.

Important consistency rule:

- Use cache-enabled reads only where brief staleness is acceptable.
- Use cache-disabled/fresh access for authentication, permissions and reads that must immediately reflect a previous write.

This is especially important for the blind-reveal mechanic.

---

# 13. Neon PostgreSQL

## Role

Authoritative relational database.

## Recommended logical domains

```text
users
couples
couple_members
nfc_tags
activities
submissions
media
push_subscriptions
affection_events
idempotency_keys
```

The schema should enforce relationships and uniqueness at the database level where practical.

Examples of important invariants:

- a user cannot belong to two active mutually-exclusive couple relationships if the business rules do not allow it;
- one submission per user per activity;
- NFC tag identifiers are unique;
- client mutation IDs are unique where used for idempotency;
- media records reference the expected ownership context.

---

# 14. Durable Objects

## Role

Realtime coordination around a couple.

Recommended conceptual mapping:

```text
Couple ID
   ↓
Durable Object instance
   ↓
WebSocket connections
   ├── User A
   └── User B
```

Use Durable Objects for:

- active WebSocket connections;
- partner status updates;
- low-latency broadcast of safe events;
- couple-specific ephemeral coordination.

Do not use the Durable Object as the primary long-term database when Neon is the application source of truth.

The DO may maintain temporary state, but important business state belongs in Neon.

When using WebSocket Hibernation, design handlers so a hibernated object can restore whatever state it needs from authoritative storage or object storage.

---

# 15. Cloudflare R2

## Role

Object storage for original/private user media.

Preferred upload flow:

```text
PWA
 ↓
Hono auth check
 ↓
short-lived direct upload authorization
 ↓
R2 direct upload
```

The API should not proxy large image bodies through the Worker unless there is a strong reason.

R2 currently documents a Free tier including 10 GB-month of Standard storage, 1 million Class A operations/month and 10 million Class B operations/month, with free internet egress. Always verify current limits/pricing before a production billing decision.

---

# 16. Cloudflare Images Free

## Role

Image transformation/optimization layer for images stored outside Images, such as R2.

For the free architecture, do **not** rely on Images Storage.

Use:

```text
R2
  ↓
Cloudflare Images transformations
  ↓
optimized delivery
```

Cloudflare's current Images Free plan provides up to 5,000 unique transformations per month and can optimize images stored outside Images, including R2. Images Storage itself is a paid feature.

This makes the combination:

```text
R2 = storage
Images Free = transformations
```

appropriate for the initial zero-infrastructure-cost target.

---

# 17. Web Push

## Role

Asynchronous notifications when the partner is not actively using the app.

Examples:

```text
"Te extraño ❤️"
"Tu pareja ya respondió 👀"
```

Use standard Push API + Notifications API + Service Worker concepts.

Store one push subscription per browser/device context.

Important: Push is not the realtime system. Use WebSocket/Durable Objects while the user is connected; use push for out-of-app notification.

Apple currently documents Web Push support for Home Screen web apps on iOS/iPadOS 16.4+.

---

# 18. NFC and browser limitation

The cross-platform product contract is:

```text
NFC tag
  ↓
NDEF URL
  ↓
OS opens URL
  ↓
PWA route
```

Do not require:

```text
Web NFC API
```

for the product to work.

As of September 2026, Web NFC is not supported in Safari/iOS according to current browser compatibility data. Chrome for Android supports the API.

---

# 19. End-to-end architecture

```text
                         MOBILE DEVICE
┌────────────────────────────────────────────────────┐
│                                                    │
│  React + Vite                                      │
│      │                                             │
│  TanStack Router                                   │
│      │                                             │
│  ┌───┴───────────────┐                             │
│  │                   │                             │
│ TanStack Query      Dexie                         │
│  │                   │                             │
│  │              IndexedDB / Outbox                │
│  │                   │                             │
│  └─────────┬─────────┘                             │
│            │                                       │
│          Workbox                                   │
│      Service Worker                                │
│                                                    │
└────────────┬───────────────────────────────────────┘
             │ HTTPS
             ▼
┌────────────────────────────────────────────────────┐
│                CLOUDFLARE EDGE                     │
│                                                    │
│  Static Assets (React/Vite)                       │
│                 +                                  │
│  Cloudflare Worker                                 │
│       └── Hono API                                 │
│             │                                      │
│      ┌──────┼──────────────┐                       │
│      │      │              │                       │
│ Hyperdrive DO/WebSocket   Web Push                 │
│      │      │              │                       │
└──────┼──────┼──────────────┼──────────────────────┘
       │      │              │
       ▼      │              ▼
   Neon DB    │         Partner device
              │
              ▼
       Couple realtime

       Separate media path:

       PWA → authorized upload → R2
                                ↓
                       Images transformations
```

---

# 20. Principles for future agents

1. Do not introduce Next.js, NestJS, Express or FastAPI merely because they are familiar or popular. Any change of backend/runtime should have a documented reason tied to product requirements.
2. Do not move all state to the server and remove Dexie; offline-first is a core product requirement.
3. Do not trust local state for authorization.
4. Do not upload large images through the main Worker by default.
5. Do not poll the partner's status aggressively when realtime/local sync can solve it.
6. Do not expose partner submission content before both partners have completed.
7. Do not make Web NFC a required dependency.
8. Keep the frontend and API same-origin when practical.
9. Prefer idempotent mutations and stable client-generated IDs.
10. Preserve mobile UX and perceived immediacy when refactoring backend/data flows.
