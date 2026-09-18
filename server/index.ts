import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { sql } from 'drizzle-orm'
import { getDb } from './db'
import { activitiesRouter } from './features/activities/activities.routes'
import { affectionRouter } from './features/affection/affection.routes'

export type Bindings = {
  ENVIRONMENT?: string
  ASSETS?: Fetcher
  DATABASE_URL?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Middleware
app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

// Base API healthcheck endpoint con verificación real de PostgreSQL
app.get('/api/health', async (c) => {
  try {
    const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL
    const db = getDb(dbUrl)
    
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
        timestamp: new Date().toISOString(),
      },
      500
    )
  }
})

// Rutas modulares por Features
app.route('/api/activities', activitiesRouter)
app.route('/api/affection', affectionRouter)

export default app
