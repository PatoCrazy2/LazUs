---
name: db-migrate
description: Manage PostgreSQL database migrations locally using Docker and Drizzle ORM, verify schema sync, and launch Drizzle Studio.
---

# Database Migration & Local Postgres Runbook

Use this skill whenever you need to start the local PostgreSQL database, apply schema modifications, generate migration files, or inspect database records.

---

## Prerequisites & Environment

1. Ensure Docker is running on your machine.
2. Local connection string standard:
   ```env
   DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/lazus_db"
   ```

---

## Step 1: Verify and Start Local PostgreSQL Container

Check if the local PostgreSQL container is running:

```powershell
docker compose ps
```

If it is not running or not started, start it in detached mode:

```powershell
docker compose up -d postgres
```

Wait until the healthcheck confirms readiness:
```powershell
docker compose exec postgres pg_isready -U postgres -d lazus_db
```

---

## Step 2: Edit or Define Schema (`server/db/schema.ts`)

1. Make schema changes exclusively in `server/db/schema.ts` using Drizzle ORM pg table definitions.
2. Verify that:
   - Primary keys use UUIDs (`uuid('id').defaultRandom().primaryKey()`).
   - Foreign keys explicitly declare `onDelete: 'cascade'` or `'restrict'`.
   - Unique constraints are present for invariants (e.g. `(activity_id, user_id)` on `submissions`).
   - Timestamps use `timestamp('created_at', { withTimezone: true }).defaultNow()`.

---

## Step 3: Generate SQL Migrations

Generate the declarative SQL migration file in `drizzle/migrations/`:

```powershell
pnpm drizzle-kit generate
```

Inspect the generated `.sql` file in `drizzle/migrations/` to ensure no destructive `DROP TABLE` or unintended column drops occurred.

---

## Step 4: Apply Migrations to Database

Execute pending migrations against the local PostgreSQL container:

```powershell
pnpm drizzle-kit migrate
```

To verify table synchronization directly in dev:
```powershell
pnpm drizzle-kit push
```
*(Note: Use `drizzle-kit migrate` for production-grade versioned files; `drizzle-kit push` is allowed only for rapid local prototyping).*

---

## Step 5: Visual Inspection with Drizzle Studio

To visually explore tables, rows, and relationships without installing heavy third-party desktop tools:

```powershell
pnpm drizzle-kit studio
```

Open the printed URL (typically `https://local.drizzle.studio` or `http://localhost:4983`) in your browser.

---

## Step 6: Troubleshooting & Common Pitfalls

- **Port 5432 already allocated:** If a local native PostgreSQL service is running on the host, either stop the host service (`Stop-Service postgresql*`) or map the container port in `docker-compose.yml` to `5433:5432`.
- **Neon Cloud Migration:** To apply migrations to the remote Neon production database, set `DATABASE_URL` to your Neon direct connection pool string before running `npx drizzle-kit migrate`.
