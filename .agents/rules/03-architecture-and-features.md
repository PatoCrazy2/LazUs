# Rule: Vertical Slice Architecture & Boundary Invariants

This rule defines project organization, code boundaries, and runtime separation for both frontend and backend in LazUs.

---

## 1. Feature-Sliced / Vertical Slice Architecture

Code is grouped by **business domain features**, not technical roles.

### Primary Domain Features
- `auth`: Registration, session validation, OAuth.
- `couple`: Pairing invitations, partner status, anniversary, couple metadata.
- `activities`: Daily prompts, answering, waiting states, blind reveal.
- `affection`: NFC quick reactions, heart animations, haptic feedback.
- `nfc`: Tag URL resolving (`/tap/:tagId`, `/link/:tagId`), tag claims.
- `media`: R2 presigned upload requests, image optimization delivery.
- `realtime`: Durable Object WebSocket client, presence tracking.
- `notifications`: Web Push VAPID registration and permissions.

### Cross-Feature Boundary Rules
1. **No Direct Inter-Feature Imports:**
   - `src/features/activities` must **never** directly import private components or internal hooks from `src/features/affection`.
   - If two features share logic, extract it to:
     - `src/components/ui/` (stateless presentation)
     - `src/lib/` (pure utility functions)
     - `src/db/` (shared Dexie models)
     - `shared/` (types and validation schemas)
2. **Feature Folder Structure Standard:**
   ```text
   src/features/<feature-name>/
   ├── components/       # Feature-specific UI components
   ├── hooks/            # TanStack Query hooks, state hooks
   ├── store/            # Local Dexie access & optimistic handlers
   ├── api/              # API caller functions (fetch / Hono RPC)
   └── types/            # Feature-internal types
   ```

---

## 2. Shared Contracts & Schema Validation (`shared/`)

1. **Zod as Single Source of Truth:**
   All API request bodies, query params, and DTOs are defined using Zod in `shared/schemas/<feature>.schema.ts`.
2. **Dual-Side Validation:**
   - The frontend validates inputs prior to outbox enqueuing.
   - The Hono backend validates payloads using the `zValidator` middleware before hitting route handlers.
3. **TypeScript Type Derivation:**
   Always export inferred types:
   ```typescript
   export const SubmitActivitySchema = z.object({
     client_mutation_id: z.string().uuid(),
     activity_id: z.string().uuid(),
     text_answer: z.string().min(1).max(1000).optional(),
     media_key: z.string().optional(),
   });
   
   export type SubmitActivityInput = z.infer<typeof SubmitActivitySchema>;
   ```

---

## 3. Backend Structure & Durable Object Invariants

### Backend Feature Standard (`server/features/`)
```text
server/features/<feature-name>/
├── <feature>.routes.ts       # Hono route handlers & zValidator
├── <feature>.service.ts      # Domain logic, idempotency checks
└── <feature>.repository.ts   # Drizzle ORM queries & transactions
```

### Durable Objects: WebSocket Hibernation API
To stay permanently within the **$0/month free tier** and prevent idle memory costs:
1. Every Durable Object managing couple rooms must implement the **WebSocket Hibernation API** (`DurableObject` class with `webSocketMessage`, `webSocketClose`, `webSocketError` methods).
2. Never store persistent business state in Durable Object storage. DO SQLite storage is only for active connected client references (`userId -> webSocketTag`).
3. Business state belongs exclusively in Neon PostgreSQL.

---

## 4. Forbidden Practices
- Do **not** create root-level technical buckets like `src/hooks/` for domain hooks. Keep hooks inside their respective feature.
- Do **not** use `localStorage` for sensitive relationship data or tokens.
- Do **not** perform raw `fetch()` calls inside React components; use TanStack Query hooks.
