import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  ClaimTagInputSchema,
  PairCoupleInputSchema,
} from '../../../shared'
import { getDb } from '../../db'
import {
  authMiddleware,
  optionalAuthMiddleware,
  type AuthContextVariables,
  type OptionalAuthContextVariables,
} from '../auth/auth.middleware'
import { CoupleConflictError } from './couple.errors'
import { CoupleService } from './couple.service'

function getCoupleService(c: any): CoupleService {
  const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL
  const db = getDb(dbUrl)
  return new CoupleService(db)
}

export const coupleRouter = new Hono<{
  Bindings: { DATABASE_URL?: string; ENVIRONMENT?: string }
  Variables: AuthContextVariables & OptionalAuthContextVariables
}>()

// 1. GET /api/couple/resolve/:identifier (Autenticación opcional)
coupleRouter.get('/resolve/:identifier', optionalAuthMiddleware, async (c) => {
  const identifier = c.req.param('identifier')
  if (!identifier) {
    return c.json({ error: 'Identificador requerido' }, 400)
  }

  const user = c.get('user')
  const service = getCoupleService(c)

  const result = await service.resolveIdentifier(identifier, user?.id)
  return c.json(result, 200)
})

// 2. POST /api/couple/claim-tag (Auth obligatorio)
coupleRouter.post(
  '/claim-tag',
  authMiddleware,
  zValidator('json', ClaimTagInputSchema),
  async (c) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: 'No autenticado' }, 401)
    }

    const input = c.req.valid('json')
    const service = getCoupleService(c)

    try {
      await service.claimTag(user.id, input)
      return c.json(
        {
          status: 'success',
          message: 'Pulsera asignada exitosamente',
        },
        200
      )
    } catch (error: any) {
      return c.json(
        {
          error: error.message || 'Error al asignar la pulsera',
        },
        400
      )
    }
  }
)

// 3. POST /api/couple/pair (Auth obligatorio + Transacción Atómica con Idempotencia)
coupleRouter.post(
  '/pair',
  authMiddleware,
  zValidator('json', PairCoupleInputSchema),
  async (c) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: 'No autenticado' }, 401)
    }

    const input = c.req.valid('json')
    const service = getCoupleService(c)

    try {
      const response = await service.pairCouple(user.id, input)
      return c.json(response, 200)
    } catch (error: any) {
      if (error instanceof CoupleConflictError) {
        return c.json({ error: error.message }, 409)
      }
      return c.json(
        {
          error: error.message || 'Error al vincular pareja',
        },
        400
      )
    }
  }
)

// 4. GET /api/couple/current (Auth obligatorio)
coupleRouter.get('/current', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'No autenticado' }, 401)
  }

  const service = getCoupleService(c)
  const result = await service.getCurrentCouple(user.id)
  return c.json(result, 200)
})

// 5. POST /api/couple/invite-code (Auth obligatorio)
coupleRouter.post('/invite-code', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'No autenticado' }, 401)
  }

  const service = getCoupleService(c)

  try {
    const result = await service.generateInviteCode(user.id)
    return c.json(result, 200)
  } catch (error: any) {
    if (error instanceof CoupleConflictError) {
      return c.json({ error: error.message }, 409)
    }
    return c.json(
      {
        error: error.message || 'Error al generar código de invitación',
      },
      400
    )
  }
})
