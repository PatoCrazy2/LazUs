import type {
  PushStatusResponse,
  PushSubscriptionInput,
  PushSubscriptionMutationResponse,
  SafePushPayload,
  TestPushInput,
  TestPushResponse,
  VapidPublicKeyResponse,
} from '../../../shared'
import type { DbClient } from '../../db'
import { NotificationsRepository, type StoredPushSubscription } from './notifications.repository'
import {
  buildWebPushRequest,
  type VapidConfig,
  type WebPushUrgency,
} from './webpush.crypto'

export class NotificationNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotificationNotFoundError'
  }
}

export interface VapidEnvBindings {
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
}

export interface PushDispatchSummary {
  sent: number
  pruned: number
  failed: number
  skipped: boolean
}

export interface ActivityPushNotifier {
  notifyPartnerActivityUpdate(
    coupleId: string,
    senderUserId: string,
    activityStatus: 'pending' | 'revealed'
  ): Promise<PushDispatchSummary>
}

export function resolveVapidConfig(env?: VapidEnvBindings): VapidConfig | null {
  const publicKey = (env?.VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = (env?.VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY || '').trim()
  const subject = (env?.VAPID_SUBJECT || process.env.VAPID_SUBJECT || '').trim()

  if (!publicKey || !privateKey || !subject) {
    return null
  }

  return { publicKey, privateKey, subject }
}

function getDisplayFirstName(displayName: string): string {
  const trimmed = displayName.trim()
  if (!trimmed) return 'Tu pareja'
  const first = trimmed.split(/\s+/)[0] || trimmed
  return first.slice(0, 40)
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class NotificationsService implements ActivityPushNotifier {
  private readonly repo: NotificationsRepository

  constructor(
    db: DbClient,
    private readonly vapidConfig: VapidConfig | null,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly sleepImpl: (ms: number) => Promise<void> = defaultSleep
  ) {
    this.repo = new NotificationsRepository(db)
  }

  getPublicKeyConfig(): VapidPublicKeyResponse {
    if (!this.vapidConfig) {
      return { enabled: false, public_key: null }
    }
    return {
      enabled: true,
      public_key: this.vapidConfig.publicKey,
    }
  }

  async getStatus(userId: string, endpoint?: string): Promise<PushStatusResponse> {
    const status = await this.repo.getUserSubscriptionStatus(userId, endpoint)
    return {
      enabled: Boolean(this.vapidConfig),
      subscribed: status.subscriptionsCount > 0,
      subscriptions_count: status.subscriptionsCount,
      current_device_subscribed: status.currentDeviceSubscribed,
    }
  }

  async subscribe(
    userId: string,
    input: PushSubscriptionInput
  ): Promise<PushSubscriptionMutationResponse> {
    const subscriptionsCount = await this.repo.upsertSubscription({
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.user_agent,
    })

    return {
      status: 'success',
      subscribed: subscriptionsCount > 0,
      subscriptions_count: subscriptionsCount,
    }
  }

  async unsubscribe(
    userId: string,
    endpoint: string
  ): Promise<PushSubscriptionMutationResponse> {
    const { subscriptionsCount } = await this.repo.deleteSubscriptionByEndpoint(userId, endpoint)

    return {
      status: 'success',
      subscribed: subscriptionsCount > 0,
      subscriptions_count: subscriptionsCount,
    }
  }

  /**
   * Prepara un envío Push de prueba estrictamente hacia el endpoint del propio usuario.
   * Permite programar un retardo ligero (ej. 3 s en waitUntil) para bloquear la pantalla del móvil.
   */
  async prepareTestPush(
    userId: string,
    input: TestPushInput
  ): Promise<{ response: TestPushResponse; task: Promise<PushDispatchSummary> | null }> {
    if (!this.vapidConfig) {
      return {
        response: { status: 'disabled', delay_seconds: 0 },
        task: null,
      }
    }

    const subscription = await this.repo.findUserSubscriptionByEndpoint(userId, input.endpoint)
    if (!subscription) {
      throw new NotificationNotFoundError(
        'Este dispositivo no tiene una suscripción activa para recibir avisos'
      )
    }

    const payload: SafePushPayload = {
      title: 'LazUs',
      body: '🔔 ¡Avisos activos en este dispositivo! Todo listo en LazUs.',
      tag: 'lazus-test',
      renotify: true,
      url: '/',
    }

    // Construimos la petición cifrada de inmediato antes de cualquier retardo
    const preparedRequest = await buildWebPushRequest({
      subscription,
      payload,
      vapid: this.vapidConfig,
      ttlSeconds: 300,
      urgency: 'high',
    })

    const delaySeconds = input.delay_seconds

    const runDelivery = async (): Promise<PushDispatchSummary> => {
      if (delaySeconds > 0) {
        await this.sleepImpl(delaySeconds * 1000)
      }
      return this.deliverPreparedRequests([{ subscription, request: preparedRequest }], {
        eventType: 'test_push',
      })
    }

    return {
      response: {
        status: delaySeconds > 0 ? 'scheduled' : 'sent',
        delay_seconds: delaySeconds,
      },
      task: runDelivery(),
    }
  }

  async notifyPartnerAffection(
    coupleId: string,
    senderUserId: string
  ): Promise<PushDispatchSummary> {
    if (!this.vapidConfig) {
      return { sent: 0, pruned: 0, failed: 0, skipped: true }
    }

    const target = await this.repo.findPartnerSubscriptionsForCouple(coupleId, senderUserId)
    if (target.subscriptions.length === 0) {
      return { sent: 0, pruned: 0, failed: 0, skipped: false }
    }

    const senderFirstName = getDisplayFirstName(target.senderName)
    const payload: SafePushPayload = {
      title: 'LazUs',
      body: `❤️ ${senderFirstName} te envió un toque`,
      tag: 'lazus-affection',
      renotify: true,
      url: '/',
    }

    return this.dispatchToSubscriptions(target.subscriptions, payload, {
      coupleId,
      eventType: 'affection_received',
      urgency: 'high',
      ttlSeconds: 3600,
    })
  }

  async notifyPartnerActivityUpdate(
    coupleId: string,
    senderUserId: string,
    activityStatus: 'pending' | 'revealed'
  ): Promise<PushDispatchSummary> {
    if (!this.vapidConfig) {
      return { sent: 0, pruned: 0, failed: 0, skipped: true }
    }

    const target = await this.repo.findPartnerSubscriptionsForCouple(coupleId, senderUserId)
    if (target.subscriptions.length === 0) {
      return { sent: 0, pruned: 0, failed: 0, skipped: false }
    }

    const senderFirstName = getDisplayFirstName(target.senderName)
    const payload: SafePushPayload =
      activityStatus === 'revealed'
        ? {
            title: 'LazUs',
            body: '🎉 ¡Ambos respondieron hoy! Toca para revelar',
            tag: 'lazus-daily-activity',
            renotify: true,
            url: '/',
          }
        : {
            title: 'LazUs',
            body: `✨ ${senderFirstName} ya respondió al reto de hoy. ¡Descubre qué dijo!`,
            tag: 'lazus-daily-activity',
            renotify: true,
            url: '/',
          }

    return this.dispatchToSubscriptions(target.subscriptions, payload, {
      coupleId,
      eventType:
        activityStatus === 'revealed'
          ? 'activity_ready_to_reveal'
          : 'partner_submission_completed',
      urgency: 'normal',
      ttlSeconds: 43200,
    })
  }

  private async dispatchToSubscriptions(
    subscriptions: StoredPushSubscription[],
    payload: SafePushPayload,
    meta: {
      coupleId?: string
      eventType: string
      urgency: WebPushUrgency
      ttlSeconds: number
    }
  ): Promise<PushDispatchSummary> {
    if (!this.vapidConfig || subscriptions.length === 0) {
      return { sent: 0, pruned: 0, failed: 0, skipped: !this.vapidConfig }
    }

    const prepared = await Promise.all(
      subscriptions.map(async (subscription) => ({
        subscription,
        request: await buildWebPushRequest({
          subscription,
          payload,
          vapid: this.vapidConfig!,
          ttlSeconds: meta.ttlSeconds,
          urgency: meta.urgency,
        }),
      }))
    )

    return this.deliverPreparedRequests(prepared, {
      coupleId: meta.coupleId,
      eventType: meta.eventType,
    })
  }

  private async deliverPreparedRequests(
    entries: Array<{
      subscription: StoredPushSubscription
      request: Awaited<ReturnType<typeof buildWebPushRequest>>
    }>,
    meta: { coupleId?: string; eventType: string }
  ): Promise<PushDispatchSummary> {
    const startMs = Date.now()
    const deliveredEndpoints: string[] = []
    const staleEndpoints: string[] = []
    let failed = 0

    const results = await Promise.allSettled(
      entries.map(async ({ subscription, request }) => {
        const res = await this.fetchImpl(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        })
        return { endpoint: subscription.endpoint, status: res.status, ok: res.ok }
      })
    )

    for (const outcome of results) {
      if (outcome.status === 'rejected') {
        failed++
        continue
      }

      const { endpoint, status, ok } = outcome.value
      if (ok) {
        deliveredEndpoints.push(endpoint)
      } else if (status === 404 || status === 410) {
        staleEndpoints.push(endpoint)
      } else {
        failed++
      }
    }

    let pruned = 0
    if (staleEndpoints.length > 0) {
      try {
        pruned = await this.repo.deleteSubscriptionsByEndpoints(staleEndpoints)
      } catch {
        // Silencioso en caso de cierre anticipado de conexión en segundo plano
      }
    }

    if (deliveredEndpoints.length > 0) {
      await this.repo.touchSubscriptionsLastUsed(deliveredEndpoints).catch(() => undefined)
    }

    // Logs estrictamente sanitizados (cero endpoints, cero claves, cero contenido)
    console.info('[NotificationsService] Push dispatch completado', {
      couple_id: meta.coupleId ?? null,
      event_type: meta.eventType,
      sent_count: deliveredEndpoints.length,
      pruned_count: pruned,
      failed_count: failed,
      latency_ms: Date.now() - startMs,
    })

    return {
      sent: deliveredEndpoints.length,
      pruned,
      failed,
      skipped: false,
    }
  }
}

export function createNotificationsService(
  db: DbClient,
  env?: VapidEnvBindings,
  fetchImpl: typeof fetch = fetch
): NotificationsService {
  return new NotificationsService(db, resolveVapidConfig(env), fetchImpl)
}
