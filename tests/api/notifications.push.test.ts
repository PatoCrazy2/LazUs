import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../server'
import { getDb } from '../../server/db'
import { dailyActivities } from '../../server/db/schema'
import { seedActivityPrompts } from '../../server/db/seeds/prompts'
import {
  encodeBase64Url,
  generateVapidKeyPair,
} from '../../server/features/notifications/webpush.crypto'
import { eq } from 'drizzle-orm'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

const baseEnv = getTestEnv()
const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface MockDevice {
  endpoint: string
  p256dh: string
  auth: string
  uaKeyPair: CryptoKeyPair
  authSecret: Uint8Array
}

async function createMockDevice(endpoint: string): Promise<MockDevice> {
  const uaKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeyPair.publicKey))
  const authSecret = crypto.getRandomValues(new Uint8Array(16))

  return {
    endpoint,
    p256dh: encodeBase64Url(rawPub),
    auth: encodeBase64Url(authSecret),
    uaKeyPair,
    authSecret,
  }
}

async function decryptPushBody(body: Uint8Array, device: MockDevice): Promise<Record<string, unknown>> {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublicBytes = body.subarray(21, 21 + idlen)
  const ciphertext = body.subarray(21 + idlen)

  const asPublicKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(asPublicBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asPublicKey }, device.uaKeyPair.privateKey, 256)
  )
  const uaPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', device.uaKeyPair.publicKey))

  const ecdhKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits'])
  const prefix = encoder.encode('WebPush: info\0')
  const keyInfo = new Uint8Array(prefix.length + uaPublicBytes.length + asPublicBytes.length)
  keyInfo.set(prefix, 0)
  keyInfo.set(uaPublicBytes, prefix.length)
  keyInfo.set(asPublicBytes, prefix.length + uaPublicBytes.length)

  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(device.authSecret), info: keyInfo },
      ecdhKey,
      256
    )
  )

  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const [cek, nonce] = await Promise.all([
    crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: encoder.encode('Content-Encoding: aes128gcm\0') },
      ikmKey,
      128
    ),
    crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: encoder.encode('Content-Encoding: nonce\0') },
      ikmKey,
      96
    ),
  ])

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const padded = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(nonce), tagLength: 128 },
      aesKey,
      new Uint8Array(ciphertext)
    )
  )

  let end = padded.length - 1
  while (end >= 0 && padded[end] === 0x00) end--
  expect(padded[end]).toBe(0x02)

  return JSON.parse(decoder.decode(padded.subarray(0, end))) as Record<string, unknown>
}

async function registerUser(email: string, displayName: string, env: Record<string, unknown>) {
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
    env
  )
  const setCookie = res.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  const data = (await res.json()) as { user: { id: string } }
  return { cookie, userId: data.user.id }
}

async function createPairedCouple(env: Record<string, unknown>) {
  const userA = await registerUser('ana-push@example.com', 'Ana García', env)
  const userB = await registerUser('emilio-push@example.com', 'Emilio López', env)

  const inviteRes = await app.request(
    '/api/couple/invite-code',
    {
      method: 'POST',
      headers: { Cookie: userA.cookie },
    },
    env
  )
  const inviteData = (await inviteRes.json()) as { invitation_code: string }

  await app.request(
    '/api/couple/pair',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userB.cookie,
      },
      body: JSON.stringify({
        identifier: inviteData.invitation_code,
        client_mutation_id: crypto.randomUUID(),
      }),
    },
    env
  )

  return { userA, userB }
}

