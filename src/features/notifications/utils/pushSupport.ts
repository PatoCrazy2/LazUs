import type { PushSubscriptionInput } from '../../../../shared'

export type PushEnvironmentCapability =
  | 'unsupported'
  | 'ios_needs_install'
  | 'denied'
  | 'prompt'
  | 'granted'

export interface PushEnvironmentSnapshot {
  capability: PushEnvironmentCapability
  isIos: boolean
  isStandalone: boolean
  permission: NotificationPermission | 'unsupported'
}

export interface BrowserEnvLike {
  windowObj?: {
    PushManager?: unknown
    Notification?: {
      permission?: NotificationPermission
    }
    matchMedia?: (query: string) => { matches: boolean }
  }
  navigatorObj?: {
    userAgent?: string
    platform?: string
    maxTouchPoints?: number
    standalone?: boolean
    serviceWorker?: unknown
  }
}

/**
 * Detecta dispositivos iOS / iPadOS (incluyendo iPadOS 13+ que reporta MacIntel con pantalla táctil).
 */
export function detectIosDevice(
  nav: BrowserEnvLike['navigatorObj'] = typeof navigator !== 'undefined' ? navigator : undefined
): boolean {
  if (!nav) return false
  const ua = nav.userAgent ?? ''
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return true
  }
  // iPadOS Safari en modo escritorio reporta MacIntel + puntos táctiles
  if (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) {
    return true
  }
  return false
}

/**
 * Detecta obligatoriamente si la PWA está instalada y corriendo en modo standalone
 * (`display-mode: standalone` estándar o `navigator.standalone` específico de iOS Safari).
 */
export function detectStandaloneMode(env?: BrowserEnvLike): boolean {
  const win = env?.windowObj ?? (typeof window !== 'undefined' ? window : undefined)
  const nav =
    env?.navigatorObj ??
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { standalone?: boolean })
      : undefined)

  if (nav?.standalone === true) {
    return true
  }

  if (win?.matchMedia) {
    try {
      if (win.matchMedia('(display-mode: standalone)').matches) {
        return true
      }
    } catch {
      // Ignorar fallos de matchMedia en entornos de test mínimos
    }
  }

  return false
}

/**
 * Evalúa el soporte real de Web Push respetando la regla crítica de iOS Safari:
 * En iPhone/iPad fuera de pantalla de inicio (`!isStandalone`), Safari oculta `PushManager`.
 * Debe detectarse primero `ios_needs_install` para guiar al usuario antes de pedir permisos.
 */
export function evaluatePushEnvironment(env?: BrowserEnvLike): PushEnvironmentSnapshot {
  const win = env?.windowObj ?? (typeof window !== 'undefined' ? window : undefined)
  const nav =
    env?.navigatorObj ??
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { standalone?: boolean })
      : undefined)

  if (!win || !nav) {
    return {
      capability: 'unsupported',
      isIos: false,
      isStandalone: false,
      permission: 'unsupported',
    }
  }

  const isIos = detectIosDevice(nav)
  const isStandalone = detectStandaloneMode({ windowObj: win, navigatorObj: nav })

  // Regla no negociable: iOS exige instalación previa en pantalla de inicio antes de pedir Push
  if (isIos && !isStandalone) {
    return {
      capability: 'ios_needs_install',
      isIos: true,
      isStandalone: false,
      permission: 'unsupported',
    }
  }

  const hasWebPushApis = Boolean(nav.serviceWorker && win.PushManager && win.Notification)
  if (!hasWebPushApis) {
    return {
      capability: 'unsupported',
      isIos,
      isStandalone,
      permission: 'unsupported',
    }
  }

  const permission = win.Notification?.permission ?? 'default'
  if (permission === 'denied') {
    return { capability: 'denied', isIos, isStandalone, permission }
  }
  if (permission === 'granted') {
    return { capability: 'granted', isIos, isStandalone, permission }
  }
  return { capability: 'prompt', isIos, isStandalone, permission: 'default' }
}

/**
 * Convierte una clave pública VAPID en formato base64url a `Uint8Array<ArrayBuffer>`
 * para `pushManager.subscribe({ applicationServerKey })`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const normalized = base64String.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const rawData = atob(normalized + padding)
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Serializa un objeto `PushSubscriptionJSON` del navegador al DTO validado por el backend.
 */
export function serializeBrowserSubscription(
  subJson: PushSubscriptionJSON,
  userAgent?: string
): PushSubscriptionInput {
  const p256dh = subJson.keys?.p256dh
  const auth = subJson.keys?.auth

  if (!subJson.endpoint || !p256dh || !auth) {
    throw new Error('El navegador devolvió una suscripción Push incompleta')
  }

  return {
    endpoint: subJson.endpoint,
    keys: { p256dh, auth },
    user_agent: userAgent ? userAgent.slice(0, 255) : undefined,
  }
}

/**
 * Obtiene el registro activo del Service Worker esperando un tiempo acotado para no colgar la UI en modo dev.
 */
export async function getReadyServiceWorkerRegistration(
  timeoutMs: number = 4000
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }

  const existing = await navigator.serviceWorker.getRegistration()
  if (existing?.active) {
    return existing
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    const readyPromise = navigator.serviceWorker.ready
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(null), timeoutMs)
    })
    return await Promise.race([readyPromise, timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}
