import { useState } from 'react'
import { enqueueMutation } from '../../../db/outbox'

export function useSendAffection() {
  const [isSending, setIsSending] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)

  const sendAffection = async (eventType: 'heart_tap' | 'hug' | 'kiss' = 'heart_tap') => {
    setIsSending(true)
    try {
      // Vibración háptica nativa inmediata si el dispositivo la soporta
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 60, 40])
      }

      await enqueueMutation('SEND_AFFECTION', {
        event_type: eventType,
      })

      setLastSentAt(Date.now())
    } finally {
      setIsSending(false)
    }
  }

  return {
    sendAffection,
    isSending,
    lastSentAt,
  }
}
