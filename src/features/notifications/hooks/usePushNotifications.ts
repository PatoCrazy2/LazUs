import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { notificationsApi } from '../api/notifications.api'
import {
  evaluatePushEnvironment,
  getReadyServiceWorkerRegistration,
  serializeBrowserSubscription,
  urlBase64ToUint8Array,
  type PushEnvironmentSnapshot,
} from '../utils/pushSupport'

export type DevicePushUiState =
  | 'loading'
  | 'unsupported'
  | 'ios_needs_install'
  | 'server_disabled'
  | 'denied'
  | 'prompt'
  | 'unsubscribed'
  | 'subscribed'

interface ResolvedDevicePushData {
  env: PushEnvironmentSnapshot
  localEndpoint: string | null
  serverEnabled: boolean
  currentDeviceSubscribed: boolean
  subscriptionsCount: number
}

const DEVICE_STATE_QUERY_KEY = ['notifications', 'device-state'] as const

async function resolveDevicePushData(): Promise<ResolvedDevicePushData> {
  const env = evaluatePushEnvironment()

  if (env.capability === 'unsupported' || env.capability === 'ios_needs_install') {
    return {
      env,
      localEndpoint: null,
      serverEnabled: false,
      currentDeviceSubscribed: false,
      subscriptionsCount: 0,
    }
  }

  let localEndpoint: string | null = null
  if (env.capability === 'granted') {
    const reg = await getReadyServiceWorkerRegistration(2500)
    const sub = await reg?.pushManager?.getSubscription()
    localEndpoint = sub?.endpoint ?? null
  }

  const status = await notificationsApi.getStatus(localEndpoint ?? undefined)

  return {
    env,
    localEndpoint,
    serverEnabled: status.enabled,
    currentDeviceSubscribed: Boolean(localEndpoint && status.current_device_subscribed),
    subscriptionsCount: status.subscriptions_count,
  }
}

export function deriveDevicePushUiState(
  data: ResolvedDevicePushData | undefined,
  isLoading: boolean
): DevicePushUiState {
  if (isLoading || !data) return 'loading'
  if (data.env.capability === 'ios_needs_install') return 'ios_needs_install'
  if (data.env.capability === 'unsupported') return 'unsupported'
  if (!data.serverEnabled) return 'server_disabled'
  if (data.env.capability === 'denied') return 'denied'
  if (data.currentDeviceSubscribed) return 'subscribed'
  if (data.env.capability === 'granted') return 'unsubscribed'
  return 'prompt'
}

export function usePushNotifications() {
  const queryClient = useQueryClient()
  const [testCountdown, setTestCountdown] = useState<number | null>(null)
  const [testDeliveredMessage, setTestDeliveredMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const stateQuery = useQuery({
    queryKey: DEVICE_STATE_QUERY_KEY,
    queryFn: resolveDevicePushData,
    staleTime: 30_000,
  })

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const env = evaluatePushEnvironment()
      if (env.capability === 'ios_needs_install') {
        throw new Error('Primero añade LazUs a tu pantalla de inicio desde el botón Compartir.')
      }
      if (env.capability === 'unsupported') {
        throw new Error('Este navegador no soporta notificaciones Web Push.')
      }

      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()

      if (permission !== 'granted') {
        await queryClient.invalidateQueries({ queryKey: DEVICE_STATE_QUERY_KEY })
        throw new Error(
          permission === 'denied'
            ? 'Permiso de notificaciones bloqueado en los ajustes del navegador.'
            : 'Permiso de notificaciones no concedido.'
        )
      }

      const vapid = await notificationsApi.getVapidPublicKey()
      if (!vapid.enabled || !vapid.public_key) {
        throw new Error('Las notificaciones aún no están habilitadas en el servidor.')
      }

      const registration = await getReadyServiceWorkerRegistration(5000)
      if (!registration) {
        throw new Error('El Service Worker aún se está iniciando. Intenta de nuevo en un segundo.')
      }

      const existingSub = await registration.pushManager.getSubscription()
      const browserSub =
        existingSub ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.public_key),
        }))

      const dto = serializeBrowserSubscription(
        browserSub.toJSON(),
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined
      )

      return notificationsApi.subscribe(dto)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DEVICE_STATE_QUERY_KEY })
    },
  })

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const registration = await getReadyServiceWorkerRegistration(3000)
      const existingSub = await registration?.pushManager?.getSubscription()
      const endpoint = existingSub?.endpoint ?? stateQuery.data?.localEndpoint

      if (endpoint) {
        await notificationsApi.unsubscribe({ endpoint }).catch(() => undefined)
      }
      if (existingSub) {
        await existingSub.unsubscribe().catch(() => undefined)
      }
    },
    onSuccess: async () => {
      setTestDeliveredMessage(null)
      await queryClient.invalidateQueries({ queryKey: DEVICE_STATE_QUERY_KEY })
    },
  })

  const testPushMutation = useMutation({
    mutationFn: async (delaySeconds: number = 3) => {
      const registration = await getReadyServiceWorkerRegistration(3000)
      const existingSub = await registration?.pushManager?.getSubscription()
      const endpoint = existingSub?.endpoint ?? stateQuery.data?.localEndpoint

      if (!endpoint) {
        throw new Error('Activa primero los avisos en este dispositivo.')
      }

      setTestDeliveredMessage(null)
      const res = await notificationsApi.sendTestPush({
        endpoint,
        delay_seconds: delaySeconds,
      })

      if (timerRef.current) {
        clearInterval(timerRef.current)
      }

      if (res.delay_seconds > 0) {
        let remaining = res.delay_seconds
        setTestCountdown(remaining)
        timerRef.current = setInterval(() => {
          remaining -= 1
          if (remaining <= 0) {
            if (timerRef.current) clearInterval(timerRef.current)
            timerRef.current = null
            setTestCountdown(null)
            setTestDeliveredMessage('¡Aviso enviado! Revisa tus notificaciones.')
          } else {
            setTestCountdown(remaining)
          }
        }, 1000)
      } else {
        setTestDeliveredMessage('¡Aviso enviado! Revisa tus notificaciones.')
      }

      return res
    },
  })

  const uiState = deriveDevicePushUiState(stateQuery.data, stateQuery.isLoading)

  return {
    uiState,
    isSubscribedOnDevice: uiState === 'subscribed',
    subscriptionsCount: stateQuery.data?.subscriptionsCount ?? 0,
    isIos: stateQuery.data?.env.isIos ?? false,
    isStandalone: stateQuery.data?.env.isStandalone ?? false,
    isLoading: stateQuery.isLoading,
    subscribe: subscribeMutation.mutateAsync,
    isSubscribing: subscribeMutation.isPending,
    subscribeError: subscribeMutation.error,
    unsubscribe: unsubscribeMutation.mutateAsync,
    isUnsubscribing: unsubscribeMutation.isPending,
    sendTestNotification: () => testPushMutation.mutateAsync(3),
    isSendingTest: testPushMutation.isPending || testCountdown !== null,
    testCountdown,
    testDeliveredMessage,
    testError: testPushMutation.error,
  }
}
