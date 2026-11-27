import { SafePushPayloadSchema, type SafePushPayload } from '../../../shared'

/**
 * Motor Web Push 100% Web Crypto API (Cloudflare Workers compatible, $0/mes).
 *
 * Implementa:
 * - RFC 8292: Voluntary Application Server Identification (VAPID) con ES256 (ECDSA P-256 + SHA-256).
 * - RFC 8291 + RFC 8188: Cifrado de mensajes Web Push (`Content-Encoding: aes128gcm`)
 *   mediante ECDH P-256 efímero, HKDF-SHA-256 y AES-128-GCM.
 */

const textEncoder = new TextEncoder()

const RECORD_SIZE = 4096
const SALT_LENGTH = 16
const AUTH_SECRET_LENGTH = 16
const P256_PUBLIC_KEY_LENGTH = 65
const P256_PRIVATE_KEY_LENGTH = 32
const AES_GCM_TAG_LENGTH = 16
const AES128GCM_HEADER_LENGTH = SALT_LENGTH + 4 + 1 + P256_PUBLIC_KEY_LENGTH // 86 bytes
const MAX_PLAINTEXT_BYTES = RECORD_SIZE - AES128GCM_HEADER_LENGTH - AES_GCM_TAG_LENGTH - 1 // 3993 bytes

const WEBPUSH_INFO_PREFIX = textEncoder.encode('WebPush: info\0')
const CEK_INFO = textEncoder.encode('Content-Encoding: aes128gcm\0')
const NONCE_INFO = textEncoder.encode('Content-Encoding: nonce\0')

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export interface WebPushSubscriptionTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export type WebPushUrgency = 'very-low' | 'low' | 'normal' | 'high'

export interface PreparedWebPushRequest {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: Uint8Array<ArrayBuffer>
}

export interface EncryptWebPushOptions {
  /** Override opcional para pruebas deterministas (debe tener 16 bytes) */
  salt?: Uint8Array
  /** Override opcional del par efímero AS ECDH P-256 para pruebas deterministas */
  ephemeralKeyPair?: CryptoKeyPair
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('Cadena base64/base64url inválida')
  }
  const padLength = (4 - (normalized.length % 4)) % 4
  const padded = normalized + '='.repeat(padLength)
  const binary = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)
  return copy
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0
  for (const arr of arrays) {
    total += arr.byteLength
  }
  const out = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const arr of arrays) {
    out.set(arr, offset)
    offset += arr.byteLength
  }
  return out
}

function assertValidP256PublicKey(bytes: Uint8Array, label: string): void {
  if (bytes.byteLength !== P256_PUBLIC_KEY_LENGTH || bytes[0] !== 0x04) {
    throw new Error(`${label} debe ser una clave pública P-256 sin comprimir (65 bytes, prefijo 0x04)`)
  }
}

function assertValidP256PrivateKey(bytes: Uint8Array): void {
  if (bytes.byteLength !== P256_PRIVATE_KEY_LENGTH) {
    throw new Error('La clave privada VAPID debe tener exactamente 32 bytes')
  }
}

function assertValidVapidSubject(subject: string): void {
  const trimmed = subject.trim()
  if (!trimmed.startsWith('mailto:') && !trimmed.startsWith('https://')) {
    throw new Error('VAPID_SUBJECT debe comenzar con "mailto:" o "https://"')
  }
}

/**
 * Convierte una firma ECDSA en formato DER a IEEE P1363 (64 bytes r || s) si el runtime devolviera DER.
 */
function ensureP1363Signature(signature: Uint8Array): Uint8Array<ArrayBuffer> {
  if (signature.byteLength === 64) {
    return toArrayBufferView(signature)
  }

  if (signature[0] !== 0x30) {
    throw new Error(`Formato de firma ECDSA inesperado (${signature.byteLength} bytes)`)
  }

  let offset = 2
  if (signature[1] & 0x80) {
    offset = 2 + (signature[1] & 0x7f)
  }

  if (signature[offset] !== 0x02) {
    throw new Error('Firma ECDSA DER inválida (falta entero R)')
  }
  const rLen = signature[offset + 1]
  const rStart = offset + 2
  const rSlice = signature.subarray(rStart, rStart + rLen)

  const sTagOffset = rStart + rLen
  if (signature[sTagOffset] !== 0x02) {
    throw new Error('Firma ECDSA DER inválida (falta entero S)')
  }
  const sLen = signature[sTagOffset + 1]
  const sStart = sTagOffset + 2
  const sSlice = signature.subarray(sStart, sStart + sLen)

  const out = new Uint8Array(new ArrayBuffer(64))
  const rTrimmed = rSlice.length > 32 ? rSlice.subarray(rSlice.length - 32) : rSlice
  const sTrimmed = sSlice.length > 32 ? sSlice.subarray(sSlice.length - 32) : sSlice
  out.set(rTrimmed, 32 - rTrimmed.length)
  out.set(sTrimmed, 64 - sTrimmed.length)
  return out
}

