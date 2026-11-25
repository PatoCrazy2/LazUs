import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../server'
import {
  INTERNAL_COUPLE_ID_HEADER,
  INTERNAL_USER_ID_HEADER,
} from '../../server/features/realtime/couple.durable-object'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

const baseEnv = getTestEnv()

async function registerUser(email: string, displayName: string) {
  const res = await app.request(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'Password123!',
        displayName,
      }),
    },
    baseEnv
  )
  const setCookie = res.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  const data = (await res.json()) as { user: { id: string } }
  return { cookie, userId: data.user.id }
}

async function createPairedCouple(prefix: string) {
  const userA = await registerUser(`${prefix}-a@example.com`, `${prefix} A`)
  const userB = await registerUser(`${prefix}-b@example.com`, `${prefix} B`)

  const inviteRes = await app.request(
    '/api/couple/invite-code',
    {
      method: 'POST',
      headers: { Cookie: userA.cookie },
    },
    baseEnv
  )
  const inviteData = (await inviteRes.json()) as { invitation_code: string }

  const pairRes = await app.request(
    '/api/couple/pair',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
      body: JSON.stringify({
        identifier: inviteData.invitation_code,
        client_mutation_id: crypto.randomUUID(),
      }),
    },
    baseEnv
  )
  const pairData = (await pairRes.json()) as { couple_id: string }

  return { userA, userB, coupleId: pairData.couple_id }
}

describe('Realtime Route Authorization - GET /api/realtime/ws', () => {
  beforeEach(async () => {
    await truncateAuthTables()
  })

  it('1. Rechaza con 401 si no existe sesión autenticada', async () => {
    const res = await app.request(
      '/api/realtime/ws',
      {
        method: 'GET',
        headers: { Upgrade: 'websocket' },
      },
      baseEnv
    )

    expect(res.status).toBe(401)
  })

  it('2. Rechaza con 403 si el usuario autenticado no tiene pareja activa', async () => {
    const solo = await registerUser('realtime-solo@example.com', 'Solo')

    const res = await app.request(
      '/api/realtime/ws',
      {
        method: 'GET',
        headers: {
          Cookie: solo.cookie,
          Upgrade: 'websocket',
        },
      },
      baseEnv
    )

    expect(res.status).toBe(403)
  })

  it('3. Rechaza con 426 si falta la cabecera Upgrade: websocket', async () => {
    const { userA } = await createPairedCouple('rt-upgrade')

    const res = await app.request(
      '/api/realtime/ws',
      {
        method: 'GET',
        headers: { Cookie: userA.cookie },
      },
      baseEnv
    )

    expect(res.status).toBe(426)
  })

  it('4. Responde 503 si el binding COUPLE_ROOM no está configurado', async () => {
    const { userA } = await createPairedCouple('rt-nobinding')

    const res = await app.request(
      '/api/realtime/ws',
      {
        method: 'GET',
        headers: {
          Cookie: userA.cookie,
          Upgrade: 'websocket',
        },
      },
      baseEnv
    )

    expect(res.status).toBe(503)
  })

  it('5. Enruta al DO de la pareja verificada en PostgreSQL e impide spoofing de cabeceras internas', async () => {
    const { userA, coupleId } = await createPairedCouple('rt-auth')

    let forwardedRequest: Request | null = null
    const stubFetch = vi.fn(async (req: Request) => {
      forwardedRequest = req
      return new Response(JSON.stringify({ connected: true }), { status: 200 })
    })
    const idFromName = vi.fn().mockReturnValue('stub-id')
    const get = vi.fn().mockReturnValue({ fetch: stubFetch })
    const envWithDo = {
      ...baseEnv,
      COUPLE_ROOM: { idFromName, get } as unknown as DurableObjectNamespace,
    }

    const res = await app.request(
      '/api/realtime/ws',
      {
        method: 'GET',
        headers: {
          Cookie: userA.cookie,
          Upgrade: 'websocket',
          [INTERNAL_USER_ID_HEADER]: '00000000-0000-4000-8000-000000000000',
          [INTERNAL_COUPLE_ID_HEADER]: '99999999-9999-4999-8999-999999999999',
        },
      },
      envWithDo
    )

    expect(res.status).toBe(200)
    expect(idFromName).toHaveBeenCalledWith(coupleId)
    expect(stubFetch).toHaveBeenCalledTimes(1)
    expect(forwardedRequest).not.toBeNull()
    expect(forwardedRequest!.headers.get(INTERNAL_USER_ID_HEADER)).toBe(userA.userId)
    expect(forwardedRequest!.headers.get(INTERNAL_COUPLE_ID_HEADER)).toBe(coupleId)
    // Nunca reenviar cookies de sesión al Durable Object
    expect(forwardedRequest!.headers.get('cookie')).toBeNull()
  })
})
