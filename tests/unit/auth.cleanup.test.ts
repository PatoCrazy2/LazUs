import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import { authTokens, loginAttempts, sessions, users } from '../../server/db/schema'
import { AuthService } from '../../server/features/auth/auth.service'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Auth Maintenance Cleanup (cleanupExpiredAuthData §2.6)', () => {
  const db = getDb(getTestEnv().DATABASE_URL)
  const authService = new AuthService(db)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe purgar intentos viejos, tokens usados/expirados y sesiones caducadas', async () => {
    // 1. Crear un usuario base
    const [user] = await db
      .insert(users)
      .values({
        email: 'cleanup-user@example.com',
        displayName: 'Cleanup User',
      })
      .returning()

    const now = new Date()
    const thirtyHoursAgo = new Date(now.getTime() - 30 * 60 * 60 * 1000)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const past = new Date(now.getTime() - 1000)

    // 2. Insertar login_attempts: uno caducado (>24h) y uno reciente
    await db.insert(loginAttempts).values([
      { identifier: 'old:attempt', attemptCount: 3, lastAttemptAt: thirtyHoursAgo },
      { identifier: 'recent:attempt', attemptCount: 1, lastAttemptAt: fiveMinutesAgo },
    ])

    // 3. Insertar auth_tokens: uno expirado, uno consumido (used_at) y uno válido futuro
    await db.insert(authTokens).values([
      {
        userId: user.id,
        tokenHash: 'hash-expired',
        type: 'email_verification',
        expiresAt: past,
      },
      {
        userId: user.id,
        tokenHash: 'hash-used',
        type: 'email_verification',
        expiresAt: future,
        usedAt: fiveMinutesAgo,
      },
      {
        userId: user.id,
        tokenHash: 'hash-valid',
        type: 'email_verification',
        expiresAt: future,
      },
    ])

    // 4. Insertar sessions: una expirada y una válida
    await db.insert(sessions).values([
      { id: 'session-expired', userId: user.id, expiresAt: past },
      { id: 'session-valid', userId: user.id, expiresAt: future },
    ])

    // 5. Ejecutar tarea de limpieza
    await authService.cleanupExpiredAuthData()

    // 6. Validar que sólo sobrevivieron los registros válidos
    const remainingAttempts = await db.select().from(loginAttempts)
    expect(remainingAttempts).toHaveLength(1)
    expect(remainingAttempts[0].identifier).toBe('recent:attempt')

    const remainingTokens = await db.select().from(authTokens)
    expect(remainingTokens).toHaveLength(1)
    expect(remainingTokens[0].tokenHash).toBe('hash-valid')

    const remainingSessions = await db.select().from(sessions)
    expect(remainingSessions).toHaveLength(1)
    expect(remainingSessions[0].id).toBe('session-valid')
  })
})
