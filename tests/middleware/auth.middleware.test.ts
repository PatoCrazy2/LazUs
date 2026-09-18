import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import { sessions, users } from '../../server/db/schema'
import { generateRandomToken, sha256Hash } from '../../server/features/auth/auth.crypto'
import { authMiddleware, SESSION_COOKIE_NAME, type AuthContextVariables } from '../../server/features/auth/auth.middleware'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Middleware authMiddleware', () => {
  const db = getDb(getTestEnv().DATABASE_URL)
  const testApp = new Hono<{ Variables: AuthContextVariables }>()

  testApp.get('/protected', authMiddleware, (c) => {
    return c.json({ user: c.get('user'), sessionId: c.get('sessionId') })
  })

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe responder 401 si no se envía la cookie de sesión', async () => {
    const res = await testApp.request('/protected')
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('No autenticado')
  })

  it('debe responder 401 si la cookie de sesión es inválida o no existe en BD', async () => {
    const res = await testApp.request('/protected', {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=nonexistent_token_123456`,
      },
    })
    expect(res.status).toBe(401)
  })

  it('debe responder 401 si la sesión ha expirado', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'expired@example.com', displayName: 'Expired User' })
      .returning()

    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)

    await db.insert(sessions).values({
      id: tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() - 10000), // Expirada
    })

    const res = await testApp.request('/protected', {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
      },
    })
    expect(res.status).toBe(401)
  })

  it('debe autorizar e inyectar el usuario si la sesión es válida', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'valid@example.com', displayName: 'Valid User' })
      .returning()

    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)

    await db.insert(sessions).values({
      id: tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 días
    })

    const res = await testApp.request('/protected', {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
      },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { user: { id: string; email: string } }
    expect(json.user.id).toBe(user.id)
    expect(json.user.email).toBe('valid@example.com')
  })

  it('debe aplicar sliding expiration si restan menos de 7 días', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'sliding@example.com', displayName: 'Sliding User' })
      .returning()

    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)
    // Quedan sólo 3 días (< 7 días)
    const shortExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

    await db.insert(sessions).values({
      id: tokenHash,
      userId: user.id,
      expiresAt: shortExpiry,
    })

    const res = await testApp.request('/protected', {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
      },
    })

    expect(res.status).toBe(200)

    // Debe renovar la cookie en la respuesta Set-Cookie
    const setCookieHeader = res.headers.get('set-cookie')
    expect(setCookieHeader).toBeTruthy()
    expect(setCookieHeader).toContain(SESSION_COOKIE_NAME)

    // La sesión en base de datos debe haberse extendido a aproximadamente 30 días
    const [updatedSession] = await db.select().from(sessions)
    expect(updatedSession.expiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 24 * 60 * 60 * 1000)
  })
})
