import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import app from '../../server/index'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Auth Transport & Security Headers (§2.2, §2.5, §2.10)', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe emitir cookies de sesión con flags HttpOnly y SameSite=Lax', async () => {
    const res = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'transport@example.com',
          displayName: 'Transport Test',
          password: 'Password123!',
        }),
      },
      env
    )

    expect(res.status).toBe(201)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
  })

  it('debe incluir Referrer-Policy: no-referrer en las respuestas de verify-email (§2.2)', async () => {
    const res = await app.request(
      '/api/auth/verify-email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'dummy_token' }),
      },
      env
    )

    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('debe responder a preflight OPTIONS con headers CORS adecuados y credentials permitidos', async () => {
    const res = await app.request(
      '/api/auth/login',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      },
      env
    )

    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })
})
