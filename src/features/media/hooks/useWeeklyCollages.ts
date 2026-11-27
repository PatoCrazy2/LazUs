import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { WeeklyCollageItem } from '../../../../shared'
import { useAuth } from '../../auth/hooks/useAuth'
import { useCouple } from '../../couple/hooks/useCouple'
import { mediaApi } from '../api/media.api'
import {
  renderWeeklyCollageCanvas,
  type CollageTheme,
} from '../utils/collage-renderer'

export const WEEKLY_COLLAGES_QUERY_KEY = ['media', 'collages'] as const

export function useWeeklyCollages() {
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()
  const { couple, partner } = useCouple()
  const hasActiveCouple = couple?.status === 'active'

  const collagesQuery = useQuery({
    queryKey: WEEKLY_COLLAGES_QUERY_KEY,
    enabled: isAuthenticated && hasActiveCouple,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await mediaApi.listWeeklyCollages()
      return res.items
    },
  })

  const renderMutation = useMutation({
    mutationFn: async (params: { collage: WeeklyCollageItem; theme?: CollageTheme }) => {
      // 1. Dibujar tarjeta 1080×1920 en Canvas 2D del navegador ($0 CPU en Workers)
      const blob = await renderWeeklyCollageCanvas(params.collage, {
        myName: user?.displayName,
        partnerName: partner?.display_name,
        theme: params.theme ?? 'light',
      })

      // 2. Subir PNG directamente a Cloudflare R2
      const { mediaKey } = await mediaApi.uploadMediaDirect({
        kind: 'collage',
        blob,
        contentType: 'image/png',
        collageId: params.collage.id,
      })

      // 3. Persistir en PostgreSQL (weekly_collages) para que ambos compartan el mismo collage
      const saved = await mediaApi.saveRenderedCollage(params.collage.id, mediaKey)
      await queryClient.invalidateQueries({ queryKey: WEEKLY_COLLAGES_QUERY_KEY })

      return {
        blob,
        collage: saved.collage,
      }
    },
  })

  return {
    collages: collagesQuery.data ?? [],
    isLoading: collagesQuery.isLoading,
    error: collagesQuery.error,
    renderCollage: renderMutation.mutateAsync,
    isRendering: renderMutation.isPending,
    renderError: renderMutation.error,
  }
}
