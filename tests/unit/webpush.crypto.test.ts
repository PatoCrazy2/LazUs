import { describe, expect, it } from 'vitest'
import {
  PushSubscriptionInputSchema,
  SafePushPayloadSchema,
  TestPushInputSchema,
} from '../../shared'
import {
  buildWebPushRequest,
  createVapidAuthorizationHeader,
  decodeBase64Url,
  encodeBase64Url,
  encryptWebPushPayload,
  generateVapidKeyPair,
  verifyVapidJwt,
} from '../../server/features/notifications/webpush.crypto'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Implementación independiente de descifrado RFC 8291 + RFC 8188 (lado User Agent / navegador)
 * usando HMAC-SHA-256 explícito (RFC 5869 Extract + Expand manual) para verificar byte a byte
 * la interoperabilidad con APNs, FCM y Autopush.
 */
async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new Uint8Array(data))
  return new Uint8Array(mac)
}

async function hkdfExpandSingleBlock(
  prk: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array<ArrayBuffer>> {
  const input = new Uint8Array(info.length + 1)
  input.set(info, 0)
  input[info.length] = 0x01
  const okm = await hmacSha256(prk, input)
  return new Uint8Array(okm.slice(0, length))
}

async function decryptAsUserAgentRfc8291(
  body: Uint8Array,
  uaKeyPair: CryptoKeyPair,
  authSecret: Uint8Array
): Promise<string> {
  // 1. Parsear cabecera aes128gcm (RFC 8188 §2.1): salt(16) || rs(4 BE) || idlen(1) || as_pub(idlen)
  const salt = body.subarray(0, 16)
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  const rs = view.getUint32(16, false)
  expect(rs).toBe(4096)

  const idlen = body[20]
  expect(idlen).toBe(65)

  const asPublicBytes = body.subarray(21, 21 + idlen)
  expect(asPublicBytes[0]).toBe(0x04)

  const ciphertext = body.subarray(21 + idlen)

  // 2. ECDH desde el lado del dispositivo receptor (UA private + AS ephemeral public)
  const asPublicKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(asPublicBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asPublicKey }, uaKeyPair.privateKey, 256)
  )

  const uaPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeyPair.publicKey))

  // 3. RFC 8291 §3.3: PRK_key = HMAC-SHA-256(auth_secret, ecdh_secret), IKM = HKDF-Expand(PRK_key, "WebPush: info\0" || ua_pub || as_pub, 32)
  const prkKey = await hmacSha256(authSecret, ecdhSecret)
  const prefix = encoder.encode('WebPush: info\0')
  const keyInfo = new Uint8Array(prefix.length + uaPublicBytes.length + asPublicBytes.length)
  keyInfo.set(prefix, 0)
  keyInfo.set(uaPublicBytes, prefix.length)
  keyInfo.set(asPublicBytes, prefix.length + uaPublicBytes.length)
  const ikm = await hkdfExpandSingleBlock(prkKey, keyInfo, 32)

  // 4. RFC 8291 §3.4: PRK = HMAC-SHA-256(salt, IKM), CEK (16B), NONCE (12B)
  const prk = await hmacSha256(salt, ikm)
  const cek = await hkdfExpandSingleBlock(prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdfExpandSingleBlock(prk, encoder.encode('Content-Encoding: nonce\0'), 12)

  // 5. Descifrar AES-128-GCM y verificar delimitador de registro final 0x02
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const padded = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      aesKey,
      new Uint8Array(ciphertext)
    )
  )

  // Eliminar ceros de relleno finales (si los hubiera) y comprobar delimitador 0x02
  let end = padded.length - 1
  while (end >= 0 && padded[end] === 0x00) {
    end--
  }
  expect(padded[end]).toBe(0x02)

  return decoder.decode(padded.subarray(0, end))
}

async function createMockSubscriber() {
  const uaKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  const uaPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeyPair.publicKey))
  const authSecret = crypto.getRandomValues(new Uint8Array(16))

  return {
    uaKeyPair,
    authSecret,
    p256dh: encodeBase64Url(uaPubRaw),
    auth: encodeBase64Url(authSecret),
  }
}

