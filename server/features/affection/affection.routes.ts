import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { SendAffectionInputSchema } from '../../../shared'
import { getDb, type DbClient } from '../../db'
import { affectionEvents, coupleMembers, couples, idempotencyKeys } from '../../db/schema'
import { authMiddleware, type AuthContextVariables } from '../auth/auth.middleware'
import {
  createNotificationsService,
  type VapidEnvBindings,
} from '../notifications/notifications.service'
import { createRealtimePublisher, dispatchRealtimeTask } from '../realtime/realtime.publisher'

export const affectionRouter = new Hono<{
  Bindings: VapidEnvBindings & {
    DATABASE_URL?: string
    ENVIRONMENT?: string
    COUPLE_ROOM?: DurableObjectNamespace
  }
  Variables: AuthContextVariables & { db: DbClient }
}>()

// POST /api/affection
// Toque de cariño originado por NFC o interacción rápida (Idempotente + Realtime)
affectionRouter.post(
  '/',
  authMiddleware,
  zValidator('json', SendAffectionInputSchema),
  async (c) => {
    const user = c.get('user')
    const data = c.req.valid('json')
    const db: DbClient = c.get('db') || getDb(c.env?.DATABASE_URL || process.env.DATABASE_URL)

    const [membership] = await db
      .select({
        coupleId: couples.id,
      })
      .from(coupleMembers)
      .innerJoin(couples, eq(coupleMembers.coupleId, couples.id))
      .where(and(eq(coupleMembers.userId, user.id), eq(couples.status, 'active')))
      .limit(1)

    if (!membership) {
      return c.json(
        { error: 'Debes tener una pareja vinculada activa para enviar un toque de afecto' },
        403
      )
    }

    const txResult = await db.transaction(async (tx) => {
      const [existingKey] = await tx
        .select({
          responseBody: idempotencyKeys.responseBody,
        })
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, data.client_mutation_id),
            eq(idempotencyKeys.userId, user.id)
          )
        )
        .limit(1)

      if (existingKey) {
        return {
          isReplay: true,
          responseBody: existingKey.responseBody as Record<string, unknown>,
        }
      }

      const [inserted] = await tx
        .insert(affectionEvents)
        .values({
          coupleId: membership.coupleId,
          senderUserId: user.id,
          eventType: data.event_type,
        })
        .returning({
          id: affectionEvents.id,
          createdAt: affectionEvents.createdAt,
        })

      const responseBody = {
        status: 'success',
        affection_id: inserted.id,
        client_mutation_id: data.client_mutation_id,
        event_type: data.event_type,
        created_at: inserted.createdAt.toISOString(),
        message: 'Toque de afecto registrado.',
      }

      await tx.insert(idempotencyKeys).values({
        key: data.client_mutation_id,
        userId: user.id,
        operationType: 'SEND_AFFECTION',
        responseCode: 200,
        responseBody,
      })

      return {
        isReplay: false,
        responseBody,
        createdAt: inserted.createdAt.toISOString(),
      }
    })

    if (!txResult.isReplay) {
      const publisher = createRealtimePublisher(c.env?.COUPLE_ROOM)
      const notificationsService = createNotificationsService(db, c.env)
      await dispatchRealtimeTask(
        c,
        Promise.allSettled([
          publisher.publish({
            coupleId: membership.coupleId,
            audience: 'partner_only',
            excludeUserId: user.id,
            event: {
              type: 'affection_received',
              senderUserId: user.id,
              eventType: data.event_type,
              timestamp: txResult.createdAt ?? new Date().toISOString(),
            },
          }),
          notificationsService.notifyPartnerAffection(membership.coupleId, user.id),
        ])
      )
    }

    return c.json(txResult.responseBody, 200)
  }
)