/**
 * Genera un par de claves VAPID P-256 nuevo en formato base64url estándar:
 * - publicKey: 65 bytes sin comprimir (0x04 || x || y)
 * - privateKey: 32 bytes escalar d
 */
export async function generateVapidKeyPair(): Promise<{
  publicKey: string
  privateKey: string
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )

  const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
  const jwkPrivate = await crypto.subtle.exportKey('jwk', keyPair.privateKey)

  if (!jwkPrivate.d) {
    throw new Error('No se pudo exportar el escalar privado P-256')
  }

  assertValidP256PublicKey(rawPublic, 'VAPID publicKey')
  const rawPrivate = decodeBase64Url(jwkPrivate.d)
  assertValidP256PrivateKey(rawPrivate)

  return {
    publicKey: encodeBase64Url(rawPublic),
    privateKey: encodeBase64Url(rawPrivate),
  }
}

async function importVapidSigningKey(
  publicKeyBase64Url: string,
  privateKeyBase64Url: string
): Promise<CryptoKey> {
  const pubBytes = decodeBase64Url(publicKeyBase64Url)
  const privBytes = decodeBase64Url(privateKeyBase64Url)
  assertValidP256PublicKey(pubBytes, 'VAPID_PUBLIC_KEY')
  assertValidP256PrivateKey(privBytes)

  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: encodeBase64Url(pubBytes.subarray(1, 33)),
    y: encodeBase64Url(pubBytes.subarray(33, 65)),
    d: encodeBase64Url(privBytes),
    ext: true,
  }

  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/**
 * Construye el JWT VAPID firmado con ES256 y la cabecera `Authorization` conforme a RFC 8292.
 */
export async function createVapidAuthorizationHeader(params: {
  endpoint: string
  vapid: VapidConfig
  expirationSeconds?: number
  nowMs?: number
}): Promise<{ authorization: string; jwt: string; publicKey: string }> {
  const parsedUrl = new URL(params.endpoint)
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('El endpoint Web Push debe usar HTTPS')
  }

  assertValidVapidSubject(params.vapid.subject)

  // RFC 8292 + APNs requieren exp <= 24h desde ahora
  const expDuration = Math.min(Math.max(params.expirationSeconds ?? 12 * 3600, 60), 24 * 3600)
  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1000)

  const headerJson = JSON.stringify({ typ: 'JWT', alg: 'ES256' })
  const claimsJson = JSON.stringify({
    aud: parsedUrl.origin,
    exp: nowSec + expDuration,
    sub: params.vapid.subject.trim(),
  })

  const signingInput = `${encodeBase64Url(textEncoder.encode(headerJson))}.${encodeBase64Url(
    textEncoder.encode(claimsJson)
  )}`

  const signingKey = await importVapidSigningKey(params.vapid.publicKey, params.vapid.privateKey)
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    textEncoder.encode(signingInput)
  )

  const p1363Signature = ensureP1363Signature(new Uint8Array(signatureBuffer))
  const jwt = `${signingInput}.${encodeBase64Url(p1363Signature)}`

  // Normalizamos a base64url sin padding
  const normalizedPublicKey = encodeBase64Url(decodeBase64Url(params.vapid.publicKey))

  return {
    authorization: `vapid t=${jwt}, k=${normalizedPublicKey}`,
    jwt,
    publicKey: normalizedPublicKey,
  }
}

/**
 * Verifica un JWT VAPID firmado con ES256 usando la clave pública P-256 (útil para tests y auditoría).
 */
export async function verifyVapidJwt(
  jwt: string,
  publicKeyBase64Url: string
): Promise<{ valid: boolean; header: Record<string, unknown>; payload: Record<string, unknown> }> {
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw new Error('Formato JWT inválido')
  }

  const [headerPart, payloadPart, sigPart] = parts
  const pubBytes = decodeBase64Url(publicKeyBase64Url)
  assertValidP256PublicKey(pubBytes, 'VAPID publicKey')

  const verifyKey = await crypto.subtle.importKey(
    'raw',
    pubBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )

  const sigBytes = decodeBase64Url(sigPart)
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    verifyKey,
    sigBytes,
    textEncoder.encode(`${headerPart}.${payloadPart}`)
  )

  const decoder = new TextDecoder()
  const header = JSON.parse(decoder.decode(decodeBase64Url(headerPart))) as Record<string, unknown>
  const payload = JSON.parse(decoder.decode(decodeBase64Url(payloadPart))) as Record<
    string,
    unknown
  >

  return { valid, header, payload }
}

/**
 * Cifra un payload UTF-8 siguiendo estrictamente RFC 8291 + RFC 8188 (`aes128gcm`).
 *
 * Estructura binaria resultante:
 * `[salt (16B)] [rs=4096 (4B BE)] [idlen=65 (1B)] [as_public (65B)] [AES-128-GCM(plaintext || 0x02)]`
 */
