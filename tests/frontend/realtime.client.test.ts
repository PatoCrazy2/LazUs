import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SafeRealtimeEvent } from '../../shared'
import {
  CoupleRealtimeClient,
  type RealtimeConnectionStatus,
  type WebSocketLike,
} from '../../src/features/realtime/realtime.client'
import {
  AFFECTION_VIBRATION_PATTERN,
  handleRealtimeDomainEvent,
  PAIRING_VIBRATION_PATTERN,
} from '../../src/features/realtime/realtime.context'

class FakeBrowserWebSocket implements WebSocketLike {
  readyState = 0
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  sent: string[] = []
  closed = false

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.readyState = 3
  }

  simulateOpen(): void {
    this.readyState = 1
    this.onopen?.({})
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data })
  }

  simulateClose(): void {
    this.readyState = 3
    this.onclose?.({})
  }
}

describe('CoupleRealtimeClient & Domain Event Handlers - Fase 3', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('1. Conecta, envía heartbeat ping cada 25s, valida eventos seguros y descarta payloads secretos', () => {
    const sockets: FakeBrowserWebSocket[] = []
    const events: SafeRealtimeEvent[] = []
    const statuses: RealtimeConnectionStatus[] = []

    const client = new CoupleRealtimeClient({
      url: 'wss://lazus.test/api/realtime/ws',
      onEvent: (e) => events.push(e),
      onStatusChange: (s) => statuses.push(s),
      heartbeatIntervalMs: 25_000,
      createWebSocket: () => {
        const ws = new FakeBrowserWebSocket()
        sockets.push(ws)
        return ws
      },
      isOnline: () => true,
      getVisibilityState: () => 'visible',
      addWindowListener: () => {},
      removeWindowListener: () => {},
      addDocumentListener: () => {},
      removeDocumentListener: () => {},
    })

    client.start()
    expect(statuses).toEqual(['connecting'])
    expect(sockets).toHaveLength(1)

    sockets[0].simulateOpen()
    expect(statuses).toEqual(['connecting', 'connected'])

    // Heartbeat ping tras 25s y respuesta pong ignorada
    vi.advanceTimersByTime(25_000)
    expect(sockets[0].sent).toEqual(['ping'])
    sockets[0].simulateMessage('pong')
    expect(events).toHaveLength(0)

    // Evento válido aceptado
    const validEvent: SafeRealtimeEvent = {
      type: 'partner_submission_completed',
      activityId: '44444444-4444-4444-8444-444444444444',
      timestamp: '2026-11-25T19:00:00.000Z',
    }
    sockets[0].simulateMessage(JSON.stringify(validEvent))
    expect(events).toEqual([validEvent])

    // Evento con campo secreto (Zero-Leak) descartado silenciosamente
    sockets[0].simulateMessage(
      JSON.stringify({
        ...validEvent,
        content: 'secreto prohibido',
      })
    )
    sockets[0].simulateMessage('not-json')
    expect(events).toHaveLength(1)

    client.stop()
  })

  it('2. Reconecta automáticamente con backoff exponencial al cerrarse el socket', () => {
    const sockets: FakeBrowserWebSocket[] = []
    const statuses: RealtimeConnectionStatus[] = []

    const client = new CoupleRealtimeClient({
      url: 'wss://lazus.test/api/realtime/ws',
      onEvent: () => {},
      onStatusChange: (s) => statuses.push(s),
      baseReconnectDelayMs: 1_000,
      maxReconnectDelayMs: 10_000,
      random: () => 0.5, // jitterFactor = 1.0 determinístico
      createWebSocket: () => {
        const ws = new FakeBrowserWebSocket()
        sockets.push(ws)
        return ws
      },
      isOnline: () => true,
      getVisibilityState: () => 'visible',
      addWindowListener: () => {},
      removeWindowListener: () => {},
      addDocumentListener: () => {},
      removeDocumentListener: () => {},
    })

    client.start()
    sockets[0].simulateOpen()
    sockets[0].simulateClose()

    // Primer reintento a 1000ms
    vi.advanceTimersByTime(999)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)

    // Segundo fallo -> backoff 2000ms
    sockets[1].simulateClose()
    vi.advanceTimersByTime(1_999)
    expect(sockets).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(3)

    client.stop()
  })

  it('3. Reconcilia con ping o reconexión inmediata al dispararse visibilitychange y online', () => {
    const sockets: FakeBrowserWebSocket[] = []
    let online = true
    let visibility: DocumentVisibilityState = 'visible'
    const windowListeners = new Map<string, () => void>()
    const documentListeners = new Map<string, () => void>()

    const client = new CoupleRealtimeClient({
      url: 'wss://lazus.test/api/realtime/ws',
      onEvent: () => {},
      baseReconnectDelayMs: 10_000,
      random: () => 0.5,
      createWebSocket: () => {
        const ws = new FakeBrowserWebSocket()
        sockets.push(ws)
        return ws
      },
      isOnline: () => online,
      getVisibilityState: () => visibility,
      addWindowListener: (type, fn) => windowListeners.set(type, fn),
      removeWindowListener: (type) => windowListeners.delete(type),
      addDocumentListener: (type, fn) => documentListeners.set(type, fn),
      removeDocumentListener: (type) => documentListeners.delete(type),
    })

    client.start()
    sockets[0].simulateOpen()

    // Volver de segundo plano con socket abierto -> envía ping inmediato
    visibility = 'hidden'
    documentListeners.get('visibilitychange')?.()
    expect(sockets[0].sent).toHaveLength(0)

    visibility = 'visible'
    documentListeners.get('visibilitychange')?.()
    expect(sockets[0].sent).toEqual(['ping'])

    // Caída offline -> no reconecta hasta que vuelva online
    online = false
    windowListeners.get('offline')?.()
    sockets[0].simulateClose()
    vi.advanceTimersByTime(30_000)
    expect(sockets).toHaveLength(1)

    // Recupera red -> reconexión inmediata
    online = true
    windowListeners.get('online')?.()
    expect(sockets).toHaveLength(2)

    // Cierre mientras está en segundo plano -> reconexión inmediata al volver a visible
    sockets[1].simulateClose()
    visibility = 'visible'
    documentListeners.get('visibilitychange')?.()
    expect(sockets).toHaveLength(3)

    client.stop()
  })

  it('4. handleRealtimeDomainEvent invalida TanStack Query, actualiza presencia y dispara vibración háptica', () => {
    const setPartnerOnline = vi.fn()
    const invalidateTodayActivity = vi.fn()
    const invalidateActivityHistory = vi.fn()
    const triggerAffection = vi.fn()
    const vibrate = vi.fn()

    const handlers = {
      setPartnerOnline,
      invalidateTodayActivity,
      invalidateActivityHistory,
      triggerAffection,
      vibrate,
    }

    const userId = '22222222-2222-4222-8222-222222222222'
    const activityId = '44444444-4444-4444-8444-444444444444'
    const ts = '2026-11-25T19:00:00.000Z'

    handleRealtimeDomainEvent({ type: 'partner_online', userId, timestamp: ts }, handlers)
    expect(setPartnerOnline).toHaveBeenLastCalledWith(true)

    handleRealtimeDomainEvent({ type: 'partner_offline', userId, timestamp: ts }, handlers)
    expect(setPartnerOnline).toHaveBeenLastCalledWith(false)

    handleRealtimeDomainEvent(
      { type: 'partner_submission_completed', activityId, timestamp: ts },
      handlers
    )
    expect(invalidateTodayActivity).toHaveBeenCalledTimes(1)
    expect(invalidateActivityHistory).not.toHaveBeenCalled()

    handleRealtimeDomainEvent(
      { type: 'activity_ready_to_reveal', activityId, timestamp: ts },
      handlers
    )
    expect(invalidateTodayActivity).toHaveBeenCalledTimes(2)
    expect(invalidateActivityHistory).toHaveBeenCalledTimes(1)

    handleRealtimeDomainEvent(
      { type: 'affection_received', senderUserId: userId, eventType: 'heart_tap', timestamp: ts },
      handlers
    )
    expect(vibrate).toHaveBeenCalledWith(AFFECTION_VIBRATION_PATTERN)
    expect(triggerAffection).toHaveBeenCalledWith('heart_tap')
  })

  it('5. handleRealtimeDomainEvent reacciona a couple_paired invalidando pareja/actividad y disparando celebración háptica', () => {
    const invalidateTodayActivity = vi.fn()
    const invalidateCoupleState = vi.fn()
    const triggerPairingCelebration = vi.fn()
    const vibrate = vi.fn()

    const coupleId = '11111111-1111-4111-8111-111111111111'
    const ts = '2026-11-25T19:05:00.000Z'

    handleRealtimeDomainEvent(
      {
        type: 'couple_paired',
        coupleId,
        partnerDisplayName: 'Emilio',
        timestamp: ts,
      },
      {
        setPartnerOnline: vi.fn(),
        invalidateTodayActivity,
        invalidateActivityHistory: vi.fn(),
        invalidateCoupleState,
        triggerAffection: vi.fn(),
        triggerPairingCelebration,
        vibrate,
      }
    )

    expect(vibrate).toHaveBeenCalledWith(PAIRING_VIBRATION_PATTERN)
    expect(invalidateCoupleState).toHaveBeenCalledTimes(1)
    expect(invalidateTodayActivity).toHaveBeenCalledTimes(1)
    expect(triggerPairingCelebration).toHaveBeenCalledWith(coupleId, 'Emilio')
  })
})
