import {
  RealtimeBroadcastRequestSchema,
  SafeRealtimeEventSchema,
  type RealtimeBroadcastAudience,
  type SafeRealtimeEvent,
} from '../../../shared'

export const INTERNAL_USER_ID_HEADER = 'x-lazus-user-id'
export const INTERNAL_COUPLE_ID_HEADER = 'x-lazus-couple-id'
export const INTERNAL_ROOM_SCOPE_HEADER = 'x-lazus-room-scope'

export type CoupleRoomScope = 'couple' | 'user'

export interface CoupleSocketAttachment {
  userId: string
  coupleId: string | null
  roomScope: CoupleRoomScope
  connectedAt: string
}

export interface CoupleRoomRuntime {
  createWebSocketPair: () => { client: WebSocket; server: WebSocket }
  createUpgradeResponse: (client: WebSocket) => Response
  createAutoResponsePair?: (request: string, response: string) => WebSocketRequestResponsePair
  now?: () => Date
}

function createDefaultRuntime(): CoupleRoomRuntime {
  return {
    createWebSocketPair: () => {
      const pair = new WebSocketPair()
      return { client: pair[0], server: pair[1] }
    },
    createUpgradeResponse: (client: WebSocket) => {
      return new Response(null, { status: 101, webSocket: client })
    },
    createAutoResponsePair: (request: string, response: string) => {
      return new WebSocketRequestResponsePair(request, response)
    },
    now: () => new Date(),
  }
}

/**
 * Durable Object por pareja (1 instancia por couple_id).
 * Implementa obligatoriamente la WebSocket Hibernation API de Cloudflare ($0/mes):
 * - Sin estado en memoria (Maps): todo metadato vive en serializeAttachment().
 * - setWebSocketAutoResponse('ping', 'pong') evita despertar el DO en heartbeats.
 * - Solo emite eventos validados con SafeRealtimeEventSchema (Zero-Leak).
 */
export class CoupleDurableObject {
  private readonly ctx: DurableObjectState
  private readonly runtime: CoupleRoomRuntime

  constructor(ctx: DurableObjectState, _env: unknown, runtime?: CoupleRoomRuntime) {
    this.ctx = ctx
    this.runtime = runtime ?? createDefaultRuntime()

    if (typeof this.ctx.setWebSocketAutoResponse === 'function') {
      const pair =
        this.runtime.createAutoResponsePair && typeof WebSocketRequestResponsePair !== 'undefined'
          ? this.runtime.createAutoResponsePair('ping', 'pong')
          : runtime?.createAutoResponsePair
            ? runtime.createAutoResponsePair('ping', 'pong')
            : null
      if (pair) {
        this.ctx.setWebSocketAutoResponse(pair)
      }
    }
  }

  private nowIso(): string {
    return (this.runtime.now ? this.runtime.now() : new Date()).toISOString()
  }

  private readAttachment(ws: WebSocket): CoupleSocketAttachment | null {
    try {
      const raw = ws.deserializeAttachment() as Partial<CoupleSocketAttachment> | null | undefined
      if (raw && typeof raw.userId === 'string') {
        const roomScope: CoupleRoomScope = raw.roomScope === 'user' ? 'user' : 'couple'
        const coupleId = typeof raw.coupleId === 'string' ? raw.coupleId : null
        if (roomScope === 'couple' && !coupleId) {
          return null
        }
        return {
          userId: raw.userId,
          coupleId,
          roomScope,
          connectedAt: typeof raw.connectedAt === 'string' ? raw.connectedAt : this.nowIso(),
        }
      }
    } catch {
      // Attachment ausente o corrupto
    }
    return null
  }

  private sendSafeEvent(ws: WebSocket, event: SafeRealtimeEvent): boolean {
    const parsed = SafeRealtimeEventSchema.safeParse(event)
    if (!parsed.success) {
      return false
    }
    try {
      ws.send(JSON.stringify(parsed.data))
      return true
    } catch {
      return false
    }
  }

  private deliverEvent(
    event: SafeRealtimeEvent,
    audience: RealtimeBroadcastAudience,
    excludeUserId?: string
  ): number {
    const sockets = this.ctx.getWebSockets()
    let delivered = 0

    for (const ws of sockets) {
      const attachment = this.readAttachment(ws)
      if (!attachment) continue

      if (audience === 'partner_only' && excludeUserId && attachment.userId === excludeUserId) {
        continue
      }

      if (this.sendSafeEvent(ws, event)) {
        delivered += 1
      }
    }

    return delivered
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/connect') {
      return this.handleConnect(request)
    }

