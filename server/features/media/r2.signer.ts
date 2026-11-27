import { UPLOAD_URL_TTL_SECONDS, VIEW_URL_TTL_SECONDS } from '../../../shared'

export interface SignedUrlResult {
  url: string
  method: 'PUT' | 'GET'
  headers: Record<string, string>
  expiresIn: number
  expiresAt: string
  mode: 'r2' | 'local-dev'
}

export interface MediaStorageSigner {
  readonly mode: 'r2' | 'local-dev'
  createUploadUrl(params: {
    key: string
    contentType: string
    expiresInSeconds?: number
    now?: Date
  }): Promise<SignedUrlResult>
  createViewUrl(params: {
    key: string
    expiresInSeconds?: number
    now?: Date
  }): Promise<SignedUrlResult>
}

export interface R2SignerConfig {
  accountId: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
}

export interface MediaSignerEnv {
  ENVIRONMENT?: string
  APP_BASE_URL?: string
  AUTH_SECRET?: string
  R2_ACCOUNT_ID?: string
  R2_BUCKET_NAME?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
}

const textEncoder = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0')
  }
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input))
  return toHex(new Uint8Array(digest))
}

async function hmacSha256(key: Uint8Array<ArrayBuffer> | string, data: string): Promise<Uint8Array<ArrayBuffer>> {
  const rawKey: Uint8Array<ArrayBuffer> =
    typeof key === 'string' ? textEncoder.encode(key) : key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(data))
  return new Uint8Array(sig)
}

/**
 * Codificación RFC 3986 estricta exigida por AWS Signature Version 4.
 */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function encodeS3Path(bucketName: string, key: string): string {
  const cleanKey = key.replace(/^\/+/, '')
  const segments = [bucketName, ...cleanKey.split('/')].map(encodeRfc3986)
  return `/${segments.join('/')}`
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '') // YYYYMMDDTHHMMSSZ
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  }
}

function assertValidKey(key: string): void {
  if (!key || key.includes('..') || key.startsWith('/')) {
    throw new Error('Clave de objeto R2 inválida')
  }
}

function assertUploadTtl(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > UPLOAD_URL_TTL_SECONDS) {
    throw new RangeError(
      `El TTL de subida debe estar entre 1 y ${UPLOAD_URL_TTL_SECONDS} segundos (<= 10 min)`
    )
  }
}

function assertViewTtl(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > VIEW_URL_TTL_SECONDS) {
    throw new RangeError(
      `El TTL de visualización debe estar entre 1 y ${VIEW_URL_TTL_SECONDS} segundos (<= 15 min)`
    )
  }
}

/**
 * Firmador AWS Signature V4 puro usando Web Crypto API para Cloudflare R2.
 * Cero dependencias externas, compatible con Cloudflare Workers ($0 tier).
 */
export class R2SigV4Signer implements MediaStorageSigner {
  readonly mode = 'r2' as const
  private readonly host: string

  constructor(private readonly config: R2SignerConfig) {
    this.host = `${config.accountId}.r2.cloudflarestorage.com`
  }

  async createUploadUrl(params: {
    key: string
    contentType: string
    expiresInSeconds?: number
    now?: Date
  }): Promise<SignedUrlResult> {
    assertValidKey(params.key)
    const expiresIn = params.expiresInSeconds ?? UPLOAD_URL_TTL_SECONDS
    assertUploadTtl(expiresIn)

    const now = params.now ?? new Date()
    const normalizedContentType = params.contentType.split(';')[0]?.trim().toLowerCase() || params.contentType
    const url = await this.signPresignedUrl({
      method: 'PUT',
      key: params.key,
      expiresIn,
      now,
      signedHeaders: {
        'content-type': normalizedContentType,
        host: this.host,
      },
    })

    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': normalizedContentType,
      },
      expiresIn,
      expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
      mode: 'r2',
    }
  }

  async createViewUrl(params: {
    key: string
    expiresInSeconds?: number
    now?: Date
  }): Promise<SignedUrlResult> {
    assertValidKey(params.key)
    const expiresIn = params.expiresInSeconds ?? VIEW_URL_TTL_SECONDS
    assertViewTtl(expiresIn)

    const now = params.now ?? new Date()
    const url = await this.signPresignedUrl({
      method: 'GET',
      key: params.key,
      expiresIn,
      now,
      signedHeaders: {
        host: this.host,
      },
    })

    return {
      url,
      method: 'GET',
      headers: {},
      expiresIn,
      expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
      mode: 'r2',
    }
  }

  private async signPresignedUrl(params: {
    method: 'PUT' | 'GET'
    key: string
    expiresIn: number
    now: Date
    signedHeaders: Record<string, string>
  }): Promise<string> {
    const region = 'auto'
    const service = 's3'
    const { amzDate, dateStamp } = formatAmzDate(params.now)
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`

    const sortedHeaderEntries = Object.entries(params.signedHeaders).sort(([a], [b]) =>
      a.localeCompare(b)
    )
    const canonicalHeaders = sortedHeaderEntries.map(([k, v]) => `${k}:${v}\n`).join('')
    const signedHeadersList = sortedHeaderEntries.map(([k]) => k).join(';')

    const queryParams: Array<[string, string]> = [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', `${this.config.accessKeyId}/${credentialScope}`],
      ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', String(params.expiresIn)],
      ['X-Amz-SignedHeaders', signedHeadersList],
    ]
    queryParams.sort(([a], [b]) => a.localeCompare(b))

    const canonicalQueryString = queryParams
      .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
      .join('&')

    const canonicalUri = encodeS3Path(this.config.bucketName, params.key)
    const canonicalRequest = [
      params.method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeadersList,
      'UNSIGNED-PAYLOAD',
    ].join('\n')

    const canonicalRequestHash = await sha256Hex(canonicalRequest)
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n')

    const kDate = await hmacSha256(`AWS4${this.config.secretAccessKey}`, dateStamp)
    const kRegion = await hmacSha256(kDate, region)
    const kService = await hmacSha256(kRegion, service)
    const kSigning = await hmacSha256(kService, 'aws4_request')
    const signatureBytes = await hmacSha256(kSigning, stringToSign)
    const signature = toHex(signatureBytes)

    return `https://${this.host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`
  }
}

