import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import app from '../../server/index'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

describe('Dual Rate Limiting (Local IP+Email & Global Email Anti-Botnet §2.3)', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  it('debe bloquear tras 5 intentos fallidos desde una misma IP (Nivel Local)', async () => {
    // 1. Crear cuenta legítima
    await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'victim.ratelimit@example.com',
          displayName: 'Victim',
          password: 'Password123!',
        }),
      },
      env
    )

    // 2. Realizar 5 intentos fallidos desde la IP 192.168.1.50
    for (let i = 0; i < 5; i++) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': '192.168.1.50',
          },
          body: JSON.stringify({
            email: 'victim.ratelimit@example.com',
            password: 'WrongPassword!',
          }),
        },
        env
      )
      expect(res.status).toBe(401)
    }

    // 3. El 6º intento desde la misma IP debe recibir 429
    const blockedRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '192.168.1.50',
        },
        body: JSON.stringify({
          email: 'victim.ratelimit@example.com',
          password: 'Password123!',
        }),
      },
      env
    )

    expect(blockedRes.status).toBe(429)
    expect(blockedRes.headers.get('Retry-After')).toBeTruthy()
  })

  it('debe activar bloqueo global por email tras 20 intentos desde IPs rotativas (Anti-Botnet)', async () => {
    await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'botnet.target@example.com',
          displayName: 'Target',
          password: 'Password123!',
        }),
      },
      env
    )

    // Simular botnet atacando desde 20 IPs distintas (1 intento por IP)
    for (let i = 1; i <= 20; i++) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': `10.0.0.${i}`,
          },
          body: JSON.stringify({
            email: 'botnet.target@example.com',
            password: 'WrongGuess!',
          }),
        },
        env
      )
      expect(res.status).toBe(401)
    }

    // El intento 21 desde una IP completamente nueva (10.0.0.99) debe ser bloqueado por el límite global
    const botnetBlocked = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '10.0.0.99',
        },
        body: JSON.stringify({
          email: 'botnet.target@example.com',
          password: 'Password123!',
        }),
      },
      env
    )

    expect(botnetBlocked.status).toBe(429)
    const json = (await botnetBlocked.json()) as { error: string }
    expect(json.error).toContain('sospechosa')
  })
})
