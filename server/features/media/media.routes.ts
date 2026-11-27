import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  RequestUploadUrlInputSchema,
  RequestViewUrlInputSchema,
  SaveRenderedCollageInputSchema,
} from '../../../shared'
import { getDb, type DbClient } from '../../db'
import { authMiddleware, type AuthContextVariables } from '../auth/auth.middleware'
import { MediaForbiddenError, MediaNotFoundError, MediaValidationError } from './media.errors'
import { MediaService } from './media.service'
import {
  createMediaSigner,
  localDevMediaStore,
  resolveLocalDevMediaSecret,
  verifyLocalDevSignature,
  type MediaSignerEnv,
} from './r2.signer'

function getMediaService(c: any): MediaService {
  const db: DbClient = c.get('db') || getDb(c.env?.DATABASE_URL || process.env.DATABASE_URL)
  const signer = createMediaSigner(c.env as MediaSignerEnv)
  return new MediaService(db, signer)
}

function mapMediaError(c: any, error: unknown) {
  if (error instanceof MediaForbiddenError) {
    return c.json({ error: error.message }, 403)
  }
  if (error instanceof MediaNotFoundError) {
    return c.json({ error: error.message }, 404)
  }
  if (error instanceof MediaValidationError) {
    return c.json({ error: error.message }, 400)
  }
  throw error
}

function isDevOrTestEnvironment(env?: MediaSignerEnv): boolean {
  const value = (
    env?.ENVIRONMENT ||
    process.env.ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development'
  ).toLowerCase()
  return value === 'development' || value === 'test'
}

export const mediaRouter = new Hono<{
  Bindings: MediaSignerEnv & {
    DATABASE_URL?: string
  }
  Variables: AuthContextVariables & { db: DbClient }
}>()

// 1. POST /api/media/upload-url — Genera URL prefirmada PUT (<= 10 min) para subida directa a R2
mediaRouter.post(
  '/upload-url',
  authMiddleware,
  zValidator('json', RequestUploadUrlInputSchema),
  async (c) => {
    const user = c.get('user')
    const input = c.req.valid('json')
    const service = getMediaService(c)

    try {
      const result = await service.requestUploadUrl(user.id, input)
      return c.json(result, 200)
    } catch (error) {
      return mapMediaError(c, error)
    }
  }
)

// 2. POST /api/media/view-url — Genera URL firmada GET (<= 15 min) con verificación Zero-Leak
mediaRouter.post(
  '/view-url',
  authMiddleware,
  zValidator('json', RequestViewUrlInputSchema),
  async (c) => {
    const user = c.get('user')
    const input = c.req.valid('json')
    const service = getMediaService(c)

    try {
      const result = await service.requestViewUrl(user.id, input.media_key)
      return c.json(result, 200)
    } catch (error) {
      return mapMediaError(c, error)
    }
  }
)

// 3. GET /api/media/collages — Lista collages semanales ("Nuestros Momentos")
mediaRouter.get('/collages', authMiddleware, async (c) => {
  const user = c.get('user')
  const service = getMediaService(c)

  try {
    const result = await service.listWeeklyCollages(user.id)
    return c.json(result, 200)
  } catch (error) {
    return mapMediaError(c, error)
  }
})

// 4. POST /api/media/collages/:id/render — Sella el media_key del collage 1080x1920 subido a R2
mediaRouter.post(
  '/collages/:id/render',
  authMiddleware,
  zValidator('json', SaveRenderedCollageInputSchema),
  async (c) => {
    const user = c.get('user')
    const collageId = c.req.param('id') || ''
    const input = c.req.valid('json')
    const service = getMediaService(c)

    try {
      const result = await service.saveRenderedCollage(user.id, collageId, input)
      return c.json(result, 200)
    } catch (error) {
      return mapMediaError(c, error)
    }
  }
)

// 5. Fallback exclusivo de desarrollo/test cuando aún no hay credenciales R2 configuradas
mediaRouter.put('/dev-object', async (c) => {
  if (!isDevOrTestEnvironment(c.env)) {
    return c.json({ error: 'Not found' }, 404)
  }

  const key = c.req.query('key') || ''
  const op = c.req.query('op') || ''
  const exp = Number(c.req.query('exp') || '0')
  const ct = c.req.query('ct') || ''
  const sig = c.req.query('sig') || ''

  const valid =
    op === 'put' &&
    (await verifyLocalDevSignature({
      secret: resolveLocalDevMediaSecret(c.env),
      op: 'put',
      key,
      exp,
      ct,
      sig,
    }))

  if (!valid) {
    return c.json({ error: 'Firma de subida local inválida o expirada' }, 403)
  }

  const buffer = await c.req.arrayBuffer()
  const contentType = ct || c.req.header('content-type') || 'application/octet-stream'
  localDevMediaStore.put(key, new Uint8Array(buffer), contentType)
  return c.body(null, 200)
})

mediaRouter.get('/dev-object', async (c) => {
  if (!isDevOrTestEnvironment(c.env)) {
    return c.json({ error: 'Not found' }, 404)
  }

  const key = c.req.query('key') || ''
  const op = c.req.query('op') || ''
  const exp = Number(c.req.query('exp') || '0')
  const sig = c.req.query('sig') || ''

  const valid =
    op === 'get' &&
    (await verifyLocalDevSignature({
      secret: resolveLocalDevMediaSecret(c.env),
      op: 'get',
      key,
      exp,
      sig,
    }))

  if (!valid) {
    return c.json({ error: 'Firma de lectura local inválida o expirada' }, 403)
  }

  const stored = localDevMediaStore.get(key)
  if (!stored) {
    return c.json({ error: 'Objeto no encontrado en almacenamiento local' }, 404)
  }

  return new Response(new Uint8Array(stored.body), {
    status: 200,
    headers: {
      'Content-Type': stored.contentType,
      'Cache-Control': 'private, max-age=300',
    },
  })
})
