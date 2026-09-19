import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import { authTokens, sessions, users } from '../../server/db/schema'
import { hashPassword } from '../../server/features/auth/auth.crypto'
import { AuthRepository } from '../../server/features/auth/auth.repository'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Security Invariant: Account Squatting & Takeover Neutralization (Caso B §2.1)', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)
  const repo = new AuthRepository(db)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe anular password, revocar sesiones y purgar tokens pendientes al vincular Google sobre cuenta no verificada', async () => {
    // 1. Un atacante o impostor registra previamente la cuenta pero no puede verificar el email
    const squatterPasswordHash = await hashPassword('AttackerPassword123!')
    const [squattedUser] = await db
      .insert(users)
      .values({
        email: 'victim@example.com',
        displayName: 'Impostor',
        passwordHash: squatterPasswordHash,
        emailVerified: false, // NO VERIFICADA
      })
      .returning()

    // 2. El impostor tiene sesiones activas y tokens pendientes
    await db.insert(sessions).values([
      { id: 'attacker-session-1', userId: squattedUser.id, expiresAt: new Date(Date.now() + 86400000) },
      { id: 'attacker-session-2', userId: squattedUser.id, expiresAt: new Date(Date.now() + 86400000) },
    ])

    await db.insert(authTokens).values([
      {
        userId: squattedUser.id,
        tokenHash: 'attacker-pending-token-1',
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 86400000),
        usedAt: null, // PENDIENTE
      },
      {
        userId: squattedUser.id,
        tokenHash: 'attacker-pending-token-2',
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 86400000),
        usedAt: null, // PENDIENTE
      },
    ])

    // Verificar que los datos del atacante existen
    expect(await db.select().from(sessions)).toHaveLength(2)
    expect(await db.select().from(authTokens)).toHaveLength(2)

    // 3. El legítimo dueño inicia sesión por primera vez con Google OAuth (email verificado por Google)
    const googleResult = await repo.handleGoogleUserLinking({
      email: 'victim@example.com',
      displayName: 'Legitimate Owner',
      googleId: 'google-sub-987654321',
      avatarUrl: 'https://google.com/avatar.jpg',
    })

    expect(googleResult.wasSquatted).toBe(true)
    expect(googleResult.user.id).toBe(squattedUser.id)

    // 4. VERIFICACIÓN DE SEGURIDAD EXHAUSTIVA
    const [recoveredUser] = await db.select().from(users)

    // A. Titularidad transferida
    expect(recoveredUser.emailVerified).toBe(true)
    expect(recoveredUser.googleId).toBe('google-sub-987654321')

    // B. Contraseña previa del atacante aniquilada (password_hash = NULL)
    expect(recoveredUser.passwordHash).toBeNull()

    // C. Revocación total de todas las sesiones activas del atacante
    const remainingSessions = await db.select().from(sessions)
    expect(remainingSessions).toHaveLength(0)

    // D. Purga total de todos los auth_tokens pendientes
    const remainingTokens = await db.select().from(authTokens)
    expect(remainingTokens).toHaveLength(0)
  })

  it('debe mantener contraseña si la cuenta previa ya estaba debidamente verificada (Caso A)', async () => {
    const verifiedPasswordHash = await hashPassword('LegitPassword123!')
    const [_verifiedUser] = await db
      .insert(users)
      .values({
        email: 'legit@example.com',
        displayName: 'Legit User',
        passwordHash: verifiedPasswordHash,
        emailVerified: true, // YA VERIFICADA
      })
      .returning()

    const result = await repo.handleGoogleUserLinking({
      email: 'legit@example.com',
      displayName: 'Legit User',
      googleId: 'google-sub-112233',
    })

    expect(result.wasSquatted).toBe(false)
    const [dbUser] = await db.select().from(users)
    expect(dbUser.passwordHash).toBe(verifiedPasswordHash) // Preserva contraseña
    expect(dbUser.googleId).toBe('google-sub-112233')
  })
})
