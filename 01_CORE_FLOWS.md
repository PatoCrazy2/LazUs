# Core Flows — Couple PWA

This file describes the expected product behavior. Treat these flows as business requirements unless a later specification explicitly changes them.

---

## 1. Authentication and pairing

### 1.1 User A — creates/activates the couple relationship

1. User A installs the PWA to the Home Screen.
2. User A creates an account through the supported authentication flow (OAuth and/or email/password).
3. The app asks User A to scan a physical NFC bracelet/tag.
4. The tag contains a unique URL/token identifier.
5. The backend validates the tag and associates it with User A or prepares it for pairing.

### 1.2 User B — joins using the physical tag

1. User B installs the PWA and creates their own account.
2. User B taps the NFC bracelet/tag belonging to User A.
3. The operating system opens the app URL, for example:

```text
https://app.example.com/link/<tag-id>
```

4. The app resolves the tag and identifies that it belongs to a pending/active pairing invitation.
5. The UI asks for explicit confirmation:

```text
¿Deseas vincular tu cuenta con <Partner Name>?
```

6. After confirmation, the backend creates or activates the Couple relationship.
7. Both users become members of the same couple.

### Pairing requirements

- Pairing must be idempotent.
- The same tag must not accidentally create duplicate couples.
- Users must not be able to pair with someone else without explicit authorization.
- The backend is authoritative for the relationship.
- The UI should make the NFC action feel simple and low-friction.

---

## 2. Daily activity generation

Each day, the couple receives one activity/question (or a deterministic daily activity chosen by the backend).

Examples:

- "Sube una foto de lo que estás desayunando."
- "¿Cuál fue tu momento favorito de ayer?"
- "Describe tu día con tres emojis."

A daily activity has a couple-visible identity, a date/time scope, and two possible submissions: one per partner.

The backend must prevent accidental cross-day mixing.

Conceptually:

```text
DailyActivity
  ├── couple_id
  ├── date / logical day key
  ├── prompt
  └── status

Submission
  ├── activity_id
  ├── user_id
  ├── text and/or media
  └── completion timestamp
```

---

## 3. Blind mechanic

There are three primary states from the perspective of the current user.

### State A — nobody has completed

```text
A = pending
B = pending
```

UI:

```text
Today's activity
[question/prompt]
[answer UI]
```

The user can complete the activity.

### State B — current user completed, partner pending

```text
A = completed
B = pending
```

The current user sees:

```text
Respuesta guardada ❤️
Estamos esperando a <Partner Name>.
Cuando ambos terminen, podrán descubrir sus respuestas.
```

The current user must **not** see the partner submission content.

The partner should get an indication that the other person has already completed, without exposing their content.

### State C — both completed

```text
A = completed
B = completed
```

The results view becomes available:

```text
/results/<activity-id>
```

The UI should reveal both submissions with an intentional animation.

The server must authorize this state before protected submission content is returned.

---

## 4. NFC interaction flow

### 4.1 Tag purpose

The tag can contain a stable URL like:

```text
https://app.example.com/tap/<tag-id>
```

The tag itself should remain simple. Business logic belongs to the application/backend.

### 4.2 Case A — current user has not completed

Condition:

```text
mySubmission = absent
```

Expected behavior:

```text
NFC tap
  ↓
PWA opens /tap/<tag-id>
  ↓
local state is read immediately
  ↓
route to today's activity
```

No unnecessary API wait should be required to decide the initial UX.

### 4.3 Case B — current user completed, partner pending

Condition:

```text
mySubmission = completed
partnerSubmission = pending
```

Expected behavior:

```text
NFC tap
  ↓
PWA opens /tap/<tag-id>
  ↓
local state identifies affection state
  ↓
show a subtle animation immediately
  ↓
send POST /api/affection asynchronously
  ↓
backend validates relationship + rate limits
  ↓
Web Push sent to partner
```

The user should not be forced away from the current screen.

Possible UI feedback:

```text
❤️ Toque enviado
```

### 4.4 Case C — both completed

Condition:

```text
mySubmission = completed
partnerSubmission = completed
```

Expected behavior:

```text
NFC tap
  ↓
PWA opens /tap/<tag-id>
  ↓
route to results
  ↓
run reveal animation
  ↓
show both responses
```

Again, the client can pre-route based on local state, but the server controls whether protected content may actually be fetched/revealed.

---

## 5. Offline-first submission flow

The app must handle temporary network loss as a normal condition, not an exceptional crash.

### Submit while online

```text
User submits
  ↓
write submission locally
  ↓
render success immediately
  ↓
enqueue mutation
  ↓
send API request
  ↓
server confirms
  ↓
mark outbox item synced
```

### Submit while offline

```text
User submits
  ↓
write submission to Dexie
  ↓
mark local state as pending-sync
  ↓
render success immediately
  ↓
add outbox mutation
  ↓
wait for connectivity
  ↓
retry automatically
  ↓
server confirms
  ↓
mark synced
```

The local record should contain enough metadata for safe retries, including a stable client-generated idempotency identifier.

Example:

```text
clientMutationId = UUID
```

The backend must treat repeated delivery of the same mutation as idempotent.

---

## 6. Realtime partner state

When one partner completes the activity, the other partner should be able to learn that the partner has completed without polling aggressively.

Expected behavior:

```text
A submits
  ↓
Hono API
  ↓
Neon authoritative write
  ↓
Realtime event
  ↓
Couple's Durable Object
  ↓
WebSocket
  ↓
B updates UI
```

Only safe state should be broadcast in realtime. Do not broadcast protected submission contents before the reveal condition is satisfied.

Safe example:

```json
{
  "type": "partner_submission_status_changed",
  "activityId": "...",
  "completed": true
}
```

Unsafe example before reveal:

```json
{
  "partnerAnswer": "...secret content..."
}
```

---

## 7. Web Push affection flow

The push system is separate from realtime.

Realtime:

```text
partner is inside the app
```

Web Push:

```text
partner may be outside the app
```

Example:

```text
A taps bracelet
  ↓
PWA reads local state
  ↓
POST /api/affection
  ↓
Hono validates request
  ↓
backend sends Web Push
  ↓
B receives notification
```

Push subscriptions must be stored per device/browser, not merely per user.

---

## 8. Photo submission flow

Do not upload large image files through the main API Worker.

Preferred flow:

```text
PWA
  ↓
POST /api/media/upload-url
  ↓
Hono verifies user/couple/activity
  ↓
returns short-lived upload authorization
  ↓
PWA uploads directly to R2
  ↓
PWA tells backend which object was uploaded
  ↓
backend stores media metadata in Neon
```

The database stores metadata/object keys, not the image blob.

Recommended media metadata concept:

```text
Media
  ├── id
  ├── couple_id
  ├── activity_id
  ├── owner_id
  ├── object_key
  ├── mime_type
  ├── size
  ├── width
  ├── height
  └── created_at
```

Private media must not be directly publicly enumerable.

---

## 9. Failure/recovery rules

The app should gracefully handle:

- no internet;
- internet loss immediately after submit;
- duplicate retries;
- app being closed while a mutation is pending;
- stale local state;
- partner completing on another device;
- token/tag being invalid or already claimed;
- unauthorized attempts to open a result URL;
- expired upload URLs;
- push subscription changes.

For security-sensitive operations, stale local state must never bypass server authorization.
