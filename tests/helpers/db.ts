import { sql } from 'drizzle-orm'
import { getDb, type DbClient } from '../../server/db'

export function getTestEnv() {
  return {
    DATABASE_URL:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgrespassword@localhost:5432/lazus_db',
    ENVIRONMENT: 'test',
    AUTH_SECRET: 'test_super_secret_auth_signing_key_min_32_bytes!',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: 'LazUs <onboarding@resend.dev>',
    APP_BASE_URL: 'http://localhost:5173',
  }
}

/**
 * Limpia todas las tablas de autenticación y relaciones en PostgreSQL para aislamiento de pruebas.
 */
export async function truncateAuthTables(client?: DbClient) {
  const db = client || getDb(getTestEnv().DATABASE_URL)
  await db.execute(
    sql`TRUNCATE TABLE users, sessions, auth_tokens, login_attempts, couples, couple_members, nfc_tags, couple_invitations, daily_activities, submissions, affection_events, idempotency_keys CASCADE;`
  )
}
