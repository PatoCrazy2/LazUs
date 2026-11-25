import { describe, expect, it, vi } from 'vitest'
import {
  CoupleDurableObject,
  INTERNAL_COUPLE_ID_HEADER,
  INTERNAL_USER_ID_HEADER,
  type CoupleRoomRuntime,
} from '../../server/features/realtime/couple.durable-object'
import { createRealtimePublisher } from '../../server/features/realtime/realtime.publisher'

interface FakeSocket {
  sent: string[]
  closed: boolean
  closeCode?: number
  attachment: unknown
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
  send(data: string): void
  close(code?: number, reason?: string): void
}

function createFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    sent: [],
    closed: false,
    attachment: null,
    serializeAttachment(value: unknown) {
      socket.attachment = JSON.parse(JSON.stringify(value))
    },
    deserializeAttachment() {
      return socket.attachment
    },
    send(data: string) {
      if (socket.closed) {
        throw new Error('Socket closed')
      }
      socket.sent.push(data)
    },
    close(code?: number) {
      socket.closed = true
      socket.closeCode = code
    },
  }
  return socket
}

function createFakeHibernationState() {
  const acceptedSockets: Array<{ ws: FakeSocket; tags: string[] }> = []
  let autoResponsePair: { request: string; response: string } | null = null

  const state = {
    acceptWebSocket(ws: WebSocket, tags?: string[]) {
      acceptedSockets.push({ ws: ws as unknown as FakeSocket, tags: tags ?? [] })
    },
    getWebSockets(tag?: string): WebSocket[] {
      return acceptedSockets
        .filter((entry) => !entry.ws.closed && (!tag || entry.tags.includes(tag)))
        .map((entry) => entry.ws as unknown as WebSocket)
    },
    setWebSocketAutoResponse(pair: { request: string; response: string }) {
      autoResponsePair = pair
    },
  }

  return {
    state: state as unknown as DurableObjectState,
    acceptedSockets,
    getAutoResponsePair: () => autoResponsePair,
  }
}

function createTestRuntime(fixedNow = new Date('2026-11-25T18:00:00.000Z')) {
  const createdServers: FakeSocket[] = []

  const runtime: CoupleRoomRuntime = {
    createWebSocketPair: () => {
      const client = createFakeSocket()
      const server = createFakeSocket()
      createdServers.push(server)
      return {
        client: client as unknown as WebSocket,
        server: server as unknown as WebSocket,
      }
    },
    createUpgradeResponse: (client: WebSocket) => {
      const res = new Response(null, { status: 200 }) as Response & { webSocket?: WebSocket }
      res.webSocket = client
      return res
    },
    createAutoResponsePair: (request: string, response: string) =>
      ({ request, response }) as unknown as WebSocketRequestResponsePair,
    now: () => fixedNow,
  }

  return { runtime, createdServers }
}

function connectRequest(userId: string, coupleId: string) {
  return new Request('https://couple-room/connect', {
    method: 'GET',
    headers: {
      Upgrade: 'websocket',
      [INTERNAL_USER_ID_HEADER]: userId,
      [INTERNAL_COUPLE_ID_HEADER]: coupleId,
    },
  })
}

