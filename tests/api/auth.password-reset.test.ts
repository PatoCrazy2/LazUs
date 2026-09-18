import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import { authTokens, sessions, users } from '../../server/db/schema'
import app from '../../server/index'
import { generateRandomToken, sha256Hash, verifyPassword } from '../../server/features/auth/auth.crypto'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Password Reset Flow & Order of Operations (§2.4, §2.5)', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe permitir forgot-password en cuenta Google con password_hash = NULL (§2.4)', async () => {
    // 1. Usuario registrado originalmente sólo con Google
    const [googleUser] = await db
      .insert(users)
      .values({
        email: 'google.only@example.com',
        displayName: 'Google Only User',
        googleId: 'google-sub-xyz',
        passwordHash: null, // Sin contraseña previa
        emailVerified: true,
      })
      .returning()

    // 2. Solicitar forgot-password
    const forgotRes = await app.request(
      '/api/auth/forgot-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'google.only@example.com' }),
      },
      env
    )

    expect(forgotRes.status).toBe(200)

    // Comprobar que se generó token de tipo password_reset
    const [tokenRow] = await db.select().from(authTokens)
    expect(tokenRow).toBeDefined()
    expect(tokenRow.userId).toBe(googleUser.id)
    expect(tokenRow.type).toBe('password_reset')
  })

  it('debe ejecutar reset-password en el orden estricto de purga y emitir nueva sesión (§2.5)', async () => {
    // 1. Usuario con sesión previa
    const [user] = await db
      .insert(users)
      .values({
        email: 'reset.target@example.com',
        displayName: 'Reset Target',
        emailVerified: true,
      })
      .returning()

    // Sesión previa que debe ser destruida
    await db.insert(sessions).values({
      id: 'old-active-session-id',
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400000),
    })

    // Token de reseteo
    const rawResetToken = generateRandomToken(32)
    const resetTokenHash = await sha256Hash(rawResetToken)
    await db.insert(authTokens).values({
      userId: user.id,
      tokenHash: resetTokenHash,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 3600000),
    })

    // 2. Ejecutar reset-password
    const resetRes = await app.request(
      '/api/auth/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawResetToken,
          newPassword: 'BrandNewSecurePassword123!',
        }),
      },
      env
    )

    expect(resetRes.status).toBe(200)
    const setCookie = resetRes.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain('lazus_session=')

    // 3. Comprobaciones de base de datos
    // A. Contraseña actualizada
    const [updatedUser] = await db.select().from(users)
    expect(updatedUser.passwordHash).toBeTruthy()
    expect(await verifyPassword('BrandNewSecurePassword123!', updatedUser.passwordHash)).toBe(true)

    // B. Token consumido
    const [consumedToken] = await db.select().from(authTokens)
    expect(consumedToken.usedAt).not.toBeNull()

    // C. La sesión previa DEBE haber sido destruida, y ahora sólo existe la nueva sesión
    const allSessions = await db.select().from(sessions)
    expect(allSessions).toHaveLength(1)
    expect(allSessions[0].id).not.toBe('old-active-session-id')
  })
})