export async function encryptWebPushPayload(
  plaintext: Uint8Array | string,
  subscriberKeys: { p256dh: string; auth: string },
  options: EncryptWebPushOptions = {}
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintextBytes =
    typeof plaintext === 'string' ? textEncoder.encode(plaintext) : toArrayBufferView(plaintext)

  if (plaintextBytes.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error(
      `El payload Web Push excede el límite RFC 8291 (${plaintextBytes.byteLength} > ${MAX_PLAINTEXT_BYTES} bytes)`
    )
  }

  const uaPublicBytes = decodeBase64Url(subscriberKeys.p256dh)
  assertValidP256PublicKey(uaPublicBytes, 'p256dh')

  const authSecretBytes = decodeBase64Url(subscriberKeys.auth)
  if (authSecretBytes.byteLength !== AUTH_SECRET_LENGTH) {
    throw new Error('La clave auth de la suscripción debe tener exactamente 16 bytes')
  }

  const salt = options.salt
    ? toArrayBufferView(options.salt)
    : crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_LENGTH)))

  if (salt.byteLength !== SALT_LENGTH) {
    throw new Error('El salt RFC 8188 debe tener exactamente 16 bytes')
  }

  const ephemeralKeyPair =
    options.ephemeralKeyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']))

  const asPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey)
  )
  assertValidP256PublicKey(asPublicBytes, 'as_public')

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // 1. Secreto compartido ECDH P-256 (32 bytes)
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      ephemeralKeyPair.privateKey,
      256
    )
  )

  // 2. Derivación IKM (RFC 8291 §3.3): HKDF-SHA-256(salt=auth, IKM=ecdh_secret, info="WebPush: info\0" || ua_pub || as_pub, L=32)
  const ecdhHkdfKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits'])
  const keyInfo = concatBytes(WEBPUSH_INFO_PREFIX, uaPublicBytes, asPublicBytes)
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecretBytes, info: keyInfo },
      ecdhHkdfKey,
      256
    )
  )

  // 3. Derivación CEK (16 bytes) y Nonce (12 bytes) (RFC 8291 §3.4 / RFC 8188 §2.2-2.3)
  const ikmHkdfKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const [cekBuffer, nonceBuffer] = await Promise.all([
    crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: CEK_INFO }, ikmHkdfKey, 128),
    crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: NONCE_INFO }, ikmHkdfKey, 96),
  ])

  const aesKey = await crypto.subtle.importKey('raw', cekBuffer, 'AES-GCM', false, ['encrypt'])

  // 4. Padding final de registro único: plaintext || 0x02
  const paddedPlaintext = concatBytes(plaintextBytes, new Uint8Array([0x02]))

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(nonceBuffer), tagLength: 128 },
      aesKey,
      paddedPlaintext
    )
  )

  // 5. Cabecera binaria aes128gcm: salt (16) || rs (4 BE) || idlen (1 = 65) || as_public (65)
  const header = new Uint8Array(new ArrayBuffer(AES128GCM_HEADER_LENGTH))
  header.set(salt, 0)
  const headerView = new DataView(header.buffer)
  headerView.setUint32(SALT_LENGTH, RECORD_SIZE, false) // big-endian
  header[SALT_LENGTH + 4] = P256_PUBLIC_KEY_LENGTH
  header.set(asPublicBytes, SALT_LENGTH + 5)

  return concatBytes(header, ciphertext)
}

/**
 * Construye una petición HTTP lista para enviarse vía `fetch()` al Push Service (APNs / FCM / Autopush).
 * Valida estrictamente el payload contra `SafePushPayloadSchema` para garantizar Zero-Leak.
 */
export async function buildWebPushRequest(params: {
  subscription: WebPushSubscriptionTarget
  payload: SafePushPayload
  vapid: VapidConfig
  ttlSeconds?: number
  urgency?: WebPushUrgency
  nowMs?: number
}): Promise<PreparedWebPushRequest> {
  // Validación estricta Zero-Leak: rechaza cualquier campo fuera de {title, body, tag, renotify, url}
  const safePayload = SafePushPayloadSchema.parse(params.payload)
  const ttlSeconds = Math.max(0, Math.floor(params.ttlSeconds ?? 86400))
  const urgency = params.urgency ?? 'high'

  const [vapidHeader, encryptedBody] = await Promise.all([
    createVapidAuthorizationHeader({
      endpoint: params.subscription.endpoint,
      vapid: params.vapid,
      nowMs: params.nowMs,
    }),
    encryptWebPushPayload(JSON.stringify(safePayload), {
      p256dh: params.subscription.p256dh,
      auth: params.subscription.auth,
    }),
  ])

  return {
    url: params.subscription.endpoint,
    method: 'POST',
    headers: {
      Authorization: vapidHeader.authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(encryptedBody.byteLength),
      TTL: String(ttlSeconds),
      Urgency: urgency,
    },
    body: encryptedBody,
  }
}