    if (request.method === 'POST' && url.pathname === '/broadcast') {
      return this.handleBroadcast(request)
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private handleConnect(request: Request): Response {
    const upgradeHeader = request.headers.get('Upgrade')
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response(JSON.stringify({ error: 'Expected Upgrade: websocket' }), {
        status: 426,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const roomScope: CoupleRoomScope =
      request.headers.get(INTERNAL_ROOM_SCOPE_HEADER) === 'user' ? 'user' : 'couple'
    const userId = request.headers.get(INTERNAL_USER_ID_HEADER)
    const coupleId = request.headers.get(INTERNAL_COUPLE_ID_HEADER)

    if (!userId || (roomScope === 'couple' && !coupleId)) {
      return new Response(JSON.stringify({ error: 'Missing couple room identity headers' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const now = this.nowIso()

    if (roomScope === 'user') {
      const { client, server } = this.runtime.createWebSocketPair()
      this.ctx.acceptWebSocket(server, [userId])
      const attachment: CoupleSocketAttachment = {
        userId,
        coupleId: null,
        roomScope: 'user',
        connectedAt: now,
      }
      server.serializeAttachment(attachment)
      return this.runtime.createUpgradeResponse(client)
    }

    const existingSockets = this.ctx.getWebSockets()
    let hadOwnSocket = false
    const connectedPartnerIds = new Set<string>()

    for (const existing of existingSockets) {
      const att = this.readAttachment(existing)
      if (!att) continue
      if (att.userId === userId) {
        hadOwnSocket = true
      } else {
        connectedPartnerIds.add(att.userId)
      }
    }

    const { client, server } = this.runtime.createWebSocketPair()
    this.ctx.acceptWebSocket(server, [userId])

    const attachment: CoupleSocketAttachment = {
      userId,
      coupleId,
      roomScope: 'couple',
      connectedAt: now,
    }
    server.serializeAttachment(attachment)

    // Informar inmediatamente al recién conectado si su pareja ya está en línea
    for (const partnerId of connectedPartnerIds) {
      this.sendSafeEvent(server, {
        type: 'partner_online',
        userId: partnerId,
        timestamp: now,
      })
    }

    // Notificar a la pareja solo en la primera pestaña/dispositivo activo de este usuario
    if (!hadOwnSocket) {
      const onlineEvent: SafeRealtimeEvent = {
        type: 'partner_online',
        userId,
        timestamp: now,
      }
      for (const existing of existingSockets) {
        const att = this.readAttachment(existing)
        if (!att || att.userId === userId) continue
        this.sendSafeEvent(existing, onlineEvent)
      }
    }

    return this.runtime.createUpgradeResponse(client)
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const parsed = RealtimeBroadcastRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid realtime broadcast payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const delivered = this.deliverEvent(
      parsed.data.event,
      parsed.data.audience,
      parsed.data.excludeUserId
    )

    // Autolimpieza de sala de espera temporal al completarse el emparejamiento (0 bytes residuales)
    if (parsed.data.event.type === 'couple_paired') {
      for (const ws of this.ctx.getWebSockets()) {
        const att = this.readAttachment(ws)
        if (att?.roomScope === 'user') {
          try {
            ws.close(1000, 'Couple paired')
          } catch {
            // Ya cerrado
          }
        }
      }
      try {
        await this.ctx.storage?.deleteAll?.()
      } catch {
        // Storage opcional en tests unitarios
      }
    }

    return new Response(JSON.stringify({ delivered }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Heartbeat fallback si el runtime no manejó auto-response antes de despertar
    if (message === 'ping') {
      try {
        ws.send('pong')
      } catch {
        // Socket ya cerrado
      }
    }
    // Cualquier otro mensaje del cliente se ignora: el canal es server-push autoritativo.
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    this.handleSocketDisconnect(ws, code)
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.handleSocketDisconnect(ws, 1011)
  }

  private handleSocketDisconnect(ws: WebSocket, code: number): void {
    const attachment = this.readAttachment(ws)

    try {
      const safeCode = code === 1005 || code === 1006 || code < 1000 ? 1000 : code
      ws.close(safeCode, 'Closed')
    } catch {
      // Ya cerrado
    }

    if (!attachment || attachment.roomScope === 'user') return

    const remainingSockets = this.ctx.getWebSockets().filter((candidate) => candidate !== ws)
    const stillHasOwnSocket = remainingSockets.some((candidate) => {
      const att = this.readAttachment(candidate)
      return att?.userId === attachment.userId
    })

    if (stillHasOwnSocket) {
      return
    }

    const offlineEvent: SafeRealtimeEvent = {
      type: 'partner_offline',
      userId: attachment.userId,
      timestamp: this.nowIso(),
    }

    for (const candidate of remainingSockets) {
      const att = this.readAttachment(candidate)
      if (!att || att.userId === attachment.userId) continue
      this.sendSafeEvent(candidate, offlineEvent)
    }
  }
}
