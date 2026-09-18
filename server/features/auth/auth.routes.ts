import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { deleteCookie, setCookie } from 'hono/cookie'
import {
  ForgotPasswordInputSchema,
  LoginInputSchema,
  RegisterInputSchema,
  ResendVerificationInputSchema,
  ResetPasswordInputSchema,
  SetPasswordInputSchema,
  VerifyEmailInputSchema,
} from '../../../shared'
import { getDb } from '../../db'
import { authMiddleware, SESSION_COOKIE_NAME, type AuthContextVariables } from './auth.middleware'
import { AuthService, type AuthServiceEnv } from './auth.service'

export const authRouter = new Hono<{
  Bindings: AuthServiceEnv & { DATABASE_URL?: string; ENVIRONMENT?: string }
  Variables: AuthContextVariables
}>()

function getClientIp(c: any): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    '127.0.0.1'
  )
}

function setSessionCookie(c: any, token: string, expiresAt: Date) {
  const isSecure =
    c.req.url.startsWith('https://') ||
    c.env?.ENVIRONMENT === 'production' ||
    process.env.NODE_ENV === 'production'

  setCookie(c, SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax',
    expires: expiresAt,
    maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  })
}

function getAuthService(c: any): AuthService {
  const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL
  const db = getDb(dbUrl)
  return new AuthService(db)
}

function getAuthEnv(c: any): AuthServiceEnv {
  return {
    AUTH_SECRET: c.env?.AUTH_SECRET || process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: c.env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: c.env?.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    RESEND_API_KEY: c.env?.RESEND_API_KEY || process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: c.env?.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL,
    APP_BASE_URL: c.env?.APP_BASE_URL || process.env.APP_BASE_URL,
  }
}

// 1. POST /api/auth/register
authRouter.post('/register', zValidator('json', RegisterInputSchema), async (c) => {
  const input = c.req.valid('json')
  const ip = getClientIp(c)
  const service = getAuthService(c)
  const env = getAuthEnv(c)

  try {
    const result = await service.register(input, ip, env)
    setSessionCookie(c, result.sessionToken, result.sessionExpiresAt)
    return c.json({ user: result.user }, 201)
  } catch (error: any) {
    const status = error.status || 500
    return c.json({ error: error.message }, status)
  }
})

// 2. POST /api/auth/login
authRouter.post('/login', zValidator('json', LoginInputSchema), async (c) => {
  const input = c.req.valid('json')
  const ip = getClientIp(c)
  const service = getAuthService(c)

  try {
    const result = await service.login(input, ip)
    setSessionCookie(c, result.sessionToken, result.sessionExpiresAt)
    return c.json({ user: result.user }, 200)
  } catch (error: any) {
    const status = error.status || 500
    const headers: Record<string, string> = {}
    if (error.retryAfter) {
      headers['Retry-After'] = String(error.retryAfter)
    }
    return c.json({ error: error.message }, status, headers)
  }
})

// 3. POST /api/auth/logout
authRouter.post('/logout', authMiddleware, async (c) => {
  const rawToken = c.get('rawSessionToken')
  const service = getAuthService(c)

  await service.logout(rawToken)
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })

  return c.json({ message: 'Sesión cerrada correctamente' }, 200)
})

// 4. GET /api/auth/me (Zero-Leak)
authRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user')
  return c.json({ user }, 200)
})

// 5. POST /api/auth/verify-email (Anti-Prefetch con Referrer-Policy: no-referrer)
authRouter.post('/verify-email', zValidator('json', VerifyEmailInputSchema), async (c) => {
  const { token } = c.req.valid('json')
  const service = getAuthService(c)

  try {
    const result = await service.verifyEmail(token)
    c.header('Referrer-Policy', 'no-referrer')
    return c.json(result, 200)
  } catch (error: any) {
    c.header('Referrer-Policy', 'no-referrer')
    const status = error.status || 400
    return c.json({ error: error.message }, status)
  }
})

// 6. POST /api/auth/resend-verification
authRouter.post('/resend-verification', zValidator('json', ResendVerificationInputSchema), async (c) => {
  const { email } = c.req.valid('json')
  const ip = getClientIp(c)
  const service = getAuthService(c)
  const env = getAuthEnv(c)

  try {
    const result = await service.resendVerification(email, ip, env)
    return c.json(result, 200)
  } catch (error: any) {
    const status = error.status || 400
    return c.json({ error: error.message }, status)
  }
})

// 7. POST /api/auth/forgot-password
authRouter.post('/forgot-password', zValidator('json', ForgotPasswordInputSchema), async (c) => {
  const { email } = c.req.valid('json')
  const ip = getClientIp(c)
  const service = getAuthService(c)
  const env = getAuthEnv(c)

  try {
    const result = await service.forgotPassword(email, ip, env)
    return c.json(result, 200)
  } catch (error: any) {
    const status = error.status || 400
    return c.json({ error: error.message }, status)
  }
})

// 8. POST /api/auth/reset-password (Orden estricto y emisión de nueva sesión)
authRouter.post('/reset-password', zValidator('json', ResetPasswordInputSchema), async (c) => {
  const input = c.req.valid('json')
  const service = getAuthService(c)

  try {
    const result = await service.resetPassword(input)
    setSessionCookie(c, result.sessionToken, result.sessionExpiresAt)
    return c.json({ user: result.user, message: 'Contraseña restablecida exitosamente' }, 200)
  } catch (error: any) {
    const status = error.status || 400
    return c.json({ error: error.message }, status)
  }
})

// 9. POST /api/auth/set-password (Protegido por authMiddleware)
authRouter.post('/set-password', authMiddleware, zValidator('json', SetPasswordInputSchema), async (c) => {
  const input = c.req.valid('json')
  const user = c.get('user')
  const sessionId = c.get('sessionId')
  const service = getAuthService(c)

  try {
    const result = await service.setPassword(user.id, input, sessionId)
    return c.json(result, 200)
  } catch (error: any) {
    const status = error.status || 400
    return c.json({ error: error.message }, status)
  }
})

// 10. GET /api/auth/google (Inicia flujo PKCE + HMAC state)
authRouter.get('/google', async (c) => {
  const service = getAuthService(c)
  const env = getAuthEnv(c)
  const redirectUri = new URL('/api/auth/google/callback', c.req.url).toString()

  try {
    const { authUrl } = await service.getGoogleAuthUrl(env, redirectUri)
    return c.redirect(authUrl)
  } catch (error: any) {
    const status = error.status || 500
    return c.json({ error: error.message }, status)
  }
})

// 11. GET /api/auth/google/callback (Callback OAuth, squatting prevention y emisión de sesión)
authRouter.get('/google/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')

  if (!code || !state) {
    return c.json({ error: 'Faltan parámetros de autorización code o state' }, 400)
  }

  const service = getAuthService(c)
  const env = getAuthEnv(c)
  const redirectUri = new URL('/api/auth/google/callback', c.req.url).toString()

  try {
    const result = await service.handleGoogleCallback(code, state, redirectUri, env)
    setSessionCookie(c, result.sessionToken, result.sessionExpiresAt)

    // Redirección a la aplicación cliente
    const appUrl = env.APP_BASE_URL || '/'
    return c.redirect(appUrl)
  } catch (error: any) {
    const status = error.status || 400
    return c.json({ error: error.message }, status)
  }
})
