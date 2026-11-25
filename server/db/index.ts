import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

const { Pool } = pg

// Factoría de conexión para desarrollo local y migraciones
let pool: pg.Pool | null = null

export function getDb(connectionString?: string) {
  const url =
    connectionString ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgrespassword@127.0.0.1:5432/lazus_db'

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
    pool.on('error', (err) => {
      console.error('[pg.Pool Error]:', err)
    })
  }

  return drizzle(pool, { schema })
}

/**
 * Factoría efímera por request para Cloudflare Workers / workerd.
 * Evita compartir sockets TCP entre distintos request contexts.
 */
export function createRequestDb(connectionString?: string) {
  const url =
    connectionString ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgrespassword@127.0.0.1:5432/lazus_db'

  const requestPool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  })

  requestPool.on('error', (err) => {
    console.error('[pg.RequestPool Error]:', err)
  })

  return {
    db: drizzle(requestPool, { schema }),
    close: () => requestPool.end(),
  }
}

export type DbClient = ReturnType<typeof getDb>
export { schema }
