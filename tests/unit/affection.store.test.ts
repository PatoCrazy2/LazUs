import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db'
import {
  AFFECTION_COOLDOWN_MS,
  AffectionApiError,
  affectionApi,
  affectionStore,
} from '../../src/features/affection'

describe('Affection Outbox Store & 2s Anti-Bounce Cooldown (affectionStore)', () => {
  beforeEach(async () => {
    await db.outbox.clear()
    affectionStore.resetState()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('encola SEND_AFFECTION con UUIDv4 client_mutation_id y sincroniza inmediatamente cuando hay red', async () => {
    const sendSpy = vi.spyOn(affectionApi, 'sendAffection').mockResolvedValue({
      status: 'success',
      affection_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      client_mutation_id: 'mocked',
      event_type: 'heart_tap',
      created_at: new Date().toISOString(),
      message: 'Toque de afecto registrado.',
    })

    const result = await affectionStore.sendOrQueueAffection('heart_tap', 10_000)

    expect(result.deduplicated).toBe(false)
    expect(result.clientMutationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )

    // Esperar a que termine el flush en segundo plano
    await affectionStore.flushOutbox()

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith({
      client_mutation_id: result.clientMutationId,
      event_type: 'heart_tap',
    })

    const remaining = await db.outbox.toArray()
    expect(remaining).toHaveLength(0)
  })

  it('absorbe lecturas NFC repetidas dentro de la ventana de 2000ms sin duplicar filas en Outbox', async () => {
    const sendSpy = vi.spyOn(affectionApi, 'sendAffection').mockResolvedValue({
      status: 'success',
      affection_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      client_mutation_id: 'mocked',
      event_type: 'heart_tap',
      created_at: new Date().toISOString(),
      message: 'OK',
    })

    const first = await affectionStore.sendOrQueueAffection('heart_tap', 50_000)
    const bounce1 = await affectionStore.sendOrQueueAffection('heart_tap', 50_450)
    const bounce2 = await affectionStore.sendOrQueueAffection('heart_tap', 51_999)

    expect(first.deduplicated).toBe(false)
    expect(bounce1.deduplicated).toBe(true)
    expect(bounce1.clientMutationId).toBe(first.clientMutationId)
    expect(bounce2.deduplicated).toBe(true)
    expect(bounce2.clientMutationId).toBe(first.clientMutationId)

    await affectionStore.flushOutbox()
    expect(sendSpy).toHaveBeenCalledTimes(1)

    // Pasados >= 2000ms se permite un nuevo toque intencional con nuevo client_mutation_id
    const intentionalNext = await affectionStore.sendOrQueueAffection(
      'hug',
      50_000 + AFFECTION_COOLDOWN_MS
    )
    expect(intentionalNext.deduplicated).toBe(false)
    expect(intentionalNext.clientMutationId).not.toBe(first.clientMutationId)

    await affectionStore.flushOutbox()
    expect(sendSpy).toHaveBeenCalledTimes(2)
  })

  it('preserva el mismo client_mutation_id en fallo de red/5xx (backoff exponencial) y sincroniza al recuperar', async () => {
    const sendSpy = vi
      .spyOn(affectionApi, 'sendAffection')
      .mockRejectedValueOnce(new AffectionApiError('Gateway Timeout', 504))
      .mockResolvedValueOnce({
        status: 'success',
        affection_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        client_mutation_id: 'replayed',
        event_type: 'heart_tap',
        created_at: new Date().toISOString(),
        message: 'OK',
      })

    const queued = await affectionStore.sendOrQueueAffection('heart_tap', 100_000)
    await affectionStore.flushOutbox()

    const itemsAfterFailure = await db.outbox.toArray()
    expect(itemsAfterFailure).toHaveLength(1)
    expect(itemsAfterFailure[0].status).toBe('pending')
    expect(itemsAfterFailure[0].attempt_count).toBe(1)
    expect(itemsAfterFailure[0].client_mutation_id).toBe(queued.clientMutationId)
    expect(itemsAfterFailure[0].next_retry_at).toBeGreaterThan(Date.now())

    // Simular que vence la ventana de retry para reintentar
    await db.outbox.update(itemsAfterFailure[0].id, {
      next_retry_at: Date.now() - 10,
    })

    const synced = await affectionStore.flushOutbox()
    expect(synced).toBe(1)
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy.mock.calls[0][0].client_mutation_id).toBe(
      sendSpy.mock.calls[1][0].client_mutation_id
    )
    expect(await db.outbox.count()).toBe(0)
  })

  it('envía errores 4xx directamente a Dead-Letter Queue (failed_permanent) sin ciclar reintentos', async () => {
    const sendSpy = vi
      .spyOn(affectionApi, 'sendAffection')
      .mockRejectedValue(
        new AffectionApiError(
          'Debes tener una pareja vinculada activa para enviar un toque de afecto',
          403
        )
      )

    await affectionStore.sendOrQueueAffection('heart_tap', 200_000)
    await affectionStore.flushOutbox()

    const dlqItems = await db.outbox.toArray()
    expect(dlqItems).toHaveLength(1)
    expect(dlqItems[0].status).toBe('failed_permanent')
    expect(dlqItems[0].last_error).toContain('pareja vinculada activa')

    // Un siguiente flushOutbox NO debe volver a disparar mutaciones en DLQ
    const retryCount = await affectionStore.flushOutbox()
    expect(retryCount).toBe(0)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('evita envíos HTTP duplicados si flushOutbox se invoca concurrentemente', async () => {
    let resolveNetwork!: () => void
    const networkGate = new Promise<void>((res) => {
      resolveNetwork = res
    })

    const sendSpy = vi.spyOn(affectionApi, 'sendAffection').mockImplementation(async (input) => {
      await networkGate
      return {
        status: 'success',
        affection_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        client_mutation_id: input.client_mutation_id,
        event_type: input.event_type,
        created_at: new Date().toISOString(),
        message: 'OK',
      }
    })

    // Simular modo offline al encolar para controlar manualmente el disparo concurrente
    vi.stubGlobal('navigator', { onLine: false })
    await affectionStore.sendOrQueueAffection('heart_tap', 300_000)
    vi.unstubAllGlobals()

    const flush1 = affectionStore.flushOutbox()
    const flush2 = affectionStore.flushOutbox()

    resolveNetwork()
    const [count1, count2] = await Promise.all([flush1, flush2])

    expect(count1).toBe(1)
    expect(count2).toBe(1)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(await db.outbox.count()).toBe(0)
  })
})