describe('CoupleDurableObject & RealtimePublisher - Fase 1 (Hibernation API & Zero-Leak)', () => {
  const coupleId = '11111111-1111-4111-8111-111111111111'
  const userA = '22222222-2222-4222-8222-222222222222'
  const userB = '33333333-3333-4333-8333-333333333333'
  const activityId = '44444444-4444-4444-8444-444444444444'

  it('1. Configura setWebSocketAutoResponse("ping", "pong") para hibernación $0/mes', () => {
    const fakeState = createFakeHibernationState()
    const { runtime } = createTestRuntime()

    new CoupleDurableObject(fakeState.state, {}, runtime)

    expect(fakeState.getAutoResponsePair()).toEqual({ request: 'ping', response: 'pong' })
  })

  it('2. Maneja presencia en vivo y multi-pestaña usando únicamente serializeAttachment', async () => {
    const fakeState = createFakeHibernationState()
    const { runtime, createdServers } = createTestRuntime()
    const room = new CoupleDurableObject(fakeState.state, {}, runtime)

    // Conecta A
    await room.fetch(connectRequest(userA, coupleId))
    const wsA = createdServers[0]
    expect(wsA.sent).toHaveLength(0)

    // Conecta B -> A recibe partner_online(B) y B recibe partner_online(A)
    await room.fetch(connectRequest(userB, coupleId))
    const wsB1 = createdServers[1]

    expect(wsA.sent.map((m) => JSON.parse(m))).toEqual([
      { type: 'partner_online', userId: userB, timestamp: '2026-11-25T18:00:00.000Z' },
    ])
    expect(wsB1.sent.map((m) => JSON.parse(m))).toEqual([
      { type: 'partner_online', userId: userA, timestamp: '2026-11-25T18:00:00.000Z' },
    ])

    // B abre segunda pestaña -> B2 recibe estado actual de A, pero A NO recibe online duplicado
    await room.fetch(connectRequest(userB, coupleId))
    const wsB2 = createdServers[2]
    expect(wsA.sent).toHaveLength(1)
    expect(wsB2.sent.map((m) => JSON.parse(m))).toEqual([
      { type: 'partner_online', userId: userA, timestamp: '2026-11-25T18:00:00.000Z' },
    ])

    // B cierra primera pestaña -> A NO recibe partner_offline porque wsB2 sigue activa
    await room.webSocketClose(wsB1 as unknown as WebSocket, 1000, 'bye', true)
    expect(wsA.sent).toHaveLength(1)

    // Simular despertar desde hibernación (nueva instancia del DO con el mismo DurableObjectState)
    const wokenRoom = new CoupleDurableObject(fakeState.state, {}, runtime)

    // B cierra última pestaña -> A recibe partner_offline(B)
    await wokenRoom.webSocketClose(wsB2 as unknown as WebSocket, 1000, 'bye', true)
    expect(wsA.sent.map((m) => JSON.parse(m))).toHaveLength(2)
    expect(JSON.parse(wsA.sent[1])).toEqual({
      type: 'partner_offline',
      userId: userB,
      timestamp: '2026-11-25T18:00:00.000Z',
    })
  })

  it('3. Filtra correctamente audiencia partner_only vs both en POST /broadcast', async () => {
    const fakeState = createFakeHibernationState()
    const { runtime, createdServers } = createTestRuntime()
    const room = new CoupleDurableObject(fakeState.state, {}, runtime)

    await room.fetch(connectRequest(userA, coupleId))
    await room.fetch(connectRequest(userB, coupleId))
    const wsA = createdServers[0]
    const wsB = createdServers[1]
    wsA.sent.length = 0
    wsB.sent.length = 0

    // partner_submission_completed: solo para B (excluir A)
    const resPartnerOnly = await room.fetch(
      new Request('https://couple-room/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: 'partner_only',
          excludeUserId: userA,
          event: {
            type: 'partner_submission_completed',
            activityId,
            timestamp: '2026-11-25T18:05:00.000Z',
          },
        }),
      })
    )
    expect(resPartnerOnly.status).toBe(200)
    expect(await resPartnerOnly.json()).toEqual({ delivered: 1 })
    expect(wsA.sent).toHaveLength(0)
    expect(wsB.sent.map((m) => JSON.parse(m))).toEqual([
      {
        type: 'partner_submission_completed',
        activityId,
        timestamp: '2026-11-25T18:05:00.000Z',
      },
    ])

    // activity_ready_to_reveal: para ambos
    const resBoth = await room.fetch(
      new Request('https://couple-room/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: 'both',
          event: {
            type: 'activity_ready_to_reveal',
            activityId,
            timestamp: '2026-11-25T18:06:00.000Z',
          },
        }),
      })
    )
    expect(resBoth.status).toBe(200)
    expect(await resBoth.json()).toEqual({ delivered: 2 })
    expect(wsA.sent).toHaveLength(1)
    expect(wsB.sent).toHaveLength(2)
  })

  it('4. Zero-Leak: rechaza con 400 cualquier broadcast que intente incluir campos secretos', async () => {
    const fakeState = createFakeHibernationState()
    const { runtime, createdServers } = createTestRuntime()
    const room = new CoupleDurableObject(fakeState.state, {}, runtime)

    await room.fetch(connectRequest(userA, coupleId))
    const wsA = createdServers[0]
    wsA.sent.length = 0

    const res = await room.fetch(
      new Request('https://couple-room/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: 'both',
          event: {
            type: 'partner_submission_completed',
            activityId,
            timestamp: '2026-11-25T18:05:00.000Z',
            content: 'Respuesta secreta que NUNCA debe viajar por WS',
          },
        }),
      })
    )

    expect(res.status).toBe(400)
    expect(wsA.sent).toHaveLength(0)
  })

  it('5. webSocketMessage responde pong a ping e ignora payloads arbitrarios del cliente', async () => {
    const fakeState = createFakeHibernationState()
    const { runtime, createdServers } = createTestRuntime()
    const room = new CoupleDurableObject(fakeState.state, {}, runtime)

    await room.fetch(connectRequest(userA, coupleId))
    await room.fetch(connectRequest(userB, coupleId))
    const wsA = createdServers[0]
    const wsB = createdServers[1]
    wsA.sent.length = 0
    wsB.sent.length = 0

    await room.webSocketMessage(wsA as unknown as WebSocket, 'ping')
    expect(wsA.sent).toEqual(['pong'])
    expect(wsB.sent).toHaveLength(0)

    await room.webSocketMessage(
      wsA as unknown as WebSocket,
      JSON.stringify({ type: 'activity_ready_to_reveal', activityId })
    )
    expect(wsA.sent).toEqual(['pong'])
    expect(wsB.sent).toHaveLength(0)
  })

  it('6. RealtimePublisher valida Zero-Leak, enruta por coupleId y degrada sin errores si falta binding', async () => {
    const noopPublisher = createRealtimePublisher(undefined)
    const noopOk = await noopPublisher.publish({
      coupleId,
      event: {
        type: 'partner_submission_completed',
        activityId,
        timestamp: '2026-11-25T18:05:00.000Z',
      },
    })
    expect(noopOk).toBe(false)

    const stubFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ delivered: 1 }), { status: 200 }))
    const idFromName = vi.fn().mockReturnValue('do-id-1')
    const get = vi.fn().mockReturnValue({ fetch: stubFetch })
    const fakeNamespace = { idFromName, get } as unknown as DurableObjectNamespace

    const publisher = createRealtimePublisher(fakeNamespace)

    // Rechaza evento con propiedad secreta antes de invocar al DO
    const rejected = await publisher.publish({
      coupleId,
      event: {
        type: 'partner_submission_completed',
        activityId,
        timestamp: '2026-11-25T18:05:00.000Z',
        payload: { secret: true },
      } as any,
    })
    expect(rejected).toBe(false)
    expect(stubFetch).not.toHaveBeenCalled()

    // Acepta evento seguro
    const accepted = await publisher.publish({
      coupleId,
      audience: 'partner_only',
      excludeUserId: userA,
      event: {
        type: 'affection_received',
        senderUserId: userA,
        eventType: 'heart_tap',
        timestamp: '2026-11-25T18:07:00.000Z',
      },
    })
    expect(accepted).toBe(true)
    expect(idFromName).toHaveBeenCalledWith(coupleId)
    expect(stubFetch).toHaveBeenCalledTimes(1)
  })
})