// --- Adaptador Local Exclusivo para Desarrollo y Tests ---

export interface LocalDevStoredObject {
  body: Uint8Array
  contentType: string
  updatedAt: number
}

const localDevObjects = new Map<string, LocalDevStoredObject>()

export const localDevMediaStore = {
  put(key: string, body: Uint8Array, contentType: string): void {
    localDevObjects.set(key, { body, contentType, updatedAt: Date.now() })
  },
  get(key: string): LocalDevStoredObject | undefined {
    return localDevObjects.get(key)
  },
  delete(key: string): boolean {
    return localDevObjects.delete(key)
  },
  clear(): void {
    localDevObjects.clear()
  },
}

async function signLocalDevToken(
  secret: string,
  payload: { op: 'put' | 'get'; key: string; exp: number; ct?: string }
): Promise<string> {
  const canonical = `${payload.op}|${payload.key}|${payload.exp}|${payload.ct ?? ''}`
  const sigBytes = await hmacSha256(secret, canonical)
  return toHex(sigBytes)
}

export async function verifyLocalDevSignature(params: {
  secret: string
  op: 'put' | 'get'
  key: string
  exp: number
  ct?: string
  sig: string
  now?: Date
}): Promise<boolean> {
  const nowSec = Math.floor((params.now ?? new Date()).getTime() / 1000)
  if (!Number.isFinite(params.exp) || params.exp < nowSec) {
    return false
  }
  const expected = await signLocalDevToken(params.secret, {
    op: params.op,
    key: params.key,
    exp: params.exp,
    ct: params.ct,
  })
  if (expected.length !== params.sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ params.sig.charCodeAt(i)
  }
  return diff === 0
}

export class LocalDevMediaSigner implements MediaStorageSigner {
  readonly mode = 'local-dev' as const
  private readonly baseUrl: string

  constructor(
    baseUrl: string,
    private readonly secret: string
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  async createUploadUrl(params: {
    key: string
    contentType: string
    expiresInSeconds?: number
    now?: Date
  }): Promise<SignedUrlResult> {
    assertValidKey(params.key)
    const expiresIn = params.expiresInSeconds ?? UPLOAD_URL_TTL_SECONDS
    assertUploadTtl(expiresIn)

    const now = params.now ?? new Date()
    const exp = Math.floor(now.getTime() / 1000) + expiresIn
    const normalizedContentType = params.contentType.split(';')[0]?.trim().toLowerCase() || params.contentType
    const sig = await signLocalDevToken(this.secret, {
      op: 'put',
      key: params.key,
      exp,
      ct: normalizedContentType,
    })

    const url = new URL(`${this.baseUrl}/api/media/dev-object`)
    url.searchParams.set('key', params.key)
    url.searchParams.set('op', 'put')
    url.searchParams.set('exp', String(exp))
    url.searchParams.set('ct', normalizedContentType)
    url.searchParams.set('sig', sig)

    return {
      url: url.toString(),
      method: 'PUT',
      headers: {
        'Content-Type': normalizedContentType,
      },
      expiresIn,
      expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
      mode: 'local-dev',
    }
  }

  async createViewUrl(params: {
    key: string
    expiresInSeconds?: number
    now?: Date
  }): Promise<SignedUrlResult> {
    assertValidKey(params.key)
    const expiresIn = params.expiresInSeconds ?? VIEW_URL_TTL_SECONDS
    assertViewTtl(expiresIn)

    const now = params.now ?? new Date()
    const exp = Math.floor(now.getTime() / 1000) + expiresIn
    const sig = await signLocalDevToken(this.secret, {
      op: 'get',
      key: params.key,
      exp,
    })

    const url = new URL(`${this.baseUrl}/api/media/dev-object`)
    url.searchParams.set('key', params.key)
    url.searchParams.set('op', 'get')
    url.searchParams.set('exp', String(exp))
    url.searchParams.set('sig', sig)

    return {
      url: url.toString(),
      method: 'GET',
      headers: {},
      expiresIn,
      expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
      mode: 'local-dev',
    }
  }
}

export function resolveLocalDevMediaSecret(env?: MediaSignerEnv): string {
  return env?.AUTH_SECRET || process.env.AUTH_SECRET || 'lazus-local-dev-media-secret'
}

export function createMediaSigner(env?: MediaSignerEnv): MediaStorageSigner {
  const accountId = env?.R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID
  const bucketName = env?.R2_BUCKET_NAME || process.env.R2_BUCKET_NAME
  const accessKeyId = env?.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = env?.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY

  if (accountId && bucketName && accessKeyId && secretAccessKey) {
    return new R2SigV4Signer({
      accountId,
      bucketName,
      accessKeyId,
      secretAccessKey,
    })
  }

  const environment = (env?.ENVIRONMENT || process.env.ENVIRONMENT || process.env.NODE_ENV || 'development').toLowerCase()
  const isDevOrTest = environment === 'development' || environment === 'test'

  if (!isDevOrTest) {
    throw new Error(
      'Faltan credenciales de Cloudflare R2 (R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) en producción.'
    )
  }

  const baseUrl = env?.APP_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:5173'
  return new LocalDevMediaSigner(baseUrl, resolveLocalDevMediaSecret(env))
}
