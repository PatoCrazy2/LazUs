# Rule: Offline-First Architecture & Outbox Synchronization

This rule defines the contract for client persistence, the optimistic UX model, mutation idempotency, and network synchronization in LazUs.

---

## 1. Storage & Persistence Principles

1. **Persistent Storage Request:**
   On application startup (in `src/main.tsx` or app initialization), the PWA must request persistent storage:
   ```typescript
   if (navigator.storage && navigator.storage.persist) {
     const isPersisted = await navigator.storage.persist();
     // Log storage persistence status locally
   }
   ```
   This prevents mobile OS eviction (especially Safari/iOS storage cleanup) under disk pressure.

2. **Dexie (IndexedDB) as Client Source of Truth for UX:**
   - App screens must read from Dexie first to render instantly (zero loading spinners on app launch or NFC tap).
   - Server data fetched via TanStack Query is continuously written to Dexie to maintain a fresh offline replica.
   - Conceptual Dexie tables:
     - `profile`
     - `couple`
     - `activities`
     - `submissions`
     - `outbox`
     - `sync_metadata`

---

## 2. The Outbox Pattern & Mutation Flow

All mutating user actions (e.g. submitting an answer, sending affection, linking an NFC tag) must go through the Outbox queue to guarantee survival across network drops or app restarts.

### Outbox Record Structure (Dexie)
```typescript
interface OutboxItem {
  id: string;                    // Local primary key (UUID)
  client_mutation_id: string;    // Stable UUID sent to server for idempotency
  mutation_type: 'SUBMIT_ACTIVITY' | 'SEND_AFFECTION' | 'LINK_NFC' | 'UPDATE_PROFILE';
  payload: Record<string, unknown>;
  created_at: number;            // Timestamp (ms)
  attempt_count: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed_permanent';
  last_error?: string;
  next_retry_at?: number;        // Exponential backoff timestamp
}
```

### Execution Flow
1. **User Action:**
   - Write optimistic record to local Dexie tables (`submissions`, `activities`).
   - Write mutation to `outbox` table with `status: 'pending'`.
   - Update UI immediately.
2. **Network Sync Worker:**
   - When online (`navigator.onLine === true` or network event):
     - Pick next `pending` item where `next_retry_at <= Date.now()`.
     - Set status to `'syncing'`.
     - Send request to Hono API with header/body containing `client_mutation_id`.
     - On **2xx Success**:
       - Reconcile local state with server response.
       - Delete or mark outbox item as `'synced'`.
     - On **5xx Server Error / Network Timeout**:
       - Increment `attempt_count`.
       - Compute exponential backoff with jitter: `next_retry_at = Date.now() + Math.min(30000, (2 ** attempt_count) * 1000 + Math.random() * 1000)`.
       - Set status to `'pending'`.
     - On **4xx Client Error (Unprocessable / Conflict / Forbidden)**:
       - **Do not retry blindly.**
       - Move item to Dead-Letter Queue: `status = 'failed_permanent'`.
       - Notify the user via non-intrusive toast / status indicator.

---

## 3. Server-Side Idempotency (PostgreSQL / Drizzle)

The server must handle repeated deliveries of the exact same mutation without creating duplicate records or sending repeated push notifications.

### Schema Requirement
```sql
CREATE TABLE idempotency_keys (
  key UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  operation_type VARCHAR(64) NOT NULL,
  response_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Server Mutation Lifecycle
1. Extract `client_mutation_id` from request.
2. Look up `idempotency_keys` where `key = client_mutation_id` and `user_id = auth.user_id`.
3. If existing:
   - Return stored `response_code` and `response_body` immediately.
4. If not existing:
   - Execute mutation inside a database transaction.
   - Insert row into `idempotency_keys` storing result payload.
   - Commit transaction.
   - Dispatch side effects (Web Push, Durable Object notification) only after commit.