describe('Web Push Crypto Engine (VAPID RFC 8292 + AES-128-GCM RFC 8291)', () => {
  it('genera claves VAPID P-256 válidas en base64url (65B pública sin comprimir, 32B privada)', async () => {
    const pair = await generateVapidKeyPair()

    const pubBytes = decodeBase64Url(pair.publicKey)
    const privBytes = decodeBase64Url(pair.privateKey)

    expect(pubBytes.byteLength).toBe(65)
    expect(pubBytes[0]).toBe(0x04)
    expect(privBytes.byteLength).toBe(32)
    expect(pair.publicKey).not.toMatch(/[+/=]/)
    expect(pair.privateKey).not.toMatch(/[+/=]/)
  })

  it('firma y verifica un JWT VAPID ES256 válido conforme a RFC 8292', async () => {
    const vapidKeys = await generateVapidKeyPair()
    const fixedNowMs = Date.UTC(2026, 10, 26, 12, 0, 0)

    const { authorization, jwt, publicKey } = await createVapidAuthorizationHeader({
      endpoint: 'https://web.push.apple.com/QHxSampleEndpointToken123',
      vapid: {
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
        subject: 'mailto:hola@lazus.app',
      },
      expirationSeconds: 43200,
      nowMs: fixedNowMs,
    })

    expect(authorization).toBe(`vapid t=${jwt}, k=${publicKey}`)

    const verified = await verifyVapidJwt(jwt, vapidKeys.publicKey)
    expect(verified.valid).toBe(true)
    expect(verified.header).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(verified.payload).toEqual({
      aud: 'https://web.push.apple.com',
      exp: Math.floor(fixedNowMs / 1000) + 43200,
      sub: 'mailto:hola@lazus.app',
    })

    // Otra clave pública no debe verificar el JWT
    const otherKeys = await generateVapidKeyPair()
    const invalidCheck = await verifyVapidJwt(jwt, otherKeys.publicKey)
    expect(invalidCheck.valid).toBe(false)
  })

  it('rechaza endpoints no-HTTPS o VAPID_SUBJECT inválido', async () => {
    const vapidKeys = await generateVapidKeyPair()

    await expect(
      createVapidAuthorizationHeader({
        endpoint: 'http://insecure.push.example/token',
        vapid: { ...vapidKeys, subject: 'mailto:hola@lazus.app' },
      })
    ).rejects.toThrow(/HTTPS/i)

    await expect(
      createVapidAuthorizationHeader({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        vapid: { ...vapidKeys, subject: 'hola@lazus.app' },
      })
    ).rejects.toThrow(/VAPID_SUBJECT/i)
  })

  it('cifra payload UTF-8 con emojis conforme a RFC 8291 (aes128gcm) y descifra idéntico desde un UA independiente', async () => {
    const subscriber = await createMockSubscriber()
    const originalMessage = JSON.stringify({
      title: 'LazUs',
      body: '❤️ Ana te envió un toque',
      tag: 'lazus-affection',
      renotify: true,
      url: '/',
    })

    const encrypted = await encryptWebPushPayload(originalMessage, {
      p256dh: subscriber.p256dh,
      auth: subscriber.auth,
    })

    // Cabecera (86B) + plaintext + 0x02 (1B) + GCM tag (16B)
    const plaintextLen = encoder.encode(originalMessage).byteLength
    expect(encrypted.byteLength).toBe(86 + plaintextLen + 1 + 16)

    const decrypted = await decryptAsUserAgentRfc8291(
      encrypted,
      subscriber.uaKeyPair,
      subscriber.authSecret
    )
    expect(decrypted).toBe(originalMessage)
  })

  it('detecta manipulación de ciphertext (integridad AES-128-GCM)', async () => {
    const subscriber = await createMockSubscriber()
    const encrypted = await encryptWebPushPayload('{"title":"LazUs"}', {
      p256dh: subscriber.p256dh,
      auth: subscriber.auth,
    })

    // Alteramos 1 bit del ciphertext
    encrypted[encrypted.byteLength - 1] ^= 0x01

    await expect(
      decryptAsUserAgentRfc8291(encrypted, subscriber.uaKeyPair, subscriber.authSecret)
    ).rejects.toThrow()
  })

  it('construye petición completa HTTP lista para fetch y hace cumplir Zero-Leak estricto', async () => {
    const vapidKeys = await generateVapidKeyPair()
    const subscriber = await createMockSubscriber()

    const req = await buildWebPushRequest({
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
        p256dh: subscriber.p256dh,
        auth: subscriber.auth,
      },
      payload: {
        title: 'LazUs',
        body: '✨ Emilio ya respondió al reto de hoy. ¡Descubre qué dijo!',
        tag: 'lazus-daily-activity',
        renotify: true,
        url: '/',
      },
      vapid: {
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
        subject: 'https://lazus.app',
      },
      ttlSeconds: 3600,
      urgency: 'high',
    })

    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://fcm.googleapis.com/fcm/send/device-1')
    expect(req.headers['Content-Encoding']).toBe('aes128gcm')
    expect(req.headers['Content-Type']).toBe('application/octet-stream')
    expect(req.headers['Content-Length']).toBe(String(req.body.byteLength))
    expect(req.headers.TTL).toBe('3600')
    expect(req.headers.Urgency).toBe('high')
    expect(req.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/)

    const decryptedJson = JSON.parse(
      await decryptAsUserAgentRfc8291(req.body, subscriber.uaKeyPair, subscriber.authSecret)
    )
    expect(decryptedJson).toEqual({
      title: 'LazUs',
      body: '✨ Emilio ya respondió al reto de hoy. ¡Descubre qué dijo!',
      tag: 'lazus-daily-activity',
      renotify: true,
      url: '/',
    })

    // Zero-Leak: rechaza cualquier intento de colar campos extra (ej. content o media_key)
    await expect(
      buildWebPushRequest({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
          p256dh: subscriber.p256dh,
          auth: subscriber.auth,
        },
        payload: {
          title: 'LazUs',
          body: '✨ Tu pareja respondió',
          tag: 'lazus-daily-activity',
          renotify: true,
          url: '/',
          // @ts-expect-error prueba deliberada de fuga de datos
          content: 'Respuesta secreta prohibida',
        },
        vapid: {
          publicKey: vapidKeys.publicKey,
          privateKey: vapidKeys.privateKey,
          subject: 'https://lazus.app',
        },
      })
    ).rejects.toThrow()
  })
})

