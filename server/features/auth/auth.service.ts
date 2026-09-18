import type { AuthUserDto, RegisterInput, LoginInput, ResetPasswordInput, SetPasswordInput } from '../../../shared'
import type { DbClient } from '../../db'
import {
  generatePkcePair,
  generateRandomToken,
  hashPassword,
  sha256Hash,
  signOAuthState,
  verifyOAuthState,
  verifyPassword,
} from './auth.crypto'
import { AuthRepository } from './auth.repository'
import { EmailService } from './email.service'

export interface AuthServiceEnv {
  AUTH_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  APP_BASE_URL?: string
}

export class AuthService {
  private repository: AuthRepository

  constructor(private db: DbClient) {
    this.repository = new AuthRepository(db)
  }

  // --- Helper Zero-Leak DTO ---
  private toAuthUserDto(user: {
    id: string
    email: string
    displayName: string
    avatarUrl?: string | null
    emailVerified: boolean
    passwordHash?: string | null
    createdAt?: Date
  }): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl || null,
      emailVerified: user.emailVerified,
      hasPassword: Boolean(user.passwordHash),
      createdAt: user.createdAt?.toISOString(),
    }
  }

  // --- Registro de Usuario ---
  async register(input: RegisterInput, ip: string, env: AuthServiceEnv) {
    // 1. Rate limiting por IP (5 intentos en 15 min)
    const ipIdentifier = `ip:register:${ip}`
    const rateCheck = await this.repository.checkRateLimit(ipIdentifier)
    if (!rateCheck.allowed) {
      const err = new Error('Demasiadas solicitudes de registro. Intenta más tarde.') as Error & {
        status?: number
        retryAfter?: number
      }
      err.status = 429
      err.retryAfter = rateCheck.retryAfterSeconds
      throw err
    }

    // 2. Verificar si el email ya existe
    const existing = await this.repository.findUserByEmail(input.email)
    if (existing) {
      await this.repository.recordFailedAttempt(ipIdentifier, 5, 900, 900)
      const err = new Error('El correo electrónico ya está registrado') as Error & { status?: number }
      err.status = 409
      throw err
    }

    // 3. Hashear contraseña con PBKDF2
    const passwordHash = await hashPassword(input.password)

    // 4. Crear usuario con email_verified = false
    const newUser = await this.repository.createUser({
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      emailVerified: false,
    })

    // 5. Generar token de verificación (24h)
    const rawVerificationToken = generateRandomToken(32)
    const verificationTokenHash = await sha256Hash(rawVerificationToken)
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await this.repository.createAuthToken(
      newUser.id,
      verificationTokenHash,
      'email_verification',
      tokenExpiresAt
    )

    // 6. Enviar correo con Resend (no bloqueante ante errores)
    const emailService = new EmailService({
      resendApiKey: env.RESEND_API_KEY,
      fromEmail: env.RESEND_FROM_EMAIL,
      appBaseUrl: env.APP_BASE_URL,
    })

    void emailService.sendVerificationEmail({
      email: newUser.email,
      displayName: newUser.displayName,
      token: rawVerificationToken,
    })

    // 7. Generar sesión inicial de 30 días
    const rawSessionToken = generateRandomToken(32)
    const sessionTokenHash = await sha256Hash(rawSessionToken)
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await this.repository.createSession(sessionTokenHash, newUser.id, sessionExpiresAt)

    return {
      user: this.toAuthUserDto(newUser),
      sessionToken: rawSessionToken,
      sessionExpiresAt,
    }
  }

  // --- Login con Rate Limiting Dual ---
  async login(input: LoginInput, ip: string) {
    const ipKey = `ip:login:${ip}:${input.email}`
    const emailKey = `email:login:${input.email}`

    // 1. Verificar Rate Limit Local (IP+Email: 5 intentos / 15 min) y Global (Email: 20 intentos / 1h)
    const ipCheck = await this.repository.checkRateLimit(ipKey)
    if (!ipCheck.allowed) {
      const err = new Error('Demasiados intentos fallidos desde esta IP. Intenta más tarde.') as Error & {
        status?: number
        retryAfter?: number
      }
      err.status = 429
      err.retryAfter = ipCheck.retryAfterSeconds
      throw err
    }

    const emailCheck = await this.repository.checkRateLimit(emailKey)
    if (!emailCheck.allowed) {
      const err = new Error('Cuenta temporalmente bloqueada por actividad sospechosa.') as Error & {
        status?: number
        retryAfter?: number
      }
      err.status = 429
      err.retryAfter = emailCheck.retryAfterSeconds
      throw err
    }

    // 2. Buscar usuario
    const user = await this.repository.findUserByEmail(input.email)

    // 3. Verificar contraseña con tolerancia a passwordHash null (§2.9)
    const isValid = await verifyPassword(input.password, user?.passwordHash)

    if (!user || !isValid) {
      // Registrar intento fallido en ambos contadores
      await this.repository.recordFailedAttempt(ipKey, 5, 900, 900)
      await this.repository.recordFailedAttempt(emailKey, 20, 3600, 3600)

      const err = new Error('Credenciales inválidas') as Error & { status?: number }
      err.status = 401
      throw err
    }

    // 4. Limpiar contadores al acertar las credenciales
    await this.repository.resetRateLimit(ipKey)
    await this.repository.resetRateLimit(emailKey)

    // 5. Emitir nueva sesión (30 días)
    const rawSessionToken = generateRandomToken(32)
    const sessionTokenHash = await sha256Hash(rawSessionToken)
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await this.repository.createSession(sessionTokenHash, user.id, sessionExpiresAt)

    return {
      user: this.toAuthUserDto(user),
      sessionToken: rawSessionToken,
      sessionExpiresAt,
    }
  }

  // --- Logout ---
  async logout(rawSessionToken: string) {
    if (!rawSessionToken) return
    const sessionTokenHash = await sha256Hash(rawSessionToken)
    await this.repository.deleteSession(sessionTokenHash)
  }

  // --- Obtener Perfil (Zero-Leak) ---
  async getMe(userId: string) {
    const user = await this.repository.findUserById(userId)
    if (!user) {
      const err = new Error('Usuario no encontrado') as Error & { status?: number }
      err.status = 404
      throw err
    }
    return this.toAuthUserDto(user)
  }

  // --- Verificación de Email (Anti-Prefetch vía POST) ---
  async verifyEmail(rawToken: string) {
    const tokenHash = await sha256Hash(rawToken)
    const token = await this.repository.findValidAuthToken(tokenHash, 'email_verification')

    if (!token) {
      const err = new Error('Token de verificación inválido o expirado') as Error & { status?: number }
      err.status = 400
      throw err
    }

    // Marcar usuario como verificado y consumir token
    await this.repository.markEmailAsVerified(token.userId)
    await this.repository.markAuthTokenAsUsed(token.id)

    return { message: 'Correo electrónico verificado con éxito' }
  }

  // --- Reenvío de Verificación (Silencioso si ya verificado §2.7) ---
  async resendVerification(email: string, ip: string, env: AuthServiceEnv) {
    const ipKey = `ip:resend:${ip}`
    const rateCheck = await this.repository.checkRateLimit(ipKey)
    if (!rateCheck.allowed) {
      const err = new Error('Demasiadas solicitudes de reenvío. Intenta más tarde.') as Error & {
        status?: number
        retryAfter?: number
      }
      err.status = 429
      err.retryAfter = rateCheck.retryAfterSeconds
      throw err
    }

    await this.repository.recordFailedAttempt(ipKey, 5, 900, 900)

    const user = await this.repository.findUserByEmail(email)

    // Si no existe o ya está verificado, no hacer nada y devolver mensaje genérico
    if (!user || user.emailVerified) {
      return { message: 'Si la cuenta existe y no está verificada, recibirás un nuevo enlace' }
    }

    // Purgar tokens previos
    await this.repository.purgePendingTokensForUser(user.id, 'email_verification')

    // Generar nuevo token (24h)
    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await this.repository.createAuthToken(user.id, tokenHash, 'email_verification', expiresAt)

    const emailService = new EmailService({
      resendApiKey: env.RESEND_API_KEY,
      fromEmail: env.RESEND_FROM_EMAIL,
      appBaseUrl: env.APP_BASE_URL,
    })

    void emailService.sendVerificationEmail({
      email: user.email,
      displayName: user.displayName,
      token: rawToken,
    })

    return { message: 'Si la cuenta existe y no está verificada, recibirás un nuevo enlace' }
  }

  // --- Forgot Password (Soporte para password_hash = NULL §2.4) ---
  async forgotPassword(email: string, ip: string, env: AuthServiceEnv) {
    const ipKey = `ip:forgot:${ip}`
    const rateCheck = await this.repository.checkRateLimit(ipKey)
    if (!rateCheck.allowed) {
      const err = new Error('Demasiadas solicitudes de restablecimiento. Intenta más tarde.') as Error & {
        status?: number
        retryAfter?: number
      }
      err.status = 429
      err.retryAfter = rateCheck.retryAfterSeconds
      throw err
    }

    await this.repository.recordFailedAttempt(ipKey, 5, 900, 900)

    const user = await this.repository.findUserByEmail(email)

    // Respuesta genérica anti-enumeración
    const genericResponse = {
      message: 'Si la cuenta existe, recibirás un correo para restablecer tu contraseña',
    }

    if (!user) {
      return genericResponse
    }

    // Purgar tokens de reseteo previos
    await this.repository.purgePendingTokensForUser(user.id, 'password_reset')

    // Generar token de reseteo (1 hora)
    const rawToken = generateRandomToken(32)
    const tokenHash = await sha256Hash(rawToken)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await this.repository.createAuthToken(user.id, tokenHash, 'password_reset', expiresAt)

    const emailService = new EmailService({
      resendApiKey: env.RESEND_API_KEY,
      fromEmail: env.RESEND_FROM_EMAIL,
      appBaseUrl: env.APP_BASE_URL,
    })

    void emailService.sendPasswordResetEmail({
      email: user.email,
      displayName: user.displayName,
      token: rawToken,
    })

    return genericResponse
  }

  // --- Reset Password (Orden Estricto §2.5) ---
  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = await sha256Hash(input.token)

    // 1. Validar token
    const token = await this.repository.findValidAuthToken(tokenHash, 'password_reset')
    if (!token) {
      const err = new Error('Token de restablecimiento inválido o expirado') as Error & { status?: number }
      err.status = 400
      throw err
    }

    // 2. Hashear y actualizar contraseña
    const newPasswordHash = await hashPassword(input.newPassword)
    const updatedUser = await this.repository.updateUserPassword(token.userId, newPasswordHash)
    if (!updatedUser) {
      const err = new Error('Usuario no encontrado') as Error & { status?: number }
      err.status = 404
      throw err
    }

    // Si el usuario no estaba verificado, la posesión del token de correo lo verifica
    if (!updatedUser.emailVerified) {
      await this.repository.markEmailAsVerified(updatedUser.id)
      updatedUser.emailVerified = true
    }

    // 3. Marcar token como consumido
    await this.repository.markAuthTokenAsUsed(token.id)

    // 4. Invalidar TODAS las sesiones previas del usuario
    await this.repository.deleteAllSessionsForUser(updatedUser.id)

    // 5. Crear y emitir nueva sesión (30 días)
    const rawSessionToken = generateRandomToken(32)
    const sessionTokenHash = await sha256Hash(rawSessionToken)
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await this.repository.createSession(sessionTokenHash, updatedUser.id, sessionExpiresAt)

    return {
      user: this.toAuthUserDto(updatedUser),
      sessionToken: rawSessionToken,
      sessionExpiresAt,
    }
  }

  // --- Set Password (Asignación o Cambio de Contraseña) ---
  async setPassword(userId: string, input: SetPasswordInput, currentSessionIdHash: string) {
    const user = await this.repository.findUserById(userId)
    if (!user) {
      const err = new Error('Usuario no encontrado') as Error & { status?: number }
      err.status = 404
      throw err
    }

    // Si el usuario ya poseía contraseña, exigir y verificar currentPassword
    if (user.passwordHash) {
      if (!input.currentPassword) {
        const err = new Error('Se requiere la contraseña actual') as Error & { status?: number }
        err.status = 400
        throw err
      }

      const isCurrentValid = await verifyPassword(input.currentPassword, user.passwordHash)
      if (!isCurrentValid) {
        const err = new Error('La contraseña actual es incorrecta') as Error & { status?: number }
        err.status = 401
        throw err
      }
    }

    // Hashear y actualizar contraseña
    const newHash = await hashPassword(input.newPassword)
    await this.repository.updateUserPassword(user.id, newHash)

    // Revocar todas las otras sesiones concurrentes excepto la actual
    await this.repository.deleteAllSessionsForUser(user.id, currentSessionIdHash)

    return { message: 'Contraseña asignada exitosamente' }
  }

  // --- Google OAuth 2.0 PKCE & State ---
  async getGoogleAuthUrl(env: AuthServiceEnv, redirectUri: string) {
    if (!env.GOOGLE_CLIENT_ID || !env.AUTH_SECRET) {
      const err = new Error('Google OAuth o AUTH_SECRET no configurado') as Error & { status?: number }
      err.status = 500
      throw err
    }

    const { codeVerifier, codeChallenge } = await generatePkcePair()
    const statePayload = {
      codeVerifier,
      nonce: generateRandomToken(16),
      timestamp: Date.now(),
    }

    const signedState = await signOAuthState(statePayload, env.AUTH_SECRET)

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri)
    googleAuthUrl.searchParams.set('response_type', 'code')
    googleAuthUrl.searchParams.set('scope', 'openid email profile')
    googleAuthUrl.searchParams.set('code_challenge', codeChallenge)
    googleAuthUrl.searchParams.set('code_challenge_method', 'S256')
    googleAuthUrl.searchParams.set('state', signedState)
    googleAuthUrl.searchParams.set('prompt', 'select_account')

    return {
      authUrl: googleAuthUrl.toString(),
      state: signedState,
    }
  }

  async handleGoogleCallback(
    code: string,
    state: string,
    redirectUri: string,
    env: AuthServiceEnv
  ) {
    if (!env.AUTH_SECRET || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      const err = new Error('Google OAuth credentials no configuradas') as Error & { status?: number }
      err.status = 500
      throw err
    }

    // 1. Validar firma del state y caducidad (10 minutos)
    const stateData = await verifyOAuthState<{
      codeVerifier: string
      nonce: string
      timestamp: number
    }>(state, env.AUTH_SECRET)

    if (!stateData) {
      const err = new Error('Estado de OAuth inválido o alterado') as Error & { status?: number }
      err.status = 400
      throw err
    }

    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      const err = new Error('La solicitud de Google OAuth ha caducado') as Error & { status?: number }
      err.status = 400
      throw err
    }

    // 2. Intercambio de código por tokens con PKCE
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: stateData.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      console.error('[GoogleOAuth] Error al canjear token:', errText)
      const err = new Error('Error al autenticar con Google') as Error & { status?: number }
      err.status = 401
      throw err
    }

    const tokens = (await tokenResponse.json()) as { access_token: string }

    // 3. Obtener información de usuario desde UserInfo endpoint
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userInfoResponse.ok) {
      const err = new Error('No se pudo obtener información del usuario de Google') as Error & {
        status?: number
      }
      err.status = 401
      throw err
    }

    const userInfo = (await userInfoResponse.json()) as {
      sub: string
      email: string
      email_verified?: boolean
      name?: string
      picture?: string
    }

    if (!userInfo.email_verified) {
      const err = new Error('La cuenta de Google debe tener un correo electrónico verificado') as Error & {
        status?: number
      }
      err.status = 400
      throw err
    }

    // 4. Vinculación o creación de usuario con protección integral de Squatting (§2.1)
    const { user, wasSquatted } = await this.repository.handleGoogleUserLinking({
      email: userInfo.email,
      googleId: userInfo.sub,
      displayName: userInfo.name || userInfo.email.split('@')[0],
      avatarUrl: userInfo.picture,
    })

    // 5. Emitir nueva sesión (30 días)
    const rawSessionToken = generateRandomToken(32)
    const sessionTokenHash = await sha256Hash(rawSessionToken)
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await this.repository.createSession(sessionTokenHash, user.id, sessionExpiresAt)

    return {
      user: this.toAuthUserDto(user),
      sessionToken: rawSessionToken,
      sessionExpiresAt,
      wasSquatted,
    }
  }

  // --- Tarea Periódica de Mantenimiento ---
  async cleanupExpiredAuthData() {
    return await this.repository.cleanupExpiredAuthData()
  }
}
