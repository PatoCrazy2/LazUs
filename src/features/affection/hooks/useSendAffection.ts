import { useCallback, useEffect, useState } from 'react'
import {
  type AffectionEventType,
  affectionStore,
  type EnqueueAffectionResult,
} from '../store/affection.store'

export function useSendAffection() {
  const [isSending, setIsSending] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)

  useEffect(() => {
    const syncPending = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      void affectionStore.flushOutbox()
    }

    // Reconciliar mutaciones pendientes al montar
    syncPending()

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncPending()
      }
    }

    window.addEventListener('online', syncPending)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('online', syncPending)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const sendAffection = useCallback(
    async (eventType: AffectionEventType = 'heart_tap'): Promise<EnqueueAffectionResult> => {
      setIsSending(true)
      try {
        // Vibración háptica nativa inmediata si el dispositivo la soporta
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([40, 60, 40])
        }

        const result = await affectionStore.sendOrQueueAffection(eventType)
        setLastSentAt(Date.now())
        return result
      } finally {
        setIsSending(false)
      }
    },
    []
  )

  return {
    sendAffection,
    isSending,
    lastSentAt,
  }
}
