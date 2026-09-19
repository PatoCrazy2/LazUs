import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import type { DbClient } from '../../db'
import { authTokens, loginAttempts, sessions, users } from '../../db/schema'

export interface CreateUserData {
  email: string
  displayName: string
  passwordHash?: string | null
  googleId?: string | null
  emailVerified?: boolean
  avatarUrl?: string | null
}

export interface GoogleLinkingData {
  email: string
  displayName: string
  googleId: string
  avatarUrl?: string | null
}

export interface GoogleLinkingResult {
  user: typeof users.$inferSelect
  wasSquatted: boolean
}

export class AuthRepository {
  constructor(private db: DbClient) {}

  // --- Usuarios ---

  async findUserByEmail(email: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1)
    return result[0] || null
  }

  async findUserById(id: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    return result[0] || null
  }

  async findUserByGoogleId(googleId: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.googleId, googleId))
      .limit(1)
    return result[0] || null
  }

  async createUser(data: CreateUserData) {
    const result = await this.db
      .insert(users)
      .values({
        email: data.email.toLowerCase().trim(),
        displayName: data.displayName.trim(),
        passwordHash: data.passwordHash || null,
        googleId: data.googleId || null,
        emailVerified: data.emailVerified ?? false,
        avatarUrl: data.avatarUrl || null,
      })
      .returning()
    return result[0]
  }

  async updateUserPassword(userId: string, passwordHash: string | null) {
    const result = await this.db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning()
    return result[0] || null
  }

  async markEmailAsVerified(userId: string) {
    const result = await this.db
      .update(users)
      .set({
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning()
    return result[0] || null
  }

  /**
   * Vinculación o creación de usuario con Google OAuth.
   * Invariante canónica (§2.1 - Prevención de Squatting Caso B):
   * Si existe cuenta con email_verified = false:
   * 1. Se actualiza titularidad: email_verified = true, se vincula google_id y avatar.
   * 2. Se anula la contraseña previa: password_hash = NULL.
   * 3. Se revocan todas las sesiones activas del usuario previo.
   * 4. Se purgan todos los auth_tokens pendientes (used_at IS NULL).
   */
  async handleGoogleUserLinking(data: GoogleLinkingData): Promise<GoogleLinkingResult> {
    const normalizedEmail = data.email.toLowerCase().trim()

    // 1. Buscar si ya existe por googleId
    const existingGoogleUser = await this.findUserByGoogleId(data.googleId)
    if (existingGoogleUser) {
      if (data.avatarUrl && existingGoogleUser.avatarUrl !== data.avatarUrl) {
        await this.db
          .update(users)
          .set({ avatarUrl: data.avatarUrl, updatedAt: new Date() })
          .where(eq(users.id, existingGoogleUser.id))
      }
      return { user: existingGoogleUser, wasSquatted: false }
    }

    // 2. Buscar si existe por email
    const existingEmailUser = await this.findUserByEmail(normalizedEmail)

    if (existingEmailUser) {
      // Caso B: Cuenta previa no verificada -> Alerta de squatting
      if (!existingEmailUser.emailVerified) {
        // Ejecución atómica de la neutralización de squatting
        const [updatedUser] = await this.db
          .update(users)
          .set({
            googleId: data.googleId,
            emailVerified: true,
            passwordHash: null, // Anula contraseña previa
            displayName: data.displayName || existingEmailUser.displayName,
            avatarUrl: data.avatarUrl || existingEmailUser.avatarUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingEmailUser.id))
          .returning()

        // Revocar todas las sesiones activas previas
        await this.db.delete(sessions).where(eq(sessions.userId, existingEmailUser.id))

        // Purgar todos los tokens de autenticación pendientes
        await this.db
          .delete(authTokens)
          .where(
            and(
              eq(authTokens.userId, existingEmailUser.id),
              isNull(authTokens.usedAt)
            )
          )

        return { user: updatedUser, wasSquatted: true }
      }

      // Caso A: Cuenta previa legítima y verificada sin Google vinculada aún
      const [updatedUser] = await this.db
        .update(users)
        .set({
          googleId: data.googleId,
          avatarUrl: data.avatarUrl || existingEmailUser.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingEmailUser.id))
        .returning()

      return { user: updatedUser, wasSquatted: false }
    }

    // Caso C: Usuario nuevo
    const newUser = await this.createUser({
      email: normalizedEmail,
      displayName: data.displayName,
      googleId: data.googleId,
      emailVerified: true,
      passwordHash: null,
      avatarUrl: data.avatarUrl,
    })

    return { user: newUser, wasSquatted: false }
  }

  // --- Sesiones ---

  async createSession(sessionIdHash: string, userId: string, expiresAt: Date) {
    const result = await this.db
      .insert(sessions)
      .values({
        id: sessionIdHash,
        userId,
        expiresAt,
      })
      .returning()
    return result[0]
  }

  async findSessionWithUser(sessionIdHash: string) {
    const result = await this.db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, sessionIdHash), gt(sessions.expiresAt, new Date())))
      .limit(1)

    if (!result[0]) return null
    return {
      session: result[0].session,
      user: result[0].user,
    }
  }

  async touchSession(sessionIdHash: string, newExpiresAt: Date) {
    await this.db
      .update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.id, sessionIdHash))
  }

  async deleteSession(sessionIdHash: string) {
    await this.db.delete(sessions).where(eq(sessions.id, sessionIdHash))
  }

  async deleteAllSessionsForUser(userId: string, exceptSessionId?: string) {
    if (exceptSessionId) {
      await this.db
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            sql`${sessions.id} != ${exceptSessionId}`
          )
        )
    } else {
      await this.db.delete(sessions).where(eq(sessions.userId, userId))
    }
  }

  // --- Tokens de Autenticación ---

  async createAuthToken(
    userId: string,
    tokenHash: string,
    type: 'email_verification' | 'password_reset',
    expiresAt: Date
  ) {
    const result = await this.db
      .insert(authTokens)
      .values({
        userId,
        tokenHash,
        type,
        expiresAt,
      })
      .returning()
    return result[0]
  }

  async findValidAuthToken(
    tokenHash: string,
    type: 'email_verification' | 'password_reset'
  ) {
    const result = await this.db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.type, type),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date())
        )
      )
      .limit(1)
    return result[0] || null
  }

  async markAuthTokenAsUsed(tokenId: string) {
    await this.db
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(eq(authTokens.id, tokenId))
  }

  async purgePendingTokensForUser(
    userId: string,
    type?: 'email_verification' | 'password_reset'
  ) {
    if (type) {
      await this.db
        .delete(authTokens)
        .where(
          and(
            eq(authTokens.userId, userId),
            eq(authTokens.type, type),
            isNull(authTokens.usedAt)
          )
        )
    } else {
      await this.db
        .delete(authTokens)
        .where(
          and(
            eq(authTokens.userId, userId),
            isNull(authTokens.usedAt)
          )
        )
    }
  }

  // --- Rate Limiting Dual en PostgreSQL ---

  /**
   * Verifica si un identificador ('ip:login:email' o 'email:login:<email>') está bloqueado.
   */
  async checkRateLimit(identifier: string): Promise<{
    allowed: boolean
    retryAfterSeconds?: number
  }> {
    const record = await this.db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, identifier))
      .limit(1)

    const row = record[0]
    if (!row) return { allowed: true }

    const now = new Date()
    if (row.lockedUntil && row.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil(
        (row.lockedUntil.getTime() - now.getTime()) / 1000
      )
      return { allowed: false, retryAfterSeconds }
    }

    return { allowed: true }
  }

  /**
   * Registra un intento fallido y bloquea si se supera maxAttempts dentro del periodo de ventana.
   */
  async recordFailedAttempt(
    identifier: string,
    maxAttempts: number,
    windowSeconds: number,
    lockoutSeconds: number
  ): Promise<{
    locked: boolean
    retryAfterSeconds?: number
  }> {
    const now = new Date()
    const windowStart = new Date(now.getTime() - windowSeconds * 1000)

    const record = await this.db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, identifier))
      .limit(1)

    const row = record[0]

    if (!row) {
      await this.db.insert(loginAttempts).values({
        identifier,
        attemptCount: 1,
        lastAttemptAt: now,
      })
      return { locked: false }
    }

    // Si el último intento fue fuera de la ventana y no está bloqueado, reiniciar contador
    if (row.lastAttemptAt < windowStart && (!row.lockedUntil || row.lockedUntil <= now)) {
      await this.db
        .update(loginAttempts)
        .set({
          attemptCount: 1,
          lockedUntil: null,
          lastAttemptAt: now,
        })
        .where(eq(loginAttempts.id, row.id))
      return { locked: false }
    }

    const newCount = row.attemptCount + 1
    if (newCount >= maxAttempts) {
      const lockedUntil = new Date(now.getTime() + lockoutSeconds * 1000)
      await this.db
        .update(loginAttempts)
        .set({
          attemptCount: newCount,
          lockedUntil,
          lastAttemptAt: now,
        })
        .where(eq(loginAttempts.id, row.id))
      return { locked: true, retryAfterSeconds: lockoutSeconds }
    }

    await this.db
      .update(loginAttempts)
      .set({
        attemptCount: newCount,
        lastAttemptAt: now,
      })
      .where(eq(loginAttempts.id, row.id))

    return { locked: false }
  }

  async resetRateLimit(identifier: string) {
    await this.db
      .delete(loginAttempts)
      .where(eq(loginAttempts.identifier, identifier))
  }

  // --- Tarea de Mantenimiento Periódico ---

  /**
   * Purga datos caducados (§2.6):
   * - Intentos de login inactivos > 24 horas.
   * - Tokens expirados o ya consumidos (used_at IS NOT NULL).
   * - Sesiones expiradas.
   */
  async cleanupExpiredAuthData() {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const deletedAttempts = await this.db
      .delete(loginAttempts)
      .where(lt(loginAttempts.lastAttemptAt, oneDayAgo))

    const deletedTokens = await this.db
      .delete(authTokens)
      .where(or(lt(authTokens.expiresAt, now), sql`${authTokens.usedAt} IS NOT NULL`))

    const deletedSessions = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now))

    return {
      cleanedAt: now.toISOString(),
      deletedAttempts,
      deletedTokens,
      deletedSessions,
    }
  }
}
