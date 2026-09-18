---
name: feature-scaffold
description: Scaffold a complete full-stack feature slice adhering to Vertical Slice Architecture across frontend (React/Dexie), backend (Hono/Drizzle), and shared Zod schemas.
---

# Feature Scaffolding Runbook

Use this skill whenever you need to create a new business domain feature in LazUs (e.g. `streaks`, `memories`, `voice-notes`).

---

## 1. Feature Architectural Blueprint

Every domain feature consists of three connected slices:
```text
shared/schemas/<feature>.schema.ts   <-- Contract & Zod Validation
       │                    │
       ▼                    ▼
server/features/<feature>/  src/features/<feature>/
(Hono + Drizzle + Guards)    (React + TanStack Query + Dexie)
```

---

## 2. Step-by-Step Scaffolding Procedure

### Step 1: Define Shared Zod Contract (`shared/schemas/`)
Create `shared/schemas/<feature>.schema.ts`:
1. Define input DTOs, mutation payloads, and response schemas.
2. Ensure every mutation includes `client_mutation_id: z.string().uuid()`.
3. Export inferred TypeScript types.

```typescript
import { z } from 'zod';

export const ExampleActionSchema = z.object({
  client_mutation_id: z.string().uuid(),
  feature_id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export type ExampleActionInput = z.infer<typeof ExampleActionSchema>;
```

---

### Step 2: Implement Backend Slice (`server/features/<feature>/`)
Create the directory `server/features/<feature>/` containing:
1. `<feature>.routes.ts`:
   - Define Hono sub-app: `export const featureRoutes = new Hono<Env>()`.
   - Protect with auth & couple membership middleware.
   - Attach `zValidator('json', ExampleActionSchema)`.
2. `<feature>.service.ts`:
   - Check idempotency in `idempotency_keys` table.
   - Execute domain logic.
   - If mutating state, trigger side-effects (Durable Object broadcast or Web Push).
3. Mount the new router into `server/index.ts`:
   ```typescript
   app.route('/api/<feature>', featureRoutes);
   ```

---

### Step 3: Implement Database Tables (If applicable)
If the feature requires database persistence:
1. Add table definitions in `server/db/schema.ts`.
2. Follow `/db-migrate` to generate and apply migrations.

---

### Step 4: Implement Frontend Slice (`src/features/<feature>/`)
Create the directory `src/features/<feature>/`:
1. `api/`: API caller functions interacting with `/api/<feature>`.
2. `store/`: Local Dexie schema updates and optimistic update logic.
3. `hooks/`:
   - `use<Feature>Data.ts`: Wraps `useQuery` with local Dexie cache fallback.
   - `use<Feature>Mutation.ts`: Enqueues to Outbox, updates Dexie optimistically, triggers sync.
4. `components/`: UI components specific to this feature (forms, cards, visual states).

---

### Step 5: Mount Route in TanStack Router
1. Create or update route file in `src/routes/` or router configuration.
2. Link new screens into navigation without breaking offline fallback.

---

## 3. Boundary & Quality Checklist
Before considering the scaffold complete, verify:
- [ ] No internal files of another feature are imported.
- [ ] UI renders immediately from Dexie before network fetch finishes.
- [ ] Secret partner content is omitted from queries if conditions are not met.
- [ ] All forms validate inputs via the shared Zod schema.
