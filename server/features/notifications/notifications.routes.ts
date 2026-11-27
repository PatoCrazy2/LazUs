import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  PushSubscriptionInputSchema,
  TestPushInputSchema,
  UnsubscribePushInputSchema,
} from '../../../shared'
import { getDb, type DbClient } from '../../db'
import { authMiddleware, type AuthContextVariables } from '../auth/auth.middleware'
import { dispatchRealtimeTask } from '../realtime/realtime.publisher'
import {
  createNotificationsService,
  NotificationNotFoundError,
  type VapidEnvBindings,
} from './notifications.service'

export const notificationsRouter = new Hono<{
  Bindings: VapidEnvBindings & {
    DATABASE_URL?: string
    ENVIRONMENT?: string
  }
  Variables: AuthContextVariables & { db: DbClient }
}>()

function getNotificationsService(c: any) {
  const db: DbClient = c.get('db') || getDb(c.env?.DATABASE_URL || process.env.DATABASE_URL)
  return createNotificationsService(db, c.env)
}

// GET /api/notifications/vapid-public-key
notificationsRouter.get('/vapid-public-key', authMiddleware, (c) => {
  const service = getNotificationsService(c)
  return c.json(service.getPublicKeyConfig(), 200)
})

// GET /api/notifications/status?endpoint=...
notificationsRouter.get('/status', authMiddleware, async (c) => {
  const user = c.get('user')
  const endpoint = c.req.query('endpoint') || undefined
  const service = getNotificationsService(c)

  const status = await service.getStatus(user.id, endpoint)
  return c.json(status, 200)
})

// POST /api/notifications/subscribe
notificationsRouter.post(
  '/subscribe',
  authMiddleware,
  zValidator('json', PushSubscriptionInputSchema),
  async (c) => {
    const user = c.get('user')
    const input = c.req.valid('json')
    const service = getNotificationsService(c)

    const result = await service.subscribe(user.id, input)
    return c.json(result, 200)
  }
)

// DELETE /api/notifications/subscribe
notificationsRouter.delete(
  '/subscribe',
  authMiddleware,
  zValidator('json', UnsubscribePushInputSchema),
  async (c) => {
    const user = c.get('user')
    const input = c.req.valid('json')
    const service = getNotificationsService(c)

    const result = await service.unsubscribe(user.id, input.endpoint)
    return c.json(result, 200)
  }
)

// POST /api/notifications/test
notificationsRouter.post(
  '/test',
  authMiddleware,
  zValidator('json', TestPushInputSchema),
  async (c) => {
    const user = c.get('user')
    const input = c.req.valid('json')
    const service = getNotificationsService(c)

    try {
      const { response, task } = await service.prepareTestPush(user.id, input)
      if (task) {
        await dispatchRealtimeTask(c, task)
      }
      return c.json(response, 200)
    } catch (error) {
      if (error instanceof NotificationNotFoundError) {
        return c.json({ error: error.message }, 404)
      }
      throw error
    }
  }
)
