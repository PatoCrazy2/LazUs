import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../server/db'
import { users } from '../../server/db/schema'
import app from '../../server/index'
import { signOAuthState } from '../../server/features/auth/auth.crypto'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Google OAuth 2.0 Flow (PKCE, State HMAC & UserInfo)', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('debe iniciar flujo OAuth redirigiendo a Google con PKCE y state firmado', async () => {
    const res = await app.request('/api/auth/google', {}, env)
    expect(res.status).toBe(302)

    const location = res.headers.get('location')
    expect(location).toBeTruthy()

    const url = new URL(location!)
    expect(url.hostname).toBe('accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe(env.GOOGLE_CLIENT_ID)
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toContain('.')
  })

  it('debe rechazar el callback si el state ha sido alterado o la firma HMAC es inválida', async () => {
    const res = await app.request(
      '/api/auth/google/callback?code=mock_code&state=invalid_tampered_state',
      {},
      env
    )
    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string }
    expect(data.error).toContain('Estado de OAuth inválido')
  })

  it('debe rechazar si Google retorna un usuario con email no verificado', async () => {
    const validState = await signOAuthState(
      {
        codeVerifier: 'mock_code_verifier_123',
        nonce: 'nonce_123',
        timestamp: Date.now(),
      },
      env.AUTH_SECRET
    )

    // Mock de las llamadas a Google APIs
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 })
      }
      if (urlStr.includes('googleapis.com/oauth2/v3/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: 'google_user_1',
            email: 'unverified@gmail.com',
            email_verified: false, // NO VERIFICADO POR GOOGLE
            name: 'Unverified Google User',
          }),
          { status: 200 }
        )
      }
      return new Response('Not Found', { status: 404 })
    })

    const res = await app.request(
      `/api/auth/google/callback?code=mock_code&state=${encodeURIComponent(validState)}`,
      {},
      env
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string }
    expect(data.error).toContain('correo electrónico verificado')
  })

  it('debe autenticar, crear usuario verificado y emitir cookie ante callback exitoso de Google', async () => {
    const validState = await signOAuthState(
      {
        codeVerifier: 'mock_code_verifier_abc',
        nonce: 'nonce_abc',
        timestamp: Date.now(),
      },
      env.AUTH_SECRET
    )

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'google_token_xyz' }), { status: 200 })
      }
      if (urlStr.includes('googleapis.com/oauth2/v3/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: 'google_id_9999',
            email: 'verified.google@gmail.com',
            email_verified: true,
            name: 'Google Verified User',
            picture: 'https://lh3.googleusercontent.com/avatar.jpg',
          }),
          { status: 200 }
        )
      }
      return new Response('Not Found', { status: 404 })
    })

    const res = await app.request(
      `/api/auth/google/callback?code=valid_code&state=${encodeURIComponent(validState)}`,
      {},
      env
    )

    expect(res.status).toBe(302)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('lazus_session=')

    // Verificar en BD
    const [dbUser] = await db.select().from(users)
    expect(dbUser).toBeDefined()
    expect(dbUser.email).toBe('verified.google@gmail.com')
    expect(dbUser.googleId).toBe('google_id_9999')
    expect(dbUser.emailVerified).toBe(true)
    expect(dbUser.passwordHash).toBeNull()
  })
})
