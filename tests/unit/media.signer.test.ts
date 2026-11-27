import { describe, expect, it } from 'vitest'
import {
  LocalDevMediaSigner,
  R2SigV4Signer,
  createMediaSigner,
  verifyLocalDevSignature,
} from '../../server/features/media/r2.signer'
import {
  MAX_PHOTO_SIZE_BYTES,
  MAX_VOICE_SIZE_BYTES,
  RequestUploadUrlInputSchema,
  UPLOAD_URL_TTL_SECONDS,
  VIEW_URL_TTL_SECONDS,
} from '../../shared'

describe('Fase 1: R2 SigV4 Signer, Local Dev Fallback y Contratos Media', () => {
  const fixedNow = new Date('2026-11-26T18:00:00.000Z')

  const r2Signer = new R2SigV4Signer({
    accountId: 'acc1234567890',
    bucketName: 'lazus-media',
    accessKeyId: 'AKIAEXAMPLEKEY',
    secretAccessKey: 'super-secret-r2-key-value',
  })

  it('genera una URL prefirmada PUT AWS SigV4 válida y determinista con TTL <= 10 min', async () => {
    const result = await r2Signer.createUploadUrl({
      key: 'couples/couple-1/photo/img-1.webp',
      contentType: 'image/webp',
      expiresInSeconds: 600,
      now: fixedNow,
    })

    expect(result.mode).toBe('r2')
    expect(result.method).toBe('PUT')
    expect(result.expiresIn).toBe(600)
    expect(result.expiresAt).toBe('2026-11-26T18:10:00.000Z')
    expect(result.headers['Content-Type']).toBe('image/webp')

    const parsed = new URL(result.url)
    expect(parsed.origin).toBe('https://acc1234567890.r2.cloudflarestorage.com')
    expect(parsed.pathname).toBe('/lazus-media/couples/couple-1/photo/img-1.webp')
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(parsed.searchParams.get('X-Amz-Credential')).toBe(
      'AKIAEXAMPLEKEY/20261126/auto/s3/aws4_request'
    )
    expect(parsed.searchParams.get('X-Amz-Date')).toBe('20261126T180000Z')
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host')
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)

    // Determinismo con la misma fecha
    const second = await r2Signer.createUploadUrl({
      key: 'couples/couple-1/photo/img-1.webp',
      contentType: 'image/webp',
      expiresInSeconds: 600,
      now: fixedNow,
    })
    expect(second.url).toBe(result.url)
  })

  it('genera una URL firmada GET AWS SigV4 válida con TTL <= 15 min', async () => {
    const result = await r2Signer.createViewUrl({
      key: 'couples/couple-1/voice/note-1.webm',
      expiresInSeconds: 900,
      now: fixedNow,
    })

    expect(result.mode).toBe('r2')
    expect(result.method).toBe('GET')
    expect(result.expiresIn).toBe(900)
    expect(result.expiresAt).toBe('2026-11-26T18:15:00.000Z')

    const parsed = new URL(result.url)
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rechaza TTLs que violen las invariantes de seguridad (>10 min PUT o >15 min GET)', async () => {
    await expect(
      r2Signer.createUploadUrl({
        key: 'couples/c1/photo/a.webp',
        contentType: 'image/webp',
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS + 1,
      })
    ).rejects.toThrow(RangeError)

    await expect(
      r2Signer.createViewUrl({
        key: 'couples/c1/photo/a.webp',
        expiresInSeconds: VIEW_URL_TTL_SECONDS + 1,
      })
    ).rejects.toThrow(RangeError)
  })

  it('rechaza claves R2 con path traversal', async () => {
    await expect(
      r2Signer.createViewUrl({
        key: '../secrets.txt',
      })
    ).rejects.toThrow()
  })

  it('usa LocalDevMediaSigner en desarrollo sin credenciales R2 y verifica firma HMAC + expiración', async () => {
    const signer = createMediaSigner({
      ENVIRONMENT: 'development',
      APP_BASE_URL: 'http://localhost:5173',
      AUTH_SECRET: 'dev-secret-123',
    })
    expect(signer).toBeInstanceOf(LocalDevMediaSigner)
    expect(signer.mode).toBe('local-dev')

    const upload = await signer.createUploadUrl({
      key: 'couples/c1/photo/test.webp',
      contentType: 'image/webp',
      expiresInSeconds: 300,
      now: fixedNow,
    })
    const parsed = new URL(upload.url)
    expect(parsed.pathname).toBe('/api/media/dev-object')

    const validNow = await verifyLocalDevSignature({
      secret: 'dev-secret-123',
      op: 'put',
      key: parsed.searchParams.get('key')!,
      exp: Number(parsed.searchParams.get('exp')),
      ct: parsed.searchParams.get('ct')!,
      sig: parsed.searchParams.get('sig')!,
      now: new Date(fixedNow.getTime() + 60_000),
    })
    expect(validNow).toBe(true)

    const expired = await verifyLocalDevSignature({
      secret: 'dev-secret-123',
      op: 'put',
      key: parsed.searchParams.get('key')!,
      exp: Number(parsed.searchParams.get('exp')),
      ct: parsed.searchParams.get('ct')!,
      sig: parsed.searchParams.get('sig')!,
      now: new Date(fixedNow.getTime() + 400_000),
    })
    expect(expired).toBe(false)
  })

  it('falla explícitamente en producción si faltan credenciales R2', () => {
    expect(() =>
      createMediaSigner({
        ENVIRONMENT: 'production',
        R2_BUCKET_NAME: 'lazus-media',
      })
    ).toThrow(/credenciales de Cloudflare R2/i)
  })

  it('valida MIME y tamaño máximo en RequestUploadUrlInputSchema', () => {
    const okPhoto = RequestUploadUrlInputSchema.safeParse({
      kind: 'photo',
      content_type: 'image/webp',
      size_bytes: 450_000,
    })
    expect(okPhoto.success).toBe(true)

    const okVoiceWithCodec = RequestUploadUrlInputSchema.safeParse({
      kind: 'voice',
      content_type: 'audio/webm;codecs=opus',
      size_bytes: 320_000,
    })
    expect(okVoiceWithCodec.success).toBe(true)

    const badMime = RequestUploadUrlInputSchema.safeParse({
      kind: 'photo',
      content_type: 'application/pdf',
      size_bytes: 100_000,
    })
    expect(badMime.success).toBe(false)

    const oversizedPhoto = RequestUploadUrlInputSchema.safeParse({
      kind: 'photo',
      content_type: 'image/jpeg',
      size_bytes: MAX_PHOTO_SIZE_BYTES + 1,
    })
    expect(oversizedPhoto.success).toBe(false)

    const oversizedVoice = RequestUploadUrlInputSchema.safeParse({
      kind: 'voice',
      content_type: 'audio/mp4',
      size_bytes: MAX_VOICE_SIZE_BYTES + 1,
    })
    expect(oversizedVoice.success).toBe(false)
  })
})
