# AI Agent Context — Couple PWA

This folder contains the canonical project context for AI coding agents working on the couple-focused PWA.

## Files

### `00_PROJECT_CONTEXT.md`
Product identity, goals, non-goals, domain principles, privacy/security rules and the overall UX philosophy.

### `01_CORE_FLOWS.md`
Business-critical user flows: authentication/pairing, daily activities, blind reveal, NFC interactions, offline-first submission, realtime state, push notifications and image uploads.

### `02_STACK_AND_ARCHITECTURE.md`
Chosen technologies, responsibilities, architectural boundaries, data authority rules and end-to-end architecture.

### `03_DEPLOYMENT_AND_INFRA.md`
Deployment model, Cloudflare architecture, environments, free-tier strategy, storage/media deployment, CI/CD, observability and scaling path.

## Canonical stack

```text
React + TypeScript
Vite
TanStack Router
TanStack Query
Dexie
Workbox
Hono
Cloudflare Workers
Hyperdrive
Neon PostgreSQL
Durable Objects
Cloudflare R2
Cloudflare Images Free transformations
Web Push
```

## Non-negotiable architectural rules

1. The app is offline-first.
2. Dexie is for local persistence and fast UX; Neon is authoritative.
3. Local state must never bypass server authorization.
4. Partner responses remain blind until both sides have completed.
5. Mutations should be idempotent.
6. Large images should be uploaded directly to R2, not proxied through Hono/Workers by default.
7. Durable Objects are for realtime coordination, not the primary permanent database.
8. Web Push and WebSocket realtime solve different problems.
9. NFC must work through HTTPS NDEF URLs/deep links and must not depend on Web NFC API support.
10. Production deployment is intended for Cloudflare rather than Vercel.
11. Do not replace the chosen stack with a different framework merely because it is familiar; changes require a technical reason tied to product requirements.
12. Optimize for perceived mobile speed and emotional UX, not merely benchmark throughput.

## Expected decision hierarchy

When making implementation decisions, prefer this order:

```text
1. Preserve product/security invariants
2. Preserve instant/offline-first UX
3. Preserve authoritative server state
4. Keep architecture simple and observable
5. Minimize infrastructure cost
6. Optimize raw performance where it is actually measurable
```
