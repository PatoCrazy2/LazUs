import type { Context, Next } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { AuthUserDto } from '../../../shared'
import { getDb } from '../../db'
import { sha256Hash } from './auth.crypto'
import { AuthRepository } from './auth.repository'

export const SESSION_COOKIE_NAME = 'lazus_session'
const SLIDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // Si restan menos de 7 días
const EXTENSION_TIME_MS = 30 * 24 * 60 * 60 * 1000 // Extender a 30 días

export interface AuthContextVariables {
  user?: AuthUserDto
  sessionId?: string
  rawSessionToken?: string
}

export async function authMiddleware(c: Context, next: Next) {
  const rawSessionToken = getCookie(c, SESSION_COOKIE_NAME)

  if (!rawSessionToken) {
    return c.json({ error: 'No autenticado' }, 401)
  }

  const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL
  const db = getDb(dbUrl)
  const repo = new AuthRepository(db)

  const sessionTokenHash = await sha256Hash(rawSessionToken)
  const sessionData = await repo.findSessionWithUser(sessionTokenHash)

  if (!sessionData) {
    return c.json({ error: 'Sesión inválida o expirada' }, 401)
  }

  const { session, user } = sessionData
  const now = Date.now()
  const remainingTime = session.expiresAt.getTime() - now

  // Sliding Expiration: si le quedan menos de 7 días, renovar por 30 días
  if (remainingTime < SLIDING_WINDOW_MS) {
    const newExpiresAt = new Date(now + EXTENSION_TIME_MS)
    await repo.touchSession(session.id, newExpiresAt)

    const isSecure =
      c.req.url.startsWith('https://') ||
      c.env?.ENVIRONMENT === 'production' ||
      process.env.NODE_ENV === 'production'

    setCookie(c, SESSION_COOKIE_NAME, rawSessionToken, {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax',
      maxAge: Math.floor(EXTENSION_TIME_MS / 1000),
      expires: newExpiresAt,
    })
  }

  const userDto: AuthUserDto = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt?.toISOString(),
  }

  c.set('user', userDto)
  c.set('sessionId', session.id)
  c.set('rawSessionToken', rawSessionToken)

  await next()
}

/**
 * Middleware de autenticación opcional:
 * Extrae y valida la sesión si existe la cookie, poblando c.get('user').
 * Si no hay cookie o la sesión es inválida/expirada, no rechaza con 401 y permite continuar como anónimo.
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const rawSessionToken = getCookie(c, SESSION_COOKIE_NAME)

  if (!rawSessionToken) {
    return await next()
  }

  try {
    const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL
    const db = getDb(dbUrl)
    const repo = new AuthRepository(db)

    const sessionTokenHash = await sha256Hash(rawSessionToken)
    const sessionData = await repo.findSessionWithUser(sessionTokenHash)

    if (sessionData) {
      const { session, user } = sessionData
      const now = Date.now()
      const remainingTime = session.expiresAt.getTime() - now

      if (remainingTime < SLIDING_WINDOW_MS) {
        const newExpiresAt = new Date(now + EXTENSION_TIME_MS)
        await repo.touchSession(session.id, newExpiresAt)

        const isSecure =
          c.req.url.startsWith('https://') ||
          c.env?.ENVIRONMENT === 'production' ||
          process.env.NODE_ENV === 'production'

        setCookie(c, SESSION_COOKIE_NAME, rawSessionToken, {
          path: '/',
          httpOnly: true,
          secure: isSecure,
          sameSite: 'Lax',
          maxAge: Math.floor(EXTENSION_TIME_MS / 1000),
          expires: newExpiresAt,
        })
      }

      const userDto: AuthUserDto = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        hasPassword: Boolean(user.passwordHash),
        createdAt: user.createdAt?.toISOString(),
      }

      c.set('user', userDto)
      c.set('sessionId', session.id)
      c.set('rawSessionToken', rawSessionToken)
    }
  } catch {
    // Si ocurre algún error en verificación opcional, continuamos anónimamente
  }

  await next()
}
