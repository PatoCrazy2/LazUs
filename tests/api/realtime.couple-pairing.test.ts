import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../server'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

const baseEnv = getTestEnv()

interface CapturedBroadcast {
  roomKey: string
  body: {
    audience: 'partner_only' | 'both'
    excludeUserId?: string
    event: Record<string, unknown>
  }
}

function createFakeNamespace(options?: { failOnFetch?: boolean }) {
  const broadcasts: CapturedBroadcast[] = []

  const namespace = {
    idFromName: vi.fn((roomKey: string) => roomKey),
    get: vi.fn((roomKey: string) => ({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (options?.failOnFetch) {
          throw new Error('Simulated DO failure')
        }
        const url = typeof input === 'string' ? input : input.toString()
        if (url.endsWith('/broadcast') && init?.body) {
          broadcasts.push({
            roomKey,
            body: JSON.parse(String(init.body)) as CapturedBroadcast['body'],
          })
        }
        return new Response(JSON.stringify({ delivered: 1 }), { status: 200 })
      }),
    })),
  }

  return {
    namespace: namespace as unknown as DurableObjectNamespace,
    broadcasts,
  }
}

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
  const data = (await res.json()) as { user: { id: string; displayName: string } }
  return { cookie, userId: data.user.id, displayName: data.user.displayName }
}

describe('Realtime Live Pairing - Fase 1 (POST /api/couple/pair -> couple_paired)', () => {
  beforeEach(async () => {
    await truncateAuthTables()
  })

  it('1. Al vincular con pulsera NFC, emite couple_paired a user:<ownerId> y no duplica en reintento idempotente', async () => {
    const userB = await registerUser('owner-b@example.com', 'Sofía')
    const userA = await registerUser('tapper-a@example.com', 'Emilio')
    const { namespace, broadcasts } = createFakeNamespace()
    const envWithDo = { ...baseEnv, COUPLE_ROOM: namespace }

    // B reclama su pulsera física
    const claimRes = await app.request(
      '/api/couple/claim-tag',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({ tag_identifier: 'NFC-BRACELET-B' }),
      },
      envWithDo
    )
    expect(claimRes.status).toBe(200)

    // A escanea la pulsera de B y acepta vincularse
    const mutationId = crypto.randomUUID()
    const pairRes = await app.request(
      '/api/couple/pair',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          identifier: 'NFC-BRACELET-B',
          client_mutation_id: mutationId,
        }),
      },
      envWithDo
    )
    expect(pairRes.status).toBe(200)
    const pairData = (await pairRes.json()) as { couple_id: string }

    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].roomKey).toBe(`user:${userB.userId}`)
    expect(broadcasts[0].body.event).toMatchObject({
      type: 'couple_paired',
      coupleId: pairData.couple_id,
      partnerDisplayName: 'Emilio',
    })

    // Reintento idempotente -> 200 OK sin emitir evento duplicado
    const retryRes = await app.request(
      '/api/couple/pair',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          identifier: 'NFC-BRACELET-B',
          client_mutation_id: mutationId,
        }),
      },
      envWithDo
    )
    expect(retryRes.status).toBe(200)
    expect(broadcasts).toHaveLength(1)
  })

  it('2. Al vincular con código digital LZ-XXXX, emite couple_paired y tolera fallos del DO sin romper la vinculación', async () => {
    const userB = await registerUser('inviter-b@example.com', 'Sofía')
    const userA = await registerUser('acceptor-a@example.com', 'Emilio')
    const { namespace } = createFakeNamespace({ failOnFetch: true })
    const envWithFailingDo = { ...baseEnv, COUPLE_ROOM: namespace }

    const inviteRes = await app.request(
      '/api/couple/invite-code',
      { method: 'POST', headers: { Cookie: userB.cookie } },
      envWithFailingDo
    )
    const { invitation_code } = (await inviteRes.json()) as { invitation_code: string }

    const pairRes = await app.request(
      '/api/couple/pair',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          identifier: invitation_code,
          client_mutation_id: crypto.randomUUID(),
        }),
      },
      envWithFailingDo
    )

    expect(pairRes.status).toBe(200)
  })
})
