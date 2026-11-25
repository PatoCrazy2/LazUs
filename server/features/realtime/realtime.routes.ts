import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb, type DbClient } from '../../db'
import { coupleMembers, couples } from '../../db/schema'
import { authMiddleware, type AuthContextVariables } from '../auth/auth.middleware'
import { INTERNAL_COUPLE_ID_HEADER, INTERNAL_USER_ID_HEADER } from './couple.durable-object'

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
 * Punto de entrada autenticado al Durable Object de la pareja.
 * Regla de autoridad: el couple_id SIEMPRE se resuelve en PostgreSQL a partir
 * de la sesión verificada, nunca desde parámetros enviados por el cliente.
 */
realtimeRouter.get('/ws', authMiddleware, async (c) => {
  const user = c.get('user')
  const db: DbClient = c.get('db') || getDb(c.env?.DATABASE_URL || process.env.DATABASE_URL)

  const [membership] = await db
    .select({
      coupleId: couples.id,
      status: couples.status,
    })
    .from(coupleMembers)
    .innerJoin(couples, eq(coupleMembers.coupleId, couples.id))
    .where(and(eq(coupleMembers.userId, user.id), eq(couples.status, 'active')))
    .limit(1)

  if (!membership) {
    return c.json(
      { error: 'Debes tener una pareja vinculada activa para conectarte en tiempo real' },
      403
    )
  }

  const upgradeHeader = c.req.header('upgrade')
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Se requiere cabecera Upgrade: websocket' }, 426)
  }

  const namespace = c.env?.COUPLE_ROOM
  if (!namespace) {
    return c.json({ error: 'Servicio de tiempo real no disponible en este entorno' }, 503)
  }

  const forwardHeaders = new Headers()
  for (const headerName of ALLOWED_WS_FORWARD_HEADERS) {
    const value = c.req.header(headerName)
    if (value) {
      forwardHeaders.set(headerName, value)
    }
  }
  forwardHeaders.set(INTERNAL_USER_ID_HEADER, user.id)
  forwardHeaders.set(INTERNAL_COUPLE_ID_HEADER, membership.coupleId)

  const id = namespace.idFromName(membership.coupleId)
  const stub = namespace.get(id)
  const doRequest = new Request('https://couple-room/connect', {
    method: 'GET',
    headers: forwardHeaders,
  })

  return stub.fetch(doRequest)
})
