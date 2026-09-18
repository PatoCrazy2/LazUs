# Project Context — PWA for Couples

## 1. Product identity

This project is a mobile-first Progressive Web App (PWA) for romantic couples (boyfriends/girlfriends). The product is not a dating app. Its purpose is to strengthen the connection between two already-paired people through small, recurring digital activities and physical interactions.

The central product idea is a **conditional reveal / blind mechanism**:

> A partner cannot see the other partner's answer until they have completed their own answer for the same daily activity.

The physical layer is provided by **NFC tags** (for example, paired bracelets). NFC tags act as physical triggers for onboarding, daily actions, affection interactions, and result reveals.

## 2. Product goals

The experience should feel like a polished native mobile app even though it is a web application/PWA.

Primary UX goals:

- Instant perceived response after opening the app or tapping an NFC tag.
- Offline-first operation for normal daily use.
- Very low friction when pairing two people.
- Strong anticipation and emotional feedback around the blind reveal mechanic.
- Reliable synchronization when connectivity returns.
- Private handling of uploaded photographs.
- Real-time awareness when the partner completes an activity.
- Push notifications for lightweight affection events.

## 3. Non-goals

Do not turn this into a social network, public feed, dating platform, or customer-management system.

The product is centered on a single relationship/couple. Public social discovery is not part of the core architecture.

## 4. Core domain model

Conceptually, the main entities are:

```text
User
  └── Couple Membership
          └── Couple
               ├── Member A
               ├── Member B
               ├── NFC Tags
               ├── Daily Activities
               │      ├── Submission A
               │      └── Submission B
               ├── Media
               └── Affection Events
```

The exact database schema can evolve, but these business concepts must remain explicit.

## 5. Source of truth rule

The local database is **not** the authoritative source for security-sensitive business decisions.

Use this rule throughout the codebase:

```text
Dexie / IndexedDB
= local speed, persistence, offline queue, optimistic UX

Neon PostgreSQL
= authoritative business state, permissions, pairing, completion and reveal rules
```

The client may make the UI feel instant, but the server must ultimately validate whether a reveal is allowed.

## 6. UX philosophy

Avoid loading spinners whenever local state is sufficient to render the screen.

Prefer:

```text
open app
  -> read local state
  -> render immediately
  -> synchronize silently
```

rather than:

```text
open app
  -> wait for API
  -> spinner
  -> render
```

The same principle applies to NFC:

```text
NFC tap
  -> URL/deep link opens PWA
  -> local state determines immediate UX
  -> server is contacted only when needed
```

## 7. Emotional/product tone

The UI should feel intimate, playful, modern, elegant and intentional.

Avoid generic enterprise-dashboard aesthetics. Avoid making every interaction look like a form submission.

Important UX moments include:

- Daily prompt presentation.
- Waiting state after submitting first.
- Anticipation when the partner has already answered.
- The reveal animation once both have answered.
- Affection feedback after an NFC tap.
- Offline saved state.
- Partner pairing confirmation.

## 8. Security/privacy principles

Couple content is private by default.

Do not expose partner submissions merely because the client has an identifier.

The server must verify:

- authenticated user identity;
- active couple membership;
- ownership/relationship to a submission;
- whether both required submissions exist;
- whether the current user is authorized to see a result;
- whether a media object belongs to the expected couple/activity context.

Never trust IndexedDB values for authorization.

## 9. NFC principle

NFC tags should primarily contain URLs, for example:

```text
https://app.example.com/link/<tag-id>
https://app.example.com/tap/<tag-id>
```

The product must **not depend on Web NFC API support in Safari/iOS**. The primary cross-platform mechanism is an NFC tag that opens a URL/deep link through the operating system.

Web NFC can be treated as an optional enhancement only. As of September 2026, Web NFC is not supported in Safari/iOS; Chrome for Android supports it. Validate platform behavior before depending on any browser-level NFC API.

## 10. Product-level success condition

The app should make this interaction feel magical:

```text
physical NFC tap
      ↓
phone opens the PWA
      ↓
local state is evaluated immediately
      ↓
one of the following happens:

A. go to today's task
B. send affection in the background + animate locally
C. go to results + reveal both responses
```

This perceived immediacy is one of the most important product requirements.
