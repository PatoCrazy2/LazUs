import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import { sessions, users } from '../../server/db/schema'
import app from '../../server/index'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Auth Email Flow (Register, Login, Logout, Me & Zero-Leak)', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe registrar un usuario nuevo con email_verified = false y emitir sesión (201)', async () => {
    const res = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'alice@example.com',
          displayName: 'Alice',
          password: 'Password123!',
        }),
      },
      env
    )

    expect(res.status).toBe(201)
    const data = (await res.json()) as { user: any }

    // Zero-Leak Invariant: nunca retornar passwordHash ni secretos
    expect(data.user.id).toBeTruthy()
    expect(data.user.email).toBe('alice@example.com')
    expect(data.user.displayName).toBe('Alice')
    expect(data.user.emailVerified).toBe(false)
    expect(data.user.hasPassword).toBe(true)
    expect(data.user.passwordHash).toBeUndefined()

    // Comprobar Set-Cookie
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain('lazus_session=')
    expect(setCookie).toContain('HttpOnly')

    // Comprobar persistencia en PostgreSQL
    const dbUsers = await db.select().from(users)
    expect(dbUsers).toHaveLength(1)
    expect(dbUsers[0].emailVerified).toBe(false)

    const dbSessions = await db.select().from(sessions)
    expect(dbSessions).toHaveLength(1)
  })

  it('debe rechazar registro concurrente con correo existente con 409 Conflict', async () => {
    await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'duplicate@example.com',
          displayName: 'First User',
          password: 'Password123!',
        }),
      },
      env
    )

    const res2 = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'duplicate@example.com',
          displayName: 'Second User',
          password: 'Password123!',
        }),
      },
      env
    )

    expect(res2.status).toBe(409)
    const data = (await res2.json()) as { error: string }
    expect(data.error).toContain('ya está registrado')
  })

  it('debe autenticar usuario registrado, emitir cookie y permitir GET /me', async () => {
    // 1. Registro
    await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'bob@example.com',
          displayName: 'Bob',
          password: 'SecurePassword123!',
        }),
      },
      env
    )

    // 2. Login
    const loginRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'bob@example.com',
          password: 'SecurePassword123!',
        }),
      },
      env
    )

    expect(loginRes.status).toBe(200)
    const cookieHeader = loginRes.headers.get('set-cookie')
    expect(cookieHeader).toBeTruthy()

    const sessionMatch = cookieHeader!.match(/lazus_session=([^;]+)/)
    const sessionCookie = `lazus_session=${sessionMatch![1]}`

    // 3. GET /me con la cookie
    const meRes = await app.request(
      '/api/auth/me',
      {
        headers: { Cookie: sessionCookie },
      },
      env
    )

    expect(meRes.status).toBe(200)
    const meData = (await meRes.json()) as { user: any }
    expect(meData.user.email).toBe('bob@example.com')
    expect(meData.user.displayName).toBe('Bob')

    // 4. Logout
    const logoutRes = await app.request(
      '/api/auth/logout',
      {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      },
      env
    )

    expect(logoutRes.status).toBe(200)

    // 5. GET /me posterior debe fallar con 401
    const meAfterLogout = await app.request(
      '/api/auth/me',
      {
        headers: { Cookie: sessionCookie },
      },
      env
    )
    expect(meAfterLogout.status).toBe(401)
  })

  it('debe rechazar login con contraseña incorrecta con 401', async () => {
    await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'charlie@example.com',
          displayName: 'Charlie',
          password: 'CorrectPassword1!',
        }),
      },
      env
    )

    const res = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'charlie@example.com',
          password: 'WrongPassword999!',
        }),
      },
      env
    )

    expect(res.status).toBe(401)
    const data = (await res.json()) as { error: string }
    expect(data.error).toBe('Credenciales inválidas')
  })
})
