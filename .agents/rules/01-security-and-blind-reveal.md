# Rule: Security, Privacy & The Blind Reveal Invariant

This rule defines non-negotiable security requirements for data access, the blind reveal mechanic, and media handling in LazUs.

---

## 1. The Zero-Leak Blind Reveal Contract

The core emotional value of the product depends on neither partner seeing the other's daily activity submission until **both** have completed their submission.

### Backend Requirements (Hono / SQL)
1. **Physical SQL Omission:**
   When fetching daily activity status (`GET /api/activities/today` or `GET /api/activities/:id`), the SQL query must **physically omit** the partner's answer fields (`content`, `media_url`, `answers_json`):
   ```sql
   -- BEFORE REVEAL (either partner has not completed)
   -- Partner record only returns completion status:
   SELECT id, user_id, (completed_at IS NOT NULL) AS has_completed, completed_at
   FROM submissions
   WHERE activity_id = $activity_id AND user_id = $partner_id;
   
   -- ONLY WHEN BOTH SUBMISSIONS ARE VERIFIED AS COMPLETED:
   -- Full content may be queried and returned.
   ```
2. **Never Mask on the Client:**
   Do **not** return the partner's submission payload masked or with a flag like `{ content: "secret", hidden: true }` in JSON. Any payload arriving at the browser can be inspected via DevTools.
3. **Atomic Reveal Transition:**
   The reveal condition must be evaluated atomically in a database transaction when a submission is inserted:
   - Check if partner submission exists and is completed.
   - If yes: set `activity.status = 'revealed'`, record `revealed_at = NOW()`.
   - Broadcast `activity_ready_to_reveal` via Durable Object WebSocket (without payload content).

---

## 2. Realtime WebSocket Security (Durable Objects)

1. **Safe Event Vocabulary Only:**
   The Durable Object room must only broadcast ephemeral, safe coordination signals:
   - `partner_online` / `partner_offline`
   - `partner_submission_completed` (flags completion, never includes text/photo)
   - `activity_ready_to_reveal` (signals client to invoke authorized reveal fetch)
   - `affection_received` (triggers animation/haptic)
2. **Zero Secret Broadcast:**
   Never stream raw submission text or photo keys over WebSocket channels. The client must perform an authenticated HTTP request (`GET /api/activities/:id/reveal`) once notified that both have finished.

---

## 3. Media & Photo Security (Cloudflare R2)

1. **Private Bucket Policy:**
   The R2 bucket storing couple photographs must **never** be public.
2. **Direct-to-R2 Presigned Uploads:**
   The client requests a presigned PUT URL from `POST /api/media/upload-url`.
   - The Hono endpoint authenticates the user, verifies couple membership, and generates a scoped S3-compatible presigned URL valid for **maximum 10 minutes**.
3. **Authorized Media Retrieval:**
   Private media is served through short-lived signed GET URLs (TTL $\le$ 15 minutes) or an authenticated Worker proxy that verifies couple membership before streaming from R2.

---

## 4. Couple Membership & Authorization Verification

Every API endpoint under `/api/couple/*`, `/api/activities/*`, `/api/affection/*`, `/api/media/*`:
1. Validates session token / cookie.
2. Resolves authenticated `user_id`.
3. Asserts that `user_id` belongs to an active couple in `couple_members`.
4. Asserts that the requested resource (`activity_id`, `submission_id`, `media_id`) belongs strictly to that `couple_id`.
5. If any check fails, immediately respond with `401 Unauthorized` or `403 Forbidden`. Never return 404 in a way that leaks entity existence.

---

## 5. Log Sanitization

1. **Forbidden Log Content:**
   - Submission text or answers.
   - Image URLs or object keys.
   - NFC tag raw secrets/tokens.
   - Session tokens, JWTs, or Authorization headers.
2. **Permitted Log Content:**
   - Structured JSON with `timestamp`, `level`, `trace_id`, `couple_id`, `activity_id`, `status_code`, `latency_ms`.
