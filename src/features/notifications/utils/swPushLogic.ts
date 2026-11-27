import { SafePushPayloadSchema, type SafePushPayload } from '../../../../shared'

export interface MinimalWindowClient {
  focused?: boolean
  visibilityState?: string
  url?: string
}

const DEFAULT_FALLBACK_PAYLOAD: SafePushPayload = {
  title: 'LazUs',
  body: 'Tienes una novedad en tu espacio compartido ❤️',
  tag: 'lazus-daily-activity',
  renotify: true,
  url: '/',
}

/**
 * Parsea y valida estrictamente el payload entrante del evento `push` contra `SafePushPayloadSchema`.
 * - Si el evento viene vacío (ej. prueba desde DevTools), retorna un aviso genérico seguro.
 * - Si el JSON viola el contrato Zero-Leak, retorna `null` para descartarlo.
 */
export function parseIncomingPushPayload(rawText: string | null | undefined): SafePushPayload | null {
  if (!rawText || rawText.trim().length === 0) {
    return DEFAULT_FALLBACK_PAYLOAD
  }

  try {
    const parsedJson: unknown = JSON.parse(rawText)
    const validated = SafePushPayloadSchema.safeParse(parsedJson)
    if (!validated.success) {
      return null
    }
    return validated.data
  } catch {
    return null
  }
}

/**
 * Determina si debe suprimirse el banner nativo del sistema operativo porque el usuario
 * ya tiene LazUs abierta y enfocada en primer plano (recibiendo eventos en vivo vía WebSocket).
 * Los avisos de prueba (`lazus-test`) nunca se suprimen.
 */
export function shouldSuppressForegroundPush(
  payload: SafePushPayload,
  clients: readonly MinimalWindowClient[]
): boolean {
  if (payload.tag === 'lazus-test') {
    return false
  }

  return clients.some(
    (client) => client.focused === true && client.visibilityState !== 'hidden'
  )
}

/**
 * Garantiza que el clic en la notificación solo navegue a rutas internas seguras del mismo origen.
 */
export function resolveNotificationTargetUrl(rawUrl: unknown, origin: string): string {
  if (typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
    return new URL(rawUrl, origin).href
  }
  return new URL('/', origin).href
}
