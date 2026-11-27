/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import {
  parseIncomingPushPayload,
  resolveNotificationTargetUrl,
  shouldSuppressForegroundPush,
} from './features/notifications/utils/swPushLogic'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
void self.skipWaiting()
clientsClaim()

self.addEventListener('push', (event: PushEvent) => {
  const handlePush = async () => {
    const rawText = event.data ? event.data.text() : ''
    const payload = parseIncomingPushPayload(rawText)
    if (!payload) return

    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    if (shouldSuppressForegroundPush(payload, windowClients)) {
      return
    }

    const options: NotificationOptions & { renotify?: boolean } = {
      body: payload.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.tag,
      renotify: payload.renotify,
      data: { url: payload.url },
    }

    await self.registration.showNotification(payload.title, options)
  }

  event.waitUntil(handlePush())
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  const handleNotificationClick = async () => {
    const targetHref = resolveNotificationTargetUrl(
      (event.notification.data as { url?: unknown } | undefined)?.url,
      self.location.origin
    )

    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        if ('navigate' in client && client.url !== targetHref) {
          await client.navigate(targetHref).catch(() => undefined)
        }
        await client.focus()
        return
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetHref)
    }
  }

  event.waitUntil(handleNotificationClick())
})
