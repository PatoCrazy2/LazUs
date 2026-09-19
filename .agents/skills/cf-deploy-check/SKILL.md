---
name: cf-deploy-check
description: Pre-flight audit and validation runbook before deploying LazUs to Cloudflare Workers, ensuring $0 tier compliance, secret hygiene, and build integrity.
---

# Cloudflare Pre-Flight & Deployment Check Runbook

Use this skill before deploying to production or staging on Cloudflare Workers to prevent billing surprises, broken builds, or secret exposure.

---

## 1. Automated Static Verification

Run these commands locally or verify that your CI pipeline runs them:

```powershell
# 1. Type check client and server
pnpm tsc --noEmit

# 2. Lint check
pnpm run lint

# 3. Frontend & Worker bundle build
pnpm run build
```

Do not proceed with deployment if any build or type check errors exist.

---

## 2. Secrets & Environment Audit

Verify that private credentials never exist in frontend bundle code:

1. **Client Env Check (`.env` / `import.meta.env`):**
   - Only public variables prefixed with `VITE_` are allowed (e.g. `VITE_APP_URL`, `VITE_VAPID_PUBLIC_KEY`).
   - **Never** include `DATABASE_URL`, `VAPID_PRIVATE_KEY`, `SESSION_SECRET`, or `CF_API_TOKEN` in `VITE_*` variables.
2. **Cloudflare Worker Secrets:**
   Ensure secrets are securely set via Wrangler:
   ```powershell
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put WEB_PUSH_VAPID_PRIVATE_KEY
   ```

---

## 3. Cloudflare Free-Tier ($0/month) Compliance Audit

Review `wrangler.jsonc` bindings against free-tier constraints:

1. **Hyperdrive Binding:**
   - Verify Hyperdrive binding is configured for Neon PostgreSQL connection pooling.
   - Limit: 100,000 DB queries/day on Free tier. Ensure aggressive polling is disabled on client.
2. **Durable Objects:**
   - Verify that the Durable Object class uses the **WebSocket Hibernation API**.
   - Limit: 100,000 requests/day, 13,000 GB-s/day. Hibernating sockets prevent runaway GB-s usage.
3. **Cloudflare R2:**
   - Verify uploads use client presigned PUT URLs, not buffered Worker requests.
   - Limit: 10 GB storage, 1M Class A operations/month, 10M Class B operations/month.
4. **Cloudflare Images Free Transformations:**
   - Limit: 5,000 unique transformations/month.
   - Verify image query parameters use a fixed preset set (e.g. `w=400`, `w=800`, `w=1600`) to prevent combinatorial explosion.

---

## 4. Local Worker Simulation & Runtime Verification

Test the unified environment locally using `@cloudflare/vite-plugin`:

```powershell
pnpm run dev
```

Verify:
- PWA static assets and Hono API run together on `http://localhost:5173`.
- `/api/health` returns `200 OK` reading `.dev.vars` inside `workerd`.
- Deep links (e.g. `/tap/test-tag`) route to the PWA shell without returning a 404 from the Worker.

Optionally, to simulate the compiled production build artifact before cloud deployment:
```powershell
pnpm run build
npx wrangler dev
```

---

## 5. Production Deployment Command

When all checks pass:

```powershell
npx wrangler deploy
```