describe('Contratos Zod de Notificaciones (Zero-Leak & Validación)', () => {
  it('valida una suscripción Push HTTPS válida y rechaza HTTP o llaves de longitud inválida', async () => {
    const subscriber = await createMockSubscriber()

    const valid = PushSubscriptionInputSchema.safeParse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: {
        p256dh: subscriber.p256dh,
        auth: subscriber.auth,
      },
      user_agent: 'Safari iOS Standalone',
    })
    expect(valid.success).toBe(true)

    const httpEndpoint = PushSubscriptionInputSchema.safeParse({
      endpoint: 'http://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: subscriber.p256dh, auth: subscriber.auth },
    })
    expect(httpEndpoint.success).toBe(false)

    const badAuthLen = PushSubscriptionInputSchema.safeParse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: subscriber.p256dh, auth: 'c2hvcnQ' },
    })
    expect(badAuthLen.success).toBe(false)
  })

  it('valida SafePushPayloadSchema con strict() y bloquea URLs externas', () => {
    expect(
      SafePushPayloadSchema.safeParse({
        title: 'LazUs',
        body: '❤️ Te enviaron un toque',
        tag: 'lazus-affection',
        renotify: true,
        url: '/',
      }).success
    ).toBe(true)

    expect(
      SafePushPayloadSchema.safeParse({
        title: 'LazUs',
        body: '❤️ Te enviaron un toque',
        tag: 'lazus-affection',
        renotify: true,
        url: 'https://evil.example/phish',
      }).success
    ).toBe(false)

    expect(
      SafePushPayloadSchema.safeParse({
        title: 'LazUs',
        body: '❤️ Te enviaron un toque',
        tag: 'lazus-affection',
        renotify: true,
        url: '//evil.example',
      }).success
    ).toBe(false)

    expect(
      TestPushInputSchema.parse({
        endpoint: 'https://web.push.apple.com/token123',
      })
    ).toEqual({
      endpoint: 'https://web.push.apple.com/token123',
      delay_seconds: 3,
    })
  })
})
