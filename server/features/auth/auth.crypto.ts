/**
 * Módulo de Criptografía Web Crypto estándar.
 * Totalmente compatible con Cloudflare Workers, Node.js 20+ y navegadores modernos.
 */

// Comparación en tiempo constante para mitigar ataques de temporización (timing attacks)
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// Convertir ArrayBuffer a cadena hexadecimal
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Convertir cadena hexadecimal a Uint8Array
export function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

// Generar bytes aleatorios criptográficamente seguros
export function getRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return bytes
}

// Generar token aleatorio en formato hexadecimal seguro (longitud = bytes * 2)
export function generateRandomToken(bytes = 32): string {
  return bufferToHex(getRandomBytes(bytes).buffer)
}

// Generar hash SHA-256 de una cadena
export async function sha256Hash(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return bufferToHex(digest)
}

// Base64URL encoding y decoding para PKCE y tokens de estado
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const PBKDF2_ITERATIONS = 100000
const PBKDF2_KEY_LEN = 32 // 256 bits

/**
 * Hashear contraseña utilizando PBKDF2 con salt criptográfico de 16 bytes y 100,000 iteraciones.
 * Formato resultante: pbkdf2:sha256:100000:<salt_hex>:<hash_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = getRandomBytes(16)
  const encoder = new TextEncoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_KEY_LEN * 8
  )

  const saltHex = bufferToHex(salt.buffer)
  const hashHex = bufferToHex(derivedBits)

  return `pbkdf2:sha256:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`
}

/**
 * Verificar contraseña contra el hash almacenado en formato PBKDF2.
 * Invariante canónica (§2.9): Tolerancia estricta a password_hash = NULL / undefined.
 * Si storedHash es nulo o inválido, retorna false de inmediato sin arrojar excepción 500.
 */
export async function verifyPassword(
  password: string,
  storedHash?: string | null
): Promise<boolean> {
  if (!storedHash || typeof storedHash !== 'string') {
    return false
  }

  const parts = storedHash.split(':')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    return false
  }

  const iterations = parseInt(parts[2], 10)
  const saltHex = parts[3]
  const originalHashHex = parts[4]

  if (isNaN(iterations) || !saltHex || !originalHashHex) {
    return false
  }

  const salt = hexToBuffer(saltHex)
  const encoder = new TextEncoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_KEY_LEN * 8
  )

  const computedHashHex = bufferToHex(derivedBits)
  return timingSafeEqual(computedHashHex, originalHashHex)
}

/**
 * Firma HMAC-SHA256 para estado de OAuth (OAuth State Signature)
 */
export async function signOAuthState(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder()
  const payloadStr = JSON.stringify(payload)
  const payloadBase64 = base64UrlEncode(encoder.encode(payloadStr))

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payloadBase64)
  )

  const signatureHex = bufferToHex(signatureBuffer)
  return `${payloadBase64}.${signatureHex}`
}

export async function verifyOAuthState<T = Record<string, unknown>>(
  signedState: string,
  secret: string
): Promise<T | null> {
  if (!signedState || !signedState.includes('.')) {
    return null
  }

  const [payloadBase64, providedSignatureHex] = signedState.split('.')
  if (!payloadBase64 || !providedSignatureHex) {
    return null
  }

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const expectedSignatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payloadBase64)
  )

  const expectedSignatureHex = bufferToHex(expectedSignatureBuffer)
  if (!timingSafeEqual(providedSignatureHex, expectedSignatureHex)) {
    return null
  }

  try {
    const jsonStr = new TextDecoder().decode(base64UrlDecode(payloadBase64))
    return JSON.parse(jsonStr) as T
  } catch {
    return null
  }
}

/**
 * Generador PKCE para Google OAuth 2.0 (RFC 7636)
 */
export async function generatePkcePair(): Promise<{
  codeVerifier: string
  codeChallenge: string
}> {
  const randomBytes = getRandomBytes(32)
  const codeVerifier = base64UrlEncode(randomBytes)

  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier))
  const codeChallenge = base64UrlEncode(new Uint8Array(digest))

  return { codeVerifier, codeChallenge }
}

export async function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string
): Promise<boolean> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier))
  const computedChallenge = base64UrlEncode(new Uint8Array(digest))
  return timingSafeEqual(computedChallenge, codeChallenge)
}
