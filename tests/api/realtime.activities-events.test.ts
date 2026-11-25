import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../server'
import { getDb } from '../../server/db'
import { seedActivityPrompts } from '../../server/db/seeds/prompts'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

const baseEnv = getTestEnv()

interface CapturedBroadcast {
  coupleId: string
  body: {
    audience: 'partner_only' | 'both'
    excludeUserId?: string
    event: Record<string, unknown>
  }
}

function createFakeCoupleRoomNamespace(options?: { failOnFetch?: boolean }) {
  const broadcasts: CapturedBroadcast[] = []

  const namespace = {
    idFromName: vi.fn((coupleId: string) => coupleId),
    get: vi.fn((coupleId: string) => ({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (options?.failOnFetch) {
          throw new Error('Simulated Durable Object outage')
        }
        const url = typeof input === 'string' ? input : input.toString()
        if (url.endsWith('/broadcast') && init?.body) {
          const parsed = JSON.parse(String(init.body)) as CapturedBroadcast['body']
          broadcasts.push({ coupleId, body: parsed })
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

function buildValidSubmissionBody(activity: any, clientMutationId: string, secretTag: string) {
  switch (activity.response_type) {
    case 'choice':
      return {
        client_mutation_id: clientMutationId,
        activity_id: activity.id,
        payload: {
          type: 'choice',
          selected_option: activity.prompt_config?.options?.[0] ?? 'Opción A',
        },
      }
    case 'scale':
      return {
        client_mutation_id: clientMutationId,
        activity_id: activity.id,
        payload: {
          type: 'scale',
          value: activity.prompt_config?.min ?? 3,
          note: `Nota secreta ${secretTag}`,
        },
      }
    case 'prediction':
      return {
        client_mutation_id: clientMutationId,
        activity_id: activity.id,
        payload: {
          type: 'prediction',
          my_answer: `Mi respuesta secreta ${secretTag}`,
          guessed_partner_answer: `Mi predicción ${secretTag}`,
        },
      }
    case 'music':
      return {
        client_mutation_id: clientMutationId,
        activity_id: activity.id,
        payload: {
          type: 'music',
          track: {
            track_id: '123456',
            title: `Canción ${secretTag}`,
            artist: 'Artista',
            artwork_url: 'https://example.com/art.jpg',
            preview_url: 'https://example.com/preview.m4a',
          },
        },
      }
    default:
      return {
        client_mutation_id: clientMutationId,
        activity_id: activity.id,
        content: `Texto secreto ${secretTag}`,
      }
  }
}

describe('Realtime Domain Emitters - Fase 2 (Activities & Affection Zero-Leak)', () => {
  beforeAll(async () => {
    const db = getDb(baseEnv.DATABASE_URL)
    await seedActivityPrompts(db)
  })

  beforeEach(async () => {
    await truncateAuthTables()
  })

  it('1. Emite partner_submission_completed (sin secretos), evita duplicados en idempotencia y emite activity_ready_to_reveal al desbloquear', async () => {
    const { userA, userB, coupleId } = await createPairedCouple('rt-act')
    const { namespace, broadcasts } = createFakeCoupleRoomNamespace()
    const envWithDo = { ...baseEnv, COUPLE_ROOM: namespace }

    const todayRes = await app.request(
      '/api/activities/today',
      { method: 'GET', headers: { Cookie: userA.cookie } },
      envWithDo
    )
    const activity = (await todayRes.json()) as any

    // 1. A responde -> partner_submission_completed (solo a B, Zero-Leak)
    const mutationIdA = crypto.randomUUID()
    const bodyA = buildValidSubmissionBody(activity, mutationIdA, 'SUPER-SECRETO-A')
    const submitResA = await app.request(
      `/api/activities/${activity.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify(bodyA),
      },
      envWithDo
    )
    expect(submitResA.status).toBe(200)
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].coupleId).toBe(coupleId)
    expect(broadcasts[0].body.audience).toBe('partner_only')
    expect(broadcasts[0].body.excludeUserId).toBe(userA.userId)
    expect(broadcasts[0].body.event.type).toBe('partner_submission_completed')
    expect(broadcasts[0].body.event.activityId).toBe(activity.id)

    // Verificación estricta Zero-Leak: ningún rastro de contenido/payload en el evento WS
    const serializedEventA = JSON.stringify(broadcasts[0].body.event)
    expect(serializedEventA).not.toContain('SUPER-SECRETO-A')
    expect(broadcasts[0].body.event).not.toHaveProperty('content')
    expect(broadcasts[0].body.event).not.toHaveProperty('payload')
    expect(broadcasts[0].body.event).not.toHaveProperty('media_key')

    // 2. Reintento idempotente de A -> 200 OK y CERO eventos duplicados
    const retryResA = await app.request(
      `/api/activities/${activity.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify(bodyA),
      },
      envWithDo
    )
    expect(retryResA.status).toBe(200)
    expect(broadcasts).toHaveLength(1)

    // 3. B responde -> activity_ready_to_reveal para ambos (Zero-Leak)
    const mutationIdB = crypto.randomUUID()
    const bodyB = buildValidSubmissionBody(activity, mutationIdB, 'SUPER-SECRETO-B')
    const submitResB = await app.request(
      `/api/activities/${activity.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify(bodyB),
      },
      envWithDo
    )
    expect(submitResB.status).toBe(200)
    expect(broadcasts).toHaveLength(2)
    expect(broadcasts[1].coupleId).toBe(coupleId)
    expect(broadcasts[1].body.audience).toBe('both')
    expect(broadcasts[1].body.event.type).toBe('activity_ready_to_reveal')
    expect(broadcasts[1].body.event.activityId).toBe(activity.id)
    expect(JSON.stringify(broadcasts[1].body.event)).not.toContain('SUPER-SECRETO-B')
  })

  it('2. Un fallo en el Durable Object nunca rompe la transacción confirmada de PostgreSQL', async () => {
    const { userA } = await createPairedCouple('rt-resilience')
    const { namespace } = createFakeCoupleRoomNamespace({ failOnFetch: true })
    const envWithFailingDo = { ...baseEnv, COUPLE_ROOM: namespace }

    const todayRes = await app.request(
      '/api/activities/today',
      { method: 'GET', headers: { Cookie: userA.cookie } },
      envWithFailingDo
    )
    const activity = (await todayRes.json()) as any

    const submitRes = await app.request(
      `/api/activities/${activity.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify(buildValidSubmissionBody(activity, crypto.randomUUID(), 'RESILIENTE')),
      },
      envWithFailingDo
    )

    expect(submitRes.status).toBe(200)
  })

  it('3. POST /api/affection exige autenticación/pareja, respeta idempotencia y emite affection_received solo a la pareja', async () => {
    const { userA, coupleId } = await createPairedCouple('rt-affection')
    const { namespace, broadcasts } = createFakeCoupleRoomNamespace()
    const envWithDo = { ...baseEnv, COUPLE_ROOM: namespace }

    // Sin sesión -> 401
    const unauthRes = await app.request(
      '/api/affection',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          event_type: 'heart_tap',
        }),
      },
      envWithDo
    )
    expect(unauthRes.status).toBe(401)

    // Envío autenticado -> 200 + 1 evento affection_received para la pareja
    const mutationId = crypto.randomUUID()
    const sendRes = await app.request(
      '/api/affection',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: mutationId,
          event_type: 'heart_tap',
        }),
      },
      envWithDo
    )
    expect(sendRes.status).toBe(200)
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].coupleId).toBe(coupleId)
    expect(broadcasts[0].body.audience).toBe('partner_only')
    expect(broadcasts[0].body.excludeUserId).toBe(userA.userId)
    expect(broadcasts[0].body.event).toMatchObject({
      type: 'affection_received',
      senderUserId: userA.userId,
      eventType: 'heart_tap',
    })

    // Reintento idempotente -> 200 y NO emite un segundo evento
    const replayRes = await app.request(
      '/api/affection',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: mutationId,
          event_type: 'heart_tap',
        }),
      },
      envWithDo
    )
    expect(replayRes.status).toBe(200)
    expect(broadcasts).toHaveLength(1)
  })
})
