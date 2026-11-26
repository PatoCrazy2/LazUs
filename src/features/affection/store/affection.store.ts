import type { SendAffectionInput } from '../../../../shared'
import {
  enqueueMutation,
  getPendingMutations,
  handleSyncError,
  markMutationSynced,
} from '../../../db/outbox'
import { AffectionApiError, affectionApi } from '../api/affection.api'

export const AFFECTION_COOLDOWN_MS = 2000

export type AffectionEventType = SendAffectionInput['event_type']

export interface EnqueueAffectionResult {
  deduplicated: boolean
  clientMutationId: string | null
}

let lastEnqueuedAt: number | null = null
let lastClientMutationId: string | null = null
let activeFlushPromise: Promise<number> | null = null

async function runFlushPass(): Promise<number> {
  const pending = await getPendingMutations()
  const affectionMutations = pending.filter((m) => m.mutation_type === 'SEND_AFFECTION')
  let syncedCount = 0

  for (const item of affectionMutations) {
    const rawType = item.payload?.event_type
    const eventType: AffectionEventType =
      rawType === 'hug' ||
      rawType === 'kiss' ||
      rawType === 'thinking_of_you' ||
      rawType === 'heart_tap'
        ? rawType
        : 'heart_tap'

    try {
      await affectionApi.sendAffection({
        client_mutation_id: item.client_mutation_id,
        event_type: eventType,
      })
      await markMutationSynced(item.id)
      syncedCount++
    } catch (err) {
      const statusCode = err instanceof AffectionApiError ? err.status : 0
      const message = err instanceof Error ? err.message : 'Error de sincronización de afecto'
      await handleSyncError(item.id, statusCode, message)
    }
  }

  return syncedCount
}

export const affectionStore = {
  /**
   * Encola un toque de afecto con ventana anti-rebote de 2s para absorber
   * lecturas NFC dobles accidentales sin generar duplicados en BD.
   */
  async sendOrQueueAffection(
    eventType: AffectionEventType = 'heart_tap',
    now: number = Date.now()
  ): Promise<EnqueueAffectionResult> {
    if (lastEnqueuedAt !== null && now - lastEnqueuedAt < AFFECTION_COOLDOWN_MS) {
      return {
        deduplicated: true,
        clientMutationId: lastClientMutationId,
      }
    }

    const previousEnqueuedAt = lastEnqueuedAt
    lastEnqueuedAt = now

    try {
      const item = await enqueueMutation('SEND_AFFECTION', {
        event_type: eventType,
      })
      lastClientMutationId = item.client_mutation_id

      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        void this.flushOutbox()
      }

      return {
        deduplicated: false,
        clientMutationId: item.client_mutation_id,
      }
    } catch (err) {
      lastEnqueuedAt = previousEnqueuedAt
      throw err
    }
  },

  /**
   * Sincroniza mutaciones SEND_AFFECTION pendientes evitando ejecuciones paralelas duplicadas.
   */
  async flushOutbox(): Promise<number> {
    if (activeFlushPromise) {
      return await activeFlushPromise
    }

    activeFlushPromise = runFlushPass().finally(() => {
      activeFlushPromise = null
    })

    return await activeFlushPromise
  },

  resetState(): void {
    lastEnqueuedAt = null
    lastClientMutationId = null
  },
}
