import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import { sessions, users } from '../../server/db/schema'
import app from '../../server/index'
import { generateRandomToken, hashPassword, sha256Hash, verifyPassword } from '../../server/features/auth/auth.crypto'
import { SESSION_COOKIE_NAME } from '../../server/features/auth/auth.middleware'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Endpoint POST /api/auth/set-password', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe permitir asignar contraseña sin currentPassword a usuario que no tenía contraseña', async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: 'oauth.user@example.com',
        displayName: 'OAuth User',
        passwordHash: null,
        emailVerified: true,
      })
      .returning()

    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)
    await db.insert(sessions).values({
      id: tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400000),
    })

    const res = await app.request(
      '/api/auth/set-password',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
        },
        body: JSON.stringify({
          newPassword: 'MyFirstPassword123!',
        }),
      },
      env
    )

    expect(res.status).toBe(200)

    const [updatedUser] = await db.select().from(users)
    expect(updatedUser.passwordHash).toBeTruthy()
    expect(await verifyPassword('MyFirstPassword123!', updatedUser.passwordHash)).toBe(true)
  })

  it('debe exigir currentPassword válido si el usuario ya tenía contraseña', async () => {
    const oldHash = await hashPassword('CurrentPassword123!')
    const [user] = await db
      .insert(users)
      .values({
        email: 'has.pass@example.com',
        displayName: 'Has Pass',
        passwordHash: oldHash,
        emailVerified: true,
      })
      .returning()

    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)
    await db.insert(sessions).values({
      id: tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400000),
    })

    // Intento con contraseña actual errónea
    const badRes = await app.request(
      '/api/auth/set-password',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
        },
        body: JSON.stringify({
          currentPassword: 'WrongCurrent123!',
          newPassword: 'NewPassword999!',
        }),
      },
      env
    )
    expect(badRes.status).toBe(401)

    // Intento exitoso y revocación de otras sesiones
    const otherToken = generateRandomToken(32)
    const otherHash = await sha256Hash(otherToken)
    await db.insert(sessions).values({
      id: otherHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400000),
    })

    const okRes = await app.request(
      '/api/auth/set-password',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
        },
        body: JSON.stringify({
          currentPassword: 'CurrentPassword123!',
          newPassword: 'NewPassword999!',
        }),
      },
      env
    )
    expect(okRes.status).toBe(200)

    // La otra sesión debe haber sido revocada, la actual debe preservarse
    const remainingSessions = await db.select().from(sessions)
    expect(remainingSessions).toHaveLength(1)
    expect(remainingSessions[0].id).toBe(tokenHash)
  })
})
