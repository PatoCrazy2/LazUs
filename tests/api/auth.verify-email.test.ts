import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import { authTokens, users } from '../../server/db/schema'
import app from '../../server/index'
import { generateRandomToken, sha256Hash } from '../../server/features/auth/auth.crypto'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Email Verification & Anti-Prefetching Flow (§2.2, §2.7)', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe verificar email vía POST, marcar email_verified = true y emitir Referrer-Policy: no-referrer', async () => {
    // 1. Crear usuario no verificado
    const [user] = await db
      .insert(users)
      .values({
        email: 'verify@example.com',
        displayName: 'Verify User',
        emailVerified: false,
      })
      .returning()

    // 2. Crear token de verificación
    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)
    await db.insert(authTokens).values({
      userId: user.id,
      tokenHash,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 86400000),
    })

    // 3. Petición POST mutante
    const res = await app.request(
      '/api/auth/verify-email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
      },
      env
    )

    expect(res.status).toBe(200)

    // Cabecera estricta Anti-Leak Referrer-Policy (§2.2)
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')

    // Verificar en BD que el usuario quedó verificado y el token consumido
    const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updatedUser.emailVerified).toBe(true)

    const [consumedToken] = await db.select().from(authTokens)
    expect(consumedToken.usedAt).not.toBeNull()
  })

  it('debe rechazar reutilización de token (token de un solo uso)', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'reuse@example.com', displayName: 'Reuse', emailVerified: false })
      .returning()

    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)
    await db.insert(authTokens).values({
      userId: user.id,
      tokenHash,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 86400000),
    })

    // Primer uso
    const res1 = await app.request(
      '/api/auth/verify-email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
      },
      env
    )
    expect(res1.status).toBe(200)

    // Segundo intento con el mismo token
    const res2 = await app.request(
      '/api/auth/verify-email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
      },
      env
    )
    expect(res2.status).toBe(400)
    const data = (await res2.json()) as { error: string }
    expect(data.error).toContain('inválido o expirado')
  })

  it('debe reaccionar en silencio sin generar tokens si la cuenta ya está verificada (§2.7)', async () => {
    // Usuario ya verificado
    await db.insert(users).values({
      email: 'already.verified@example.com',
      displayName: 'Verified',
      emailVerified: true,
    })

    const res = await app.request(
      '/api/auth/resend-verification',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'already.verified@example.com' }),
      },
      env
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as { message: string }
    expect(data.message).toContain('Si la cuenta existe y no está verificada')

    // Invariante §2.7: No debe crear ningún token en la BD
    const tokens = await db.select().from(authTokens)
    expect(tokens).toHaveLength(0)
  })
})
