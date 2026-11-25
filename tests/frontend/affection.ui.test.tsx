import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TapIntentSchema } from '../../shared'
import {
  AFFECTION_HAPTIC_PATTERN,
  FloatingHeartBurst,
  triggerAffectionHaptics,
} from '../../src/features/affection'

describe('Affection Haptics, FloatingHeartBurst & TapIntent Contracts - Fase 2', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('triggerAffectionHaptics', () => {
    it('dispara navigator.vibrate([40, 60, 40]) cuando el dispositivo soporta Vibration API', () => {
      const vibrateMock = vi.fn().mockReturnValue(true)
      vi.stubGlobal('navigator', { vibrate: vibrateMock })

      const didVibrate = triggerAffectionHaptics()

      expect(didVibrate).toBe(true)
      expect(vibrateMock).toHaveBeenCalledTimes(1)
      expect(vibrateMock).toHaveBeenCalledWith([40, 60, 40])
      expect(AFFECTION_HAPTIC_PATTERN).toEqual([40, 60, 40])
    })

    it('degrada sin errores en iOS Safari / escritorio sin navigator.vibrate o cuando lanza excepción', () => {
      vi.stubGlobal('navigator', {})
      expect(triggerAffectionHaptics()).toBe(false)

      vi.stubGlobal('navigator', {
        vibrate: () => {
          throw new Error('NotAllowedError: user gesture required')
        },
      })
      expect(triggerAffectionHaptics()).toBe(false)
    })

    it('permite inyectar vibrador personalizado para pruebas deterministas', () => {
      const custom = vi.fn()
      expect(triggerAffectionHaptics(custom)).toBe(true)
      expect(custom).toHaveBeenCalledWith([40, 60, 40])
    })
  })

  describe('FloatingHeartBurst UI Rendering', () => {
    it('no renderiza contenido visible cuando burstId es null', () => {
      const html = renderToStaticMarkup(<FloatingHeartBurst burstId={null} partnerName="Sofía" />)
      expect(html).toContain('aria-live="polite"')
      expect(html).not.toContain('Toque enviado')
    })

    it('renderiza el corazón flotante y mensaje personalizado con el nombre de la pareja', () => {
      const html = renderToStaticMarkup(<FloatingHeartBurst burstId={101} partnerName="Sofía" />)
      expect(html).toContain('Toque enviado a Sofía ❤️')
      expect(html).toContain('svg')
    })

    it('renderiza mensaje genérico cálido cuando no se proporciona partnerName', () => {
      const html = renderToStaticMarkup(<FloatingHeartBurst burstId={102} />)
      expect(html).toContain('Toque de afecto enviado ❤️')
    })
  })

  describe('TapIntentSchema Routing Contract', () => {
    it('acepta únicamente las 3 intenciones válidas de resolución NFC', () => {
      expect(TapIntentSchema.safeParse('answer').success).toBe(true)
      expect(TapIntentSchema.safeParse('affection_sent').success).toBe(true)
      expect(TapIntentSchema.safeParse('reveal').success).toBe(true)
      expect(TapIntentSchema.safeParse('unknown_action').success).toBe(false)
      expect(TapIntentSchema.safeParse(undefined).success).toBe(false)
    })
  })
})
