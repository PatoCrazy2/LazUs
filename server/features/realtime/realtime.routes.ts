import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb, type DbClient } from '../../db'
import { coupleMembers, couples } from '../../db/schema'
import { authMiddleware, type AuthContextVariables } from '../auth/auth.middleware'
import {
  INTERNAL_COUPLE_ID_HEADER,
  INTERNAL_ROOM_SCOPE_HEADER,
  INTERNAL_USER_ID_HEADER,
} from './couple.durable-object'
import { getUserWaitingRoomKey } from './realtime.publisher'

const ALLOWED_WS_FORWARD_HEADERS = [
  'upgrade',
  'connection',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-protocol',
  'sec-websocket-extensions',
] as const

export const realtimeRouter = new Hono<{
  Bindings: {
    DATABASE_URL?: string
    ENVIRONMENT?: string
    COUPLE_ROOM?: DurableObjectNamespace
  }
  Variables: AuthContextVariables & { db: DbClient }
}>()

/**
 * GET /api/realtime/ws
 * Punto de entrada autenticado al Durable Object:
 * - Si el usuario tiene pareja activa en PostgreSQL -> enruta a idFromName(coupleId) (scope: 'couple').
 * - Si aún no tiene pareja activa -> enruta a su sala de espera hibernada user:<userId> (scope: 'user')
 *   para recibir 'couple_paired' al instante sin polling contra PostgreSQL.
 */
realtimeRouter.get('/ws', authMiddleware, async (c) => {
  const user = c.get('user')
  const db: DbClient = c.get('db') || getDb(c.env?.DATABASE_URL || process.env.DATABASE_URL)

  const upgradeHeader = c.req.header('upgrade')
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Se requiere cabecera Upgrade: websocket' }, 426)
  }

  const namespace = c.env?.COUPLE_ROOM
  if (!namespace) {
    return c.json({ error: 'Servicio de tiempo real no disponible en este entorno' }, 503)
  }

  const [membership] = await db
    .select({
      coupleId: couples.id,
      status: couples.status,
    })
    .from(coupleMembers)
    .innerJoin(couples, eq(coupleMembers.coupleId, couples.id))
    .where(and(eq(coupleMembers.userId, user.id), eq(couples.status, 'active')))
    .limit(1)

  const forwardHeaders = new Headers()
  for (const headerName of ALLOWED_WS_FORWARD_HEADERS) {
    const value = c.req.header(headerName)
    if (value) {
      forwardHeaders.set(headerName, value)
    }
  }
  forwardHeaders.set(INTERNAL_USER_ID_HEADER, user.id)

  let roomKey: string
  if (membership) {
    roomKey = membership.coupleId
    forwardHeaders.set(INTERNAL_ROOM_SCOPE_HEADER, 'couple')
    forwardHeaders.set(INTERNAL_COUPLE_ID_HEADER, membership.coupleId)
  } else {
    roomKey = getUserWaitingRoomKey(user.id)
    forwardHeaders.set(INTERNAL_ROOM_SCOPE_HEADER, 'user')
  }

  const id = namespace.idFromName(roomKey)
  const stub = namespace.get(id)
  const doRequest = new Request('https://couple-room/connect', {
    method: 'GET',
    headers: forwardHeaders,
  })

  return stub.fetch(doRequest)
})
