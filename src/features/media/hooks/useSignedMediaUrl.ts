import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { mediaApi } from '../api/media.api'

export const SIGNED_MEDIA_STALE_MS = 10 * 60 * 1000 // 10 min (< 15 min TTL de R2)
export const SIGNED_MEDIA_GC_MS = 12 * 60 * 1000

export function getSignedMediaQueryKey(mediaKey: string | null | undefined) {
  return ['media', 'view-url', mediaKey ?? ''] as const
}

export function useSignedMediaUrl(mediaKey: string | null | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: getSignedMediaQueryKey(mediaKey),
    enabled: Boolean(mediaKey),
    staleTime: SIGNED_MEDIA_STALE_MS,
    gcTime: SIGNED_MEDIA_GC_MS,
    retry: 1,
    queryFn: async () => {
      const res = await mediaApi.requestViewUrl(mediaKey!)
      return res.view_url
    },
  })

  const refreshUrl = useCallback(async () => {
    if (!mediaKey) return
    await queryClient.invalidateQueries({ queryKey: getSignedMediaQueryKey(mediaKey) })
  }, [mediaKey, queryClient])

  return {
    viewUrl: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refreshUrl,
  }
}
