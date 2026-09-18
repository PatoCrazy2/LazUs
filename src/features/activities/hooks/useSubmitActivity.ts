import { useState } from 'react'
import { enqueueMutation } from '../../../db/outbox'

export function useSubmitActivity(activityId: string) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavedLocally, setIsSavedLocally] = useState(false)

  const submitAnswer = async (content: string) => {
    setIsSubmitting(true)
    try {
      // 1. Guardar de forma optimista en Outbox de Dexie con UUIDv4 para idempotencia
      const outboxItem = await enqueueMutation('SUBMIT_ACTIVITY', {
        activity_id: activityId,
        content,
      })

      setIsSavedLocally(true)
      return outboxItem
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    submitAnswer,
    isSubmitting,
    isSavedLocally,
  }
}
