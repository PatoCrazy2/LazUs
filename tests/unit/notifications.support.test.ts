import { describe, expect, it } from 'vitest'
import {
  encodeBase64Url,
  generateVapidKeyPair,
} from '../../server/features/notifications/webpush.crypto'
import {
  deriveDevicePushUiState,
  detectIosDevice,
  detectStandaloneMode,
  evaluatePushEnvironment,
  parseIncomingPushPayload,
  resolveNotificationTargetUrl,
  serializeBrowserSubscription,
  shouldSuppressForegroundPush,
  urlBase64ToUint8Array,
} from '../../src/features/notifications'

describe('Push Support, iOS Standalone Guard & Service Worker Logic - Fase 3', () => {
  describe('Detección iOS / iPadOS y Standalone obligatorio', () => {
    it('identifica correctamente iPhone, iPad e iPadOS 13+ (MacIntel táctil) frente a macOS y Android', () => {
      expect(
        detectIosDevice({
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        })
      ).toBe(true)

      // iPadOS en modo escritorio
      expect(
        detectIosDevice({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        })
      ).toBe(true)

      // MacBook real sin pantalla táctil
      expect(
        detectIosDevice({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 0,
        })
      ).toBe(false)

      // Android Chrome
      expect(
        detectIosDevice({
          userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0',
        })
      ).toBe(false)
    })

    it('detecta modo standalone tanto por navigator.standalone (iOS) como por display-mode: standalone', () => {
      expect(
        detectStandaloneMode({
          navigatorObj: { standalone: true },
          windowObj: {},
        })
      ).toBe(true)

      expect(
        detectStandaloneMode({
          navigatorObj: { standalone: false },
          windowObj: {
            matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }),
          },
        })
      ).toBe(true)

      expect(
        detectStandaloneMode({
          navigatorObj: { standalone: false },
          windowObj: {
            matchMedia: () => ({ matches: false }),
          },
        })
      ).toBe(false)
    })

    it('REGLA CRÍTICA iOS: devuelve ios_needs_install en Safari móvil sin instalar aunque PushManager esté oculto', () => {
      const snapshot = evaluatePushEnvironment({
        navigatorObj: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile Safari',
          standalone: false,
          serviceWorker: {},
        },
        // En iOS Safari pestaña normal, Apple ni siquiera expone PushManager hasta instalar la PWA
        windowObj: {
          matchMedia: () => ({ matches: false }),
        },
      })

      expect(snapshot).toEqual({
        capability: 'ios_needs_install',
        isIos: true,
        isStandalone: false,
        permission: 'unsupported',
      })
    })

    it('habilita flujo de permisos en iOS una vez instalada en pantalla de inicio (standalone)', () => {
      const snapshot = evaluatePushEnvironment({
        navigatorObj: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile',
          standalone: true,
          serviceWorker: {},
        },
        windowObj: {
          PushManager: function PushManager() {},
          Notification: { permission: 'default' },
        },
      })

      expect(snapshot).toEqual({
        capability: 'prompt',
        isIos: true,
        isStandalone: true,
        permission: 'default',
      })
    })

    it('evalúa permisos granted, denied y navegadores sin soporte en Android/Desktop', () => {
      const granted = evaluatePushEnvironment({
        navigatorObj: { userAgent: 'Android Chrome', serviceWorker: {} },
        windowObj: {
          PushManager: {},
          Notification: { permission: 'granted' },
          matchMedia: () => ({ matches: false }),
        },
      })
      expect(granted.capability).toBe('granted')

      const denied = evaluatePushEnvironment({
        navigatorObj: { userAgent: 'Android Chrome', serviceWorker: {} },
        windowObj: {
          PushManager: {},
          Notification: { permission: 'denied' },
        },
      })
      expect(denied.capability).toBe('denied')

      const unsupported = evaluatePushEnvironment({
        navigatorObj: { userAgent: 'Legacy Browser' },
        windowObj: {},
      })
      expect(unsupported.capability).toBe('unsupported')
    })
  })

  describe('Conversión VAPID y serialización de suscripciones', () => {
    it('convierte VAPID publicKey base64url a Uint8Array de 65 bytes sin comprimir', async () => {
      const { publicKey } = await generateVapidKeyPair()
      const bytes = urlBase64ToUint8Array(publicKey)
      expect(bytes.byteLength).toBe(65)
      expect(bytes[0]).toBe(0x04)
      expect(encodeBase64Url(bytes)).toBe(publicKey)
    })

    it('serializa PushSubscriptionJSON válido y rechaza claves incompletas', () => {
      const dto = serializeBrowserSubscription(
        {
          endpoint: 'https://web.push.apple.com/token-abc',
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        },
        'iPhone Standalone'
      )

      expect(dto).toEqual({
        endpoint: 'https://web.push.apple.com/token-abc',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        user_agent: 'iPhone Standalone',
      })

      expect(() =>
        serializeBrowserSubscription({
          endpoint: 'https://web.push.apple.com/token-abc',
          keys: {},
        })
      ).toThrow(/incompleta/i)
    })

    it('deriva estados de UI del dispositivo de forma determinista', () => {
      expect(deriveDevicePushUiState(undefined, true)).toBe('loading')
      expect(
        deriveDevicePushUiState(
          {
            env: { capability: 'ios_needs_install', isIos: true, isStandalone: false, permission: 'unsupported' },
            localEndpoint: null,
            serverEnabled: false,
            currentDeviceSubscribed: false,
            subscriptionsCount: 0,
          },
          false
        )
      ).toBe('ios_needs_install')

      expect(
        deriveDevicePushUiState(
          {
            env: { capability: 'granted', isIos: true, isStandalone: true, permission: 'granted' },
            localEndpoint: 'https://web.push.apple.com/1',
            serverEnabled: true,
            currentDeviceSubscribed: true,
            subscriptionsCount: 1,
          },
          false
        )
      ).toBe('subscribed')
    })
  })

  describe('Lógica del Service Worker (Zero-Leak, Supresión Primer Plano y Click Seguro)', () => {
    it('parsea payloads válidos, ofrece fallback en push vacío y descarta violaciones Zero-Leak', () => {
      const fallback = parseIncomingPushPayload('')
      expect(fallback?.title).toBe('LazUs')
      expect(fallback?.url).toBe('/')

      const valid = parseIncomingPushPayload(
        JSON.stringify({
          title: 'LazUs',
          body: '❤️ Sofía te envió un toque',
          tag: 'lazus-affection',
          renotify: true,
          url: '/',
        })
      )
      expect(valid).toEqual({
        title: 'LazUs',
        body: '❤️ Sofía te envió un toque',
        tag: 'lazus-affection',
        renotify: true,
        url: '/',
      })

      // Si tuviera un campo extra no permitido por SafePushPayloadSchema.strict(), devuelve null
      const leaked = parseIncomingPushPayload(
        JSON.stringify({
          title: 'LazUs',
          body: '✨ Sofía respondió',
          tag: 'lazus-daily-activity',
          renotify: true,
          url: '/',
          secret_content: 'prohibido',
        })
      )
      expect(leaked).toBeNull()
    })

    it('suprime el banner del sistema si hay ventana enfocada, salvo en avisos de prueba lazus-test', () => {
      const affectionPayload = {
        title: 'LazUs',
        body: '❤️ Sofía te envió un toque',
        tag: 'lazus-affection' as const,
        renotify: true,
        url: '/',
      }

      // App enfocada en primer plano -> suprimir (WebSocket ya mostró corazones)
      expect(
        shouldSuppressForegroundPush(affectionPayload, [
          { focused: true, visibilityState: 'visible' },
        ])
      ).toBe(true)

      // App en segundo plano -> NO suprimir
      expect(
        shouldSuppressForegroundPush(affectionPayload, [
          { focused: false, visibilityState: 'hidden' },
        ])
      ).toBe(false)

      // Aviso de prueba lazus-test -> NUNCA suprimir ni siquiera enfocado
      expect(
        shouldSuppressForegroundPush(
          {
            title: 'LazUs',
            body: '🔔 Prueba',
            tag: 'lazus-test',
            renotify: true,
            url: '/',
          },
          [{ focused: true, visibilityState: 'visible' }]
        )
      ).toBe(false)
    })

    it('resuelve siempre rutas internas del mismo origen al pulsar la notificación', () => {
      expect(resolveNotificationTargetUrl('/', 'https://app.lazus.com')).toBe(
        'https://app.lazus.com/'
      )
      expect(resolveNotificationTargetUrl('/?tapIntent=reveal', 'https://app.lazus.com')).toBe(
        'https://app.lazus.com/?tapIntent=reveal'
      )
      expect(resolveNotificationTargetUrl('https://evil.example/steal', 'https://app.lazus.com')).toBe(
        'https://app.lazus.com/'
      )
      expect(resolveNotificationTargetUrl('//evil.example', 'https://app.lazus.com')).toBe(
        'https://app.lazus.com/'
      )
    })
  })
})
