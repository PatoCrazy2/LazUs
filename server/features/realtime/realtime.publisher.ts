import {
  RealtimeBroadcastRequestSchema,
  type RealtimeBroadcastAudience,
  type SafeRealtimeEvent,
} from '../../../shared'

export interface PublishCoupleEventOptions {
  coupleId: string
  event: SafeRealtimeEvent
  audience?: RealtimeBroadcastAudience
  excludeUserId?: string
}

export interface CoupleEventPublisher {
  publish(options: PublishCoupleEventOptions): Promise<boolean>
}

export class DurableObjectRealtimePublisher implements CoupleEventPublisher {
  private readonly namespace?: DurableObjectNamespace

  constructor(namespace?: DurableObjectNamespace) {
    this.namespace = namespace
  }

  async publish(options: PublishCoupleEventOptions): Promise<boolean> {
    const startMs = Date.now()
    const payloadResult = RealtimeBroadcastRequestSchema.safeParse({
      event: options.event,
      audience: options.audience ?? 'both',
      ...(options.excludeUserId ? { excludeUserId: options.excludeUserId } : {}),
    })

    if (!payloadResult.success) {
      console.error('[RealtimePublisher] Evento rechazado por validación Zero-Leak', {
        couple_id: options.coupleId,
        event_type: (options.event as { type?: string })?.type ?? 'unknown',
      })
      return false
    }

    if (!this.namespace) {
      return false
    }

    try {
      const id = this.namespace.idFromName(options.coupleId)
      const stub = this.namespace.get(id)
      const response = await stub.fetch('https://couple-room/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadResult.data),
      })

      if (!response.ok) {
        console.warn('[RealtimePublisher] Broadcast no exitoso', {
          couple_id: options.coupleId,
          event_type: payloadResult.data.event.type,
          status_code: response.status,
          latency_ms: Date.now() - startMs,
        })
        return false
      }

      return true
    } catch {
      console.error('[RealtimePublisher] Error enviando evento al Durable Object', {
        couple_id: options.coupleId,
        event_type: payloadResult.data.event.type,
        latency_ms: Date.now() - startMs,
      })
      return false
    }
  }
}

export function createRealtimePublisher(namespace?: DurableObjectNamespace): CoupleEventPublisher {
  return new DurableObjectRealtimePublisher(namespace)
}
