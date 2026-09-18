import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

export type Bindings = {
  ENVIRONMENT?: string
  ASSETS?: Fetcher
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

import { activitiesRouter } from './features/activities/activities.routes'
import { affectionRouter } from './features/affection/affection.routes'

// Base API healthcheck endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    runtime: 'Cloudflare Workers (Hono)',
    environment: c.env.ENVIRONMENT || 'development',
  })
})

// Rutas modulares por Features
app.route('/api/activities', activitiesRouter)
app.route('/api/affection', affectionRouter)

export default app
