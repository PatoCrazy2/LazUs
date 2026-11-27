import { z } from 'zod'

const BASE64_OR_URL_REGEX = /^[A-Za-z0-9+/_-]+=*$/

function decodeBase64ByteLength(value: string): number {
  const cleaned = value.trim().replace(/=+$/, '')
  return Math.floor((cleaned.length * 3) / 4)
}

export const PushEndpointSchema = z
  .string()
  .trim()
  .url('El endpoint de suscripción debe ser una URL válida')
  .max(2048, 'El endpoint de suscripción excede el tamaño máximo permitido')
  .refine((val) => {
    try {
      const parsed = new URL(val)
      return parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, 'El endpoint Web Push debe utilizar HTTPS')

export const PushSubscriptionKeysSchema = z.object({
  p256dh: z
    .string()
    .trim()
    .regex(BASE64_OR_URL_REGEX, 'Clave p256dh con formato base64 inválido')
    .refine(
      (val) => decodeBase64ByteLength(val) === 65,
      'La clave p256dh debe corresponder a un punto P-256 sin comprimir de 65 bytes'
    ),
  auth: z
    .string()
    .trim()
    .regex(BASE64_OR_URL_REGEX, 'Clave auth con formato base64 inválido')
    .refine(
      (val) => decodeBase64ByteLength(val) === 16,
      'La clave auth debe tener exactamente 16 bytes'
    ),
})

export type PushSubscriptionKeys = z.infer<typeof PushSubscriptionKeysSchema>

export const PushSubscriptionInputSchema = z.object({
  endpoint: PushEndpointSchema,
  keys: PushSubscriptionKeysSchema,
  user_agent: z.string().trim().max(255).optional(),
})

export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>

export const UnsubscribePushInputSchema = z.object({
  endpoint: PushEndpointSchema,
})

export type UnsubscribePushInput = z.infer<typeof UnsubscribePushInputSchema>

export const TestPushInputSchema = z.object({
  endpoint: PushEndpointSchema,
  delay_seconds: z.number().int().min(0).max(10).default(3),
})

export type TestPushInput = z.infer<typeof TestPushInputSchema>

export const VapidPublicKeyResponseSchema = z.object({
  enabled: z.boolean(),
  public_key: z.string().min(80).max(140).nullable(),
})

export type VapidPublicKeyResponse = z.infer<typeof VapidPublicKeyResponseSchema>

export const PushStatusResponseSchema = z.object({
  enabled: z.boolean(),
  subscribed: z.boolean(),
  subscriptions_count: z.number().int().min(0),
  current_device_subscribed: z.boolean(),
})

export type PushStatusResponse = z.infer<typeof PushStatusResponseSchema>

export const PushSubscriptionMutationResponseSchema = z.object({
  status: z.literal('success'),
  subscribed: z.boolean(),
  subscriptions_count: z.number().int().min(0),
})

export type PushSubscriptionMutationResponse = z.infer<
  typeof PushSubscriptionMutationResponseSchema
>

export const TestPushResponseSchema = z.object({
  status: z.enum(['scheduled', 'sent', 'disabled']),
  delay_seconds: z.number().int().min(0).max(10),
})

export type TestPushResponse = z.infer<typeof TestPushResponseSchema>

// --- Contrato Zero-Leak para Payloads Web Push (compartido con src/sw.ts) ---

export const PushNotificationTagSchema = z.enum([
  'lazus-affection',
  'lazus-daily-activity',
  'lazus-test',
])

export type PushNotificationTag = z.infer<typeof PushNotificationTagSchema>

export const SafePushPayloadSchema = z
  .object({
    title: z.string().min(1).max(80),
    body: z.string().min(1).max(180),
    tag: PushNotificationTagSchema,
    renotify: z.boolean().default(true),
    url: z
      .string()
      .min(1)
      .max(256)
      .refine(
        (u) => u.startsWith('/') && !u.startsWith('//'),
        'La URL de la notificación debe ser una ruta interna relativa'
      ),
  })
  .strict()

export type SafePushPayload = z.infer<typeof SafePushPayloadSchema>
