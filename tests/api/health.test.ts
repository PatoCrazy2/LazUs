import { describe, expect, it } from 'vitest'
import app from '../../server/index'

describe('GET /api/health', () => {
  it('debe responder 200 con status healthy y conexión verificada a PostgreSQL', async () => {
    // Invocación en memoria del router Hono pasando las variables de entorno
    const res = await app.request('/api/health', {}, {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/lazus_db',
      ENVIRONMENT: 'test',
    })

    expect(res.status).toBe(200)

    const data = await res.json() as {
      status: string
      database: string
      db_check: { connected: number }
      runtime: string
    }

    expect(data.status).toBe('healthy')
    expect(data.database).toBe('connected')
    expect(data.db_check.connected).toBe(1)
    expect(data.runtime).toBe('Cloudflare Workers (Hono)')
  })
})