describe('Feature Notifications - Hito 7 (Web Push API, 410 Cleanup & Zero-Leak Triggers)', () => {
  let vapidEnv: Record<string, unknown>

  beforeAll(async () => {
    const db = getDb(baseEnv.DATABASE_URL)
    await seedActivityPrompts(db)
    const keys = await generateVapidKeyPair()
    vapidEnv = {
      ...baseEnv,
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: 'mailto:hola@lazus.app',
    }
  })

  beforeEach(async () => {
    await truncateAuthTables()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('1. Requiere autenticación y expone estado VAPID correctamente', async () => {
    const unauthRes = await app.request('/api/notifications/vapid-public-key', {}, vapidEnv)
    expect(unauthRes.status).toBe(401)

    const user = await registerUser('vapid-check@example.com', 'Ana', baseEnv)

    // Sin variables VAPID -> degradación limpia enabled: false
    const disabledRes = await app.request(
      '/api/notifications/vapid-public-key',
      { headers: { Cookie: user.cookie } },
      baseEnv
    )
    expect(disabledRes.status).toBe(200)
    expect(await disabledRes.json()).toEqual({ enabled: false, public_key: null })

    // Con variables VAPID -> enabled: true + public_key
    const enabledRes = await app.request(
      '/api/notifications/vapid-public-key',
      { headers: { Cookie: user.cookie } },
      vapidEnv
    )
    expect(enabledRes.status).toBe(200)
    expect(await enabledRes.json()).toEqual({
      enabled: true,
      public_key: vapidEnv.VAPID_PUBLIC_KEY,
    })
  })

  it('2. Gestiona suscripciones multi-dispositivo, reasignación por cambio de cuenta y baja limpia', async () => {
    const userA = await registerUser('sub-a@example.com', 'Ana', vapidEnv)
    const userB = await registerUser('sub-b@example.com', 'Emilio', vapidEnv)

    const device1 = await createMockDevice('https://web.push.apple.com/device-1')
    const device2 = await createMockDevice('https://fcm.googleapis.com/fcm/send/device-2')

    // Suscribir dispositivo 1 y 2 para Ana
    const sub1 = await app.request(
      '/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          endpoint: device1.endpoint,
          keys: { p256dh: device1.p256dh, auth: device1.auth },
          user_agent: 'iOS Safari Standalone',
        }),
      },
      vapidEnv
    )
    expect(sub1.status).toBe(200)
    expect(await sub1.json()).toEqual({
      status: 'success',
      subscribed: true,
      subscriptions_count: 1,
    })

    const sub2 = await app.request(
      '/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          endpoint: device2.endpoint,
          keys: { p256dh: device2.p256dh, auth: device2.auth },
        }),
      },
      vapidEnv
    )
    expect(sub2.status).toBe(200)
    expect(await sub2.json()).toEqual({
      status: 'success',
      subscribed: true,
      subscriptions_count: 2,
    })

    // Estado consultado con endpoint registrado vs desconocido
    const statusMatch = await app.request(
      `/api/notifications/status?endpoint=${encodeURIComponent(device1.endpoint)}`,
      { headers: { Cookie: userA.cookie } },
      vapidEnv
    )
    expect(await statusMatch.json()).toEqual({
      enabled: true,
      subscribed: true,
      subscriptions_count: 2,
      current_device_subscribed: true,
    })

    const statusOther = await app.request(
      `/api/notifications/status?endpoint=${encodeURIComponent('https://fcm.googleapis.com/fcm/send/unknown')}`,
      { headers: { Cookie: userA.cookie } },
      vapidEnv
    )
    expect(await statusOther.json()).toEqual({
      enabled: true,
      subscribed: true,
      subscriptions_count: 2,
      current_device_subscribed: false,
    })

    // Cambio de sesión en mismo navegador: Emilio suscribe device1 -> se reasigna a Emilio
    await app.request(
      '/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({
          endpoint: device1.endpoint,
          keys: { p256dh: device1.p256dh, auth: device1.auth },
        }),
      },
      vapidEnv
    )

    const statusAAfterReassign = await app.request(
      `/api/notifications/status?endpoint=${encodeURIComponent(device1.endpoint)}`,
      { headers: { Cookie: userA.cookie } },
      vapidEnv
    )
    expect(await statusAAfterReassign.json()).toEqual({
      enabled: true,
      subscribed: true,
      subscriptions_count: 1,
      current_device_subscribed: false,
    })

    // Baja de device2 de Ana
    const unsub = await app.request(
      '/api/notifications/subscribe',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({ endpoint: device2.endpoint }),
      },
      vapidEnv
    )
    expect(unsub.status).toBe(200)
    expect(await unsub.json()).toEqual({
      status: 'success',
      subscribed: false,
      subscriptions_count: 0,
    })
  })

  it('3. POST /api/notifications/test solo envía al dispositivo propio del usuario y cifra correctamente', async () => {
    const userA = await registerUser('test-push-a@example.com', 'Ana', vapidEnv)
    const userB = await registerUser('test-push-b@example.com', 'Emilio', vapidEnv)
    const deviceA = await createMockDevice('https://web.push.apple.com/test-device-a')

    await app.request(
      '/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          endpoint: deviceA.endpoint,
          keys: { p256dh: deviceA.p256dh, auth: deviceA.auth },
        }),
      },
      vapidEnv
    )

    const captured: Array<{ url: string; body: Uint8Array; headers: Headers }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      captured.push({
        url: String(input),
        body: init?.body as Uint8Array,
        headers: new Headers(init?.headers),
      })
      return new Response(null, { status: 201 })
    })

    // Usuario B NO puede disparar /test al endpoint de Ana -> 404
    const forbiddenTest = await app.request(
      '/api/notifications/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({ endpoint: deviceA.endpoint, delay_seconds: 0 }),
      },
      vapidEnv
    )
    expect(forbiddenTest.status).toBe(404)
    expect(captured).toHaveLength(0)

    // Ana sí puede probar su propio dispositivo
    const okTest = await app.request(
      '/api/notifications/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({ endpoint: deviceA.endpoint, delay_seconds: 0 }),
      },
      vapidEnv
    )
    expect(okTest.status).toBe(200)
    expect(await okTest.json()).toEqual({ status: 'sent', delay_seconds: 0 })
    expect(captured).toHaveLength(1)
    expect(captured[0].url).toBe(deviceA.endpoint)
    expect(captured[0].headers.get('Content-Encoding')).toBe('aes128gcm')

    const payload = await decryptPushBody(captured[0].body, deviceA)
    expect(payload).toEqual({
      title: 'LazUs',
      body: '🔔 ¡Avisos activos en este dispositivo! Todo listo en LazUs.',
      tag: 'lazus-test',
      renotify: true,
      url: '/',
    })
  })

  it('4. Toque de afecto dispara Push seguro, purga automáticamente 410 Gone y respeta idempotencia', async () => {
    const { userA, userB } = await createPairedCouple(vapidEnv)
    const activeDeviceB = await createMockDevice('https://fcm.googleapis.com/fcm/send/emilio-active')
    const staleDeviceB = await createMockDevice('https://fcm.googleapis.com/fcm/send/emilio-stale-410')

    for (const dev of [activeDeviceB, staleDeviceB]) {
      await app.request(
        '/api/notifications/subscribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
          body: JSON.stringify({
            endpoint: dev.endpoint,
            keys: { p256dh: dev.p256dh, auth: dev.auth },
          }),
        },
        vapidEnv
      )
    }

    const calls: Array<{ url: string; body: Uint8Array }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      calls.push({ url, body: init?.body as Uint8Array })
      if (url === staleDeviceB.endpoint) {
        return new Response('Gone', { status: 410 })
      }
      return new Response(null, { status: 201 })
    })

    const mutationId = crypto.randomUUID()
    const res = await app.request(
      '/api/affection',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: mutationId,
          event_type: 'heart_tap',
        }),
      },
      vapidEnv
    )
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(2)

    const deliveredCall = calls.find((c) => c.url === activeDeviceB.endpoint)!
    const decrypted = await decryptPushBody(deliveredCall.body, activeDeviceB)
    expect(decrypted).toEqual({
      title: 'LazUs',
      body: '❤️ Ana te envió un toque',
      tag: 'lazus-affection',
      renotify: true,
      url: '/',
    })

    // Verificar que el endpoint 410 Gone fue purgado automáticamente de PostgreSQL
    const statusB = await app.request(
      `/api/notifications/status?endpoint=${encodeURIComponent(staleDeviceB.endpoint)}`,
      { headers: { Cookie: userB.cookie } },
      vapidEnv
    )
    expect(await statusB.json()).toEqual({
      enabled: true,
      subscribed: true,
      subscriptions_count: 1,
      current_device_subscribed: false,
    })

    // Replay idempotente con el mismo client_mutation_id -> CERO envíos adicionales
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
      vapidEnv
    )
    expect(replayRes.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it('5. Actividad diaria dispara Push Zero-Leak al responder primero y al revelar sin filtrar contenido', async () => {
    const { userA, userB } = await createPairedCouple(vapidEnv)
    const deviceA = await createMockDevice('https://web.push.apple.com/ana-iphone')
    const deviceB = await createMockDevice('https://web.push.apple.com/emilio-iphone')

    await app.request(
      '/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          endpoint: deviceA.endpoint,
          keys: { p256dh: deviceA.p256dh, auth: deviceA.auth },
        }),
      },
      vapidEnv
    )
    await app.request(
      '/api/notifications/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({
          endpoint: deviceB.endpoint,
          keys: { p256dh: deviceB.p256dh, auth: deviceB.auth },
        }),
      },
      vapidEnv
    )

    // Obtener actividad de hoy y asegurar formato text_only para prueba determinista
    const todayRes = await app.request(
      '/api/activities/today',
      { headers: { Cookie: userA.cookie } },
      vapidEnv
    )
    const today = (await todayRes.json()) as { id: string }

    const db = getDb(baseEnv.DATABASE_URL)
    await db
      .update(dailyActivities)
      .set({ responseType: 'text_only' })
      .where(eq(dailyActivities.id, today.id))

    const pushCalls: Array<{ url: string; body: Uint8Array }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      pushCalls.push({ url: String(input), body: init?.body as Uint8Array })
      return new Response(null, { status: 201 })
    })

    const secretAnswerA = 'SECRETO_CONFIDENCIAL_DE_ANA_999'
    const mutationA = crypto.randomUUID()

    // 1) Ana responde primero -> Emilio recibe aviso sin ninguna fuga del texto secreto
    const submitA = await app.request(
      `/api/activities/${today.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          activity_id: today.id,
          client_mutation_id: mutationA,
          content: secretAnswerA,
        }),
      },
      vapidEnv
    )
    expect(submitA.status).toBe(200)
    expect(pushCalls).toHaveLength(1)
    expect(pushCalls[0].url).toBe(deviceB.endpoint)

    const payloadToB = await decryptPushBody(pushCalls[0].body, deviceB)
    expect(payloadToB).toEqual({
      title: 'LazUs',
      body: '✨ Ana ya respondió al reto de hoy. ¡Descubre qué dijo!',
      tag: 'lazus-daily-activity',
      renotify: true,
      url: '/',
    })
    expect(JSON.stringify(payloadToB)).not.toContain(secretAnswerA)

    // Replay idempotente de Ana -> CERO notificaciones duplicadas
    const replayA = await app.request(
      `/api/activities/${today.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          activity_id: today.id,
          client_mutation_id: mutationA,
          content: secretAnswerA,
        }),
      },
      vapidEnv
    )
    expect(replayA.status).toBe(200)
    expect(pushCalls).toHaveLength(1)

    // 2) Emilio responde segundo (pasa a revealed) -> Ana recibe aviso de revelación sin texto secreto
    const secretAnswerB = 'SECRETO_CONFIDENCIAL_DE_EMILIO_777'
    const submitB = await app.request(
      `/api/activities/${today.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({
          activity_id: today.id,
          client_mutation_id: crypto.randomUUID(),
          content: secretAnswerB,
        }),
      },
      vapidEnv
    )
    expect(submitB.status).toBe(200)
    expect(pushCalls).toHaveLength(2)
    expect(pushCalls[1].url).toBe(deviceA.endpoint)

    const payloadToA = await decryptPushBody(pushCalls[1].body, deviceA)
    expect(payloadToA).toEqual({
      title: 'LazUs',
      body: '🎉 ¡Ambos respondieron hoy! Toca para revelar',
      tag: 'lazus-daily-activity',
      renotify: true,
      url: '/',
    })
    expect(JSON.stringify(payloadToA)).not.toContain(secretAnswerB)
  })
})
