export const AFFECTION_HAPTIC_PATTERN = [40, 60, 40]

/**
 * Dispara el patrón háptico [40, 60, 40] de forma segura con feature detection.
 * No lanza excepciones en iOS Safari, escritorio o WebViews restringidos.
 */
export function triggerAffectionHaptics(
  customVibrate?: (pattern: number[]) => boolean | void
): boolean {
  try {
    if (customVibrate) {
      customVibrate([...AFFECTION_HAPTIC_PATTERN])
      return true
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return Boolean(navigator.vibrate([...AFFECTION_HAPTIC_PATTERN]))
    }
  } catch {
    // Ignorar silenciosamente bloqueos del navegador sin gesto previo
  }

  return false
}
