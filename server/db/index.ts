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
    'postgresql://postgres:postgrespassword@localhost:5432/lazus_db'

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }

  return drizzle(pool, { schema })
}

export type DbClient = ReturnType<typeof getDb>
export { schema }
