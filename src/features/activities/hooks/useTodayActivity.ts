import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { SubmissionPayload, TodayActivityResponse } from '../../../../shared'
import { enqueueMutation } from '../../../db/outbox'
import { useAuth } from '../../auth/hooks/useAuth'
import { useCouple } from '../../couple/hooks/useCouple'
import { ActivitiesApiError, activitiesApi } from '../api/activities.api'
import { activitiesStore } from '../store/activities.store'
import { mediaApi, pendingMediaStore } from '../../media'
import { ACTIVITY_HISTORY_QUERY_KEY } from './useActivityHistory'

export const TODAY_ACTIVITY_QUERY_KEY = ['activities', 'today'] as const

export function useTodayActivity() {
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()
  const { couple } = useCouple()
  const hasActiveCouple = couple?.status === 'active'

  const todayQuery = useQuery({
    queryKey: TODAY_ACTIVITY_QUERY_KEY,
    enabled: isAuthenticated && hasActiveCouple,
    retry: false,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TodayActivityResponse> => {
      try {
        // Primero intentar sincronizar cualquier respuesta pendiente offline
        await activitiesStore.flushOutbox()
        const data = await activitiesApi.getTodayActivity()
        await activitiesStore.saveTodayActivity(data)
        return data
      } catch (err) {
        if (err instanceof ActivitiesApiError && (err.status === 401 || err.status === 403)) {
          throw err
        }

        // Modo offline: reconstruir vista segura desde Dexie
        const local = await activitiesStore.getLatestLocalActivity()
        if (local) {
          return {
            id: local.id,
            logical_date: local.logicalDate,
            prompt: local.prompt,
            category: local.category ?? 'getting_to_know',
            tone: local.tone ?? 'light',
            occasion: local.occasion ?? 'daily',
            response_type: local.responseType ?? 'text_only',
            prompt_config: local.promptConfig ?? null,
            status: local.status,
            revealed_at: local.revealedAt ?? null,
            my_submission: local.mySubmissionCompleted
              ? {
                  content: local.myContent ?? null,
                  media_key: local.myMediaKey ?? null,
                  payload: local.myPayload ?? null,
                  completed_at: new Date().toISOString(),
                }
              : null,
            partner_completed: local.partnerSubmissionCompleted,
            ...(local.status === 'revealed'
              ? {
                  partner_submission: {
                    content: local.partnerContent ?? null,
                    media_key: local.partnerMediaKey ?? null,
                    payload: local.partnerPayload ?? null,
                    completed_at: local.revealedAt ?? new Date().toISOString(),
                  },
                }
              : {}),
          }
        }
        throw err
      }
    },
  })

  // Reconciliación automática del Outbox al recuperar red o volver de segundo plano
  useEffect(() => {
    if (!isAuthenticated || !hasActiveCouple) return

    const syncPending = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      const synced = await activitiesStore.flushOutbox()
      if (synced > 0) {
        await queryClient.invalidateQueries({ queryKey: TODAY_ACTIVITY_QUERY_KEY })
        await queryClient.invalidateQueries({ queryKey: ACTIVITY_HISTORY_QUERY_KEY })
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncPending()
      }
    }

    window.addEventListener('online', syncPending)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('online', syncPending)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isAuthenticated, hasActiveCouple, queryClient])

  const submitMutation = useMutation({
    mutationFn: async (params: {
      activityId: string
      content?: string
      payload?: SubmissionPayload
      media?: {
        kind: 'photo' | 'voice'
        blob: Blob
        contentType: string
      }
    }) => {
      let mediaKey: string | undefined
      let pendingMediaId: string | undefined

      if (params.media) {
        const isOnline = typeof navigator === 'undefined' || navigator.onLine
        if (isOnline) {
          try {
            const uploaded = await mediaApi.uploadMediaDirect({
              kind: params.media.kind,
              blob: params.media.blob,
              contentType: params.media.contentType,
              activityId: params.activityId,
            })
            mediaKey = uploaded.mediaKey
          } catch {
            // Si la red cae durante la subida, respaldamos el Blob comprimido en pending_media
            const saved = await pendingMediaStore.savePendingMedia({
              kind: params.media.kind,
              blob: params.media.blob,
              contentType: params.media.contentType,
            })
            pendingMediaId = saved.id
          }
        } else {
          // Modo offline: guardar Blob comprimido (~350-500 KB) en Dexie con purga automática al sincronizar
          const saved = await pendingMediaStore.savePendingMedia({
            kind: params.media.kind,
            blob: params.media.blob,
            contentType: params.media.contentType,
          })
          pendingMediaId = saved.id
        }
      }

      // 1. Guardar optimistamente en Dexie + encolar en Outbox con client_mutation_id estable
      await activitiesStore.saveOptimisticSubmission(
        params.activityId,
        params.content,
        params.payload,
        mediaKey
      )

      const outboxItem = await enqueueMutation('SUBMIT_ACTIVITY', {
        activity_id: params.activityId,
        content: params.content,
        media_key: mediaKey,
        pending_media_id: pendingMediaId,
        payload: params.payload,
      })

      // 2. Actualizar caché local de TanStack Query de inmediato para UX instantánea
      const current = queryClient.getQueryData<TodayActivityResponse>(TODAY_ACTIVITY_QUERY_KEY)
      if (current && current.id === params.activityId) {
        queryClient.setQueryData<TodayActivityResponse>(TODAY_ACTIVITY_QUERY_KEY, {
          ...current,
          my_submission: {
            content: params.content ?? null,
            media_key: mediaKey ?? null,
            payload: params.payload ?? null,
            completed_at: new Date().toISOString(),
          },
        })
      }

      // 3. Intentar sincronizar inmediatamente si hay red
      if (typeof navigator === 'undefined' || navigator.onLine) {
        await activitiesStore.flushOutbox()
        await queryClient.invalidateQueries({ queryKey: TODAY_ACTIVITY_QUERY_KEY })
        await queryClient.invalidateQueries({ queryKey: ACTIVITY_HISTORY_QUERY_KEY })
      }

      return { clientMutationId: outboxItem.client_mutation_id }
    },
  })

  return {
    activity: todayQuery.data ?? null,
    isLoading: todayQuery.isLoading,
    isFetching: todayQuery.isFetching,
    error: todayQuery.error,
    refetch: todayQuery.refetch,
    submitAnswer: submitMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
    submitError: submitMutation.error,
  }
}
