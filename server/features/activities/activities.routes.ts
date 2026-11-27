import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { SubmitActivityInputSchema } from '../../../shared'
import { getDb, type DbClient } from '../../db'
import { authMiddleware, type AuthContextVariables } from '../auth/auth.middleware'
import {
  createNotificationsService,
  type VapidEnvBindings,
} from '../notifications/notifications.service'
import { createRealtimePublisher, dispatchRealtimeTask } from '../realtime/realtime.publisher'
import {
  ActivityForbiddenError,
  ActivityImmutableConflictError,
  ActivityNotFoundError,
  ActivityValidationError,
} from './activities.errors'
import { ActivitiesService } from './activities.service'

function getActivitiesService(c: any): ActivitiesService {
  const db: DbClient = c.get('db') || getDb(c.env?.DATABASE_URL || process.env.DATABASE_URL)
  const publisher = createRealtimePublisher(c.env?.COUPLE_ROOM)
  const pushNotifier = createNotificationsService(db, c.env)
  return new ActivitiesService(
    db,
    () => new Date(),
    fetch,
    publisher,
    (task) => dispatchRealtimeTask(c, task),
    pushNotifier
  )
}

function mapActivityError(c: any, error: unknown) {
  if (error instanceof ActivityForbiddenError) {
    return c.json({ error: error.message }, 403)
  }
  if (error instanceof ActivityNotFoundError) {
    return c.json({ error: error.message }, 404)
  }
  if (error instanceof ActivityImmutableConflictError) {
    return c.json({ error: error.message }, 409)
  }
  if (error instanceof ActivityValidationError) {
    return c.json({ error: error.message }, 400)
  }
  throw error
}

export const activitiesRouter = new Hono<{
  Bindings: VapidEnvBindings & {
    DATABASE_URL?: string
    ENVIRONMENT?: string
    COUPLE_ROOM?: DurableObjectNamespace
  }
  Variables: AuthContextVariables & { db: DbClient }
}>()

// 1. GET /api/activities/today — Obtiene o inicializa la actividad diaria (Zero-Leak)
activitiesRouter.get('/today', authMiddleware, async (c) => {
  const user = c.get('user')
  const service = getActivitiesService(c)

  try {
    const result = await service.getOrCreateTodayActivity(user.id)
    return c.json(result, 200)
  } catch (error) {
    return mapActivityError(c, error)
  }
})

// 2. GET /api/activities/history — Historial de actividades reveladas de la pareja
activitiesRouter.get('/history', authMiddleware, async (c) => {
  const user = c.get('user')
  const service = getActivitiesService(c)

  try {
    const result = await service.getHistory(user.id)
    return c.json(result, 200)
  } catch (error) {
    return mapActivityError(c, error)
  }
})

// 3. GET /api/activities/music/search?q=... — Buscador musical vía iTunes Search API
activitiesRouter.get('/music/search', authMiddleware, async (c) => {
  const q = c.req.query('q') || ''
  const service = getActivitiesService(c)

  try {
    const result = await service.searchMusic(q)
    return c.json(result, 200)
  } catch {
    return c.json({ error: 'No se pudo realizar la búsqueda musical' }, 502)
  }
})

// 4. GET /api/activities/:id/results — Resultados completos (solo si status === 'revealed')
activitiesRouter.get('/:id/results', authMiddleware, async (c) => {
  const user = c.get('user')
  const activityId = c.req.param('id') || ''
  const service = getActivitiesService(c)

  try {
    const result = await service.getActivityResults(user.id, activityId)
    return c.json(result, 200)
  } catch (error) {
    return mapActivityError(c, error)
  }
})

// 5. POST /api/activities/:id/submissions — Sellar respuesta diaria (Idempotente + Blind Reveal)
activitiesRouter.post(
  '/:id/submissions',
  authMiddleware,
  zValidator('json', SubmitActivityInputSchema),
  async (c) => {
    const user = c.get('user')
    const activityId = c.req.param('id') || inputActivityFallback(c)
    const input = c.req.valid('json')
    const service = getActivitiesService(c)

    try {
      const result = await service.submitActivity(user.id, activityId || input.activity_id, input)
      return c.json(result, 200)
    } catch (error) {
      return mapActivityError(c, error)
    }
  }
)

function inputActivityFallback(_c: any): string {
  return ''
}

// Alias de compatibilidad: POST /api/activities/submissions (usando input.activity_id)
activitiesRouter.post(
  '/submissions',
  authMiddleware,
  zValidator('json', SubmitActivityInputSchema),
  async (c) => {
    const user = c.get('user')
    const input = c.req.valid('json')
    const service = getActivitiesService(c)

    try {
      const result = await service.submitActivity(user.id, input.activity_id, input)
      return c.json(result, 200)
    } catch (error) {
      return mapActivityError(c, error)
    }
  }
)
