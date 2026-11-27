import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { sql } from 'drizzle-orm'
import { createRequestDb, getDb, type DbClient } from './db'
import { activitiesRouter } from './features/activities/activities.routes'
import { affectionRouter } from './features/affection/affection.routes'
import { authRouter } from './features/auth/auth.routes'
import { coupleRouter } from './features/couple/couple.routes'
import { mediaRouter } from './features/media/media.routes'
import { MediaService } from './features/media/media.service'
import { createMediaSigner } from './features/media/r2.signer'
import { realtimeRouter } from './features/realtime/realtime.routes'
import { AuthService } from './features/auth/auth.service'

export { CoupleDurableObject } from './features/realtime/couple.durable-object'

export type Bindings = {
  ENVIRONMENT?: string
  ASSETS?: Fetcher
  COUPLE_ROOM?: DurableObjectNamespace
  HYPERDRIVE?: { connectionString: string }
  DATABASE_URL?: string
  AUTH_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  APP_BASE_URL?: string
  R2_ACCOUNT_ID?: string
  R2_BUCKET_NAME?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
}

type AppVariables = {
  db: DbClient
}

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>()

// Middleware
app.use('*', logger())
app.use('/api/*', async (c, next) => {
  const dbUrl =
    c.env?.HYPERDRIVE?.connectionString ||
    c.env?.DATABASE_URL ||
    process.env.DATABASE_URL
  const { db, close } = createRequestDb(dbUrl)
  c.set('db', db)
  try {
    await next()
  } finally {
    let scheduledInCtx = false
    try {
      const executionCtx = c.executionCtx
      if (executionCtx?.waitUntil) {
        executionCtx.waitUntil(close())
        scheduledInCtx = true
      }
    } catch {
      // En entornos sin ExecutionContext (ej. Vitest app.request) se cierra inline
    }
    if (!scheduledInCtx) {
      await close()
    }
  }
})
app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)
app.onError((err, c) => {
  console.error('[Hono Error]', err)
  const cause = (err as any).cause
  return c.json(
    {
      error: err.message,
      name: err.name,
      cause: cause ? (cause.message || String(cause)) : undefined,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    },
    500
  )
})

// Base API healthcheck endpoint con verificación real de PostgreSQL
app.get('/api/health', async (c) => {
  try {
    const db = c.get('db')
    
    // Consulta SQL real ejecutada contra PostgreSQL en Docker
    const result = await db.execute(sql`SELECT 1 as connected`)
    const row = result.rows[0] as { connected: number } | undefined

    return c.json({
      status: 'healthy',
      database: 'connected',
      db_check: row ?? { connected: 1 },
      timestamp: new Date().toISOString(),
      runtime: 'Cloudflare Workers (Hono)',
      environment: c.env?.ENVIRONMENT || 'development',
    })
  } catch (error) {
    return c.json(
      {
        status: 'error',
        database: 'disconnected',
        error: error instanceof Error ? error.message : String(error),
        cause: (error as any)?.cause?.message || String((error as any)?.cause),
        timestamp: new Date().toISOString(),
      },
      500
    )
  }
})

// Rutas modulares por Features
app.route('/api/auth', authRouter)
app.route('/api/couple', coupleRouter)
app.route('/api/activities', activitiesRouter)
app.route('/api/affection', affectionRouter)
app.route('/api/realtime', realtimeRouter)
app.route('/api/media', mediaRouter)

// Handler de Cloudflare Cron Trigger (§2.6) para limpieza de datos caducados y collages semanales
export const scheduledHandler = async (_event: any, env: Bindings, _ctx?: any) => {
  const dbUrl = env?.DATABASE_URL || process.env.DATABASE_URL
  const db = getDb(dbUrl)
  const authService = new AuthService(db)
  const result = await authService.cleanupExpiredAuthData()
  console.info('[Scheduled] Limpieza periódica de auth ejecutada:', result)

  try {
    const mediaService = new MediaService(db, createMediaSigner(env))
    const collageResult = await mediaService.compileAllCouplesWeeklyCollages()
    console.info('[Scheduled] Compilación de collages semanales ejecutada:', collageResult)
  } catch (error) {
    console.error('[Scheduled] Error compilando collages semanales:', error)
  }

  return result
}

;(app as any).scheduled = scheduledHandler

export { app }
export default app

