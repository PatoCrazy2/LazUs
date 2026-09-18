import type { MutationType } from '../../shared'
import { db, type LocalOutboxItem } from './index'

/**
 * Encola una mutación en el Outbox local para sincronización segura tolerante a fallos
 */
export async function enqueueMutation(
  mutationType: MutationType,
  payload: Record<string, unknown>
): Promise<LocalOutboxItem> {
  const clientMutationId = crypto.randomUUID()

  const item: LocalOutboxItem = {
    id: crypto.randomUUID(),
    client_mutation_id: clientMutationId,
    mutation_type: mutationType,
    payload,
    created_at: Date.now(),
    attempt_count: 0,
    status: 'pending',
    next_retry_at: Date.now(),
  }

  await db.outbox.add(item)
  return item
}

/**
 * Recupera mutaciones pendientes listas para sincronizar
 */
export async function getPendingMutations(): Promise<LocalOutboxItem[]> {
  const now = Date.now()
  return await db.outbox
    .where('status')
    .equals('pending')
    .filter((item) => (item.next_retry_at ?? 0) <= now)
    .toArray()
}

/**
 * Manejo de error de sincronización:
 * - 5xx / Network Error: Exponential backoff con jitter
 * - 4xx (Client error): Envío a Dead-Letter Queue ('failed_permanent')
 */
export async function handleSyncError(
  outboxId: string,
  statusCode: number,
  errorMessage: string
): Promise<void> {
  const item = await db.outbox.get(outboxId)
  if (!item) return

  // Error de cliente (4xx) -> Dead-Letter Queue permanente, no ciclar
  if (statusCode >= 400 && statusCode < 500) {
    await db.outbox.update(outboxId, {
      status: 'failed_permanent',
      last_error: errorMessage,
    })
    return
  }

  // Error de servidor / red -> Reintento con backoff exponencial + jitter
  const nextAttempt = item.attempt_count + 1
  const jitter = Math.random() * 1000
  const delayMs = Math.min(30000, 2 ** nextAttempt * 1000 + jitter)

  await db.outbox.update(outboxId, {
    attempt_count: nextAttempt,
    status: 'pending',
    next_retry_at: Date.now() + delayMs,
    last_error: errorMessage,
  })
}

/**
 * Marca una mutación como sincronizada y la retira de la cola activa
 */
export async function markMutationSynced(outboxId: string): Promise<void> {
  await db.outbox.delete(outboxId)
}
