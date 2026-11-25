import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PairCoupleResponse } from '../../../../shared'
import { db } from '../../../db'
import { AUTH_QUERY_KEY, useAuth } from '../../auth/hooks/useAuth'
import { coupleApi } from '../api/couple.api'
import { coupleStore } from '../store/couple.store'

export const COUPLE_CURRENT_QUERY_KEY = ['couple', 'current'] as const
export const COUPLE_RESOLVE_QUERY_KEY = (identifier: string) => ['couple', 'resolve', identifier] as const

export function useCouple() {
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()

  // Consulta de la pareja actual (con caché y fallback a Dexie si falla la red)
  const currentCoupleQuery = useQuery({
    queryKey: COUPLE_CURRENT_QUERY_KEY,
    enabled: isAuthenticated,
    retry: false,
    queryFn: async () => {
      try {
        const data = await coupleApi.getCurrentCouple()
        if (data.couple) {
          await coupleStore.saveCouple({
            id: data.couple.id,
            status: data.couple.status,
            partnerId: data.partner?.id,
            partnerName: data.partner?.display_name,
            anniversaryDate: data.couple.anniversary_date || undefined,
          })
        } else {
          await coupleStore.clearCouple()
        }
        return data
      } catch (err) {
        const status = (err as { status?: number })?.status
        if (status === 401) {
          await coupleStore.clearCouple()
          throw err
        }

        // En caso de modo offline, intentar leer de Dexie
        const localCouple = await coupleStore.getCouple()
        if (localCouple) {
          return {
            couple: {
              id: localCouple.id,
              status: localCouple.status,
              anniversary_date: localCouple.anniversaryDate || null,
              created_at: new Date().toISOString(),
            },
            partner: localCouple.partnerId
              ? {
                  id: localCouple.partnerId,
                  display_name: localCouple.partnerName || 'Pareja',
                  avatar_url: null,
                }
              : null,
            my_tags: [],
          }
        }
        throw err
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  // Mutación para auto-reclamar pulsera virgen
  const claimTagMutation = useMutation({
    mutationFn: async (tagIdentifier: string) => {
      return await coupleApi.claimTag({ tag_identifier: tagIdentifier })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COUPLE_CURRENT_QUERY_KEY })
    },
  })

  // Mutación para realizar la vinculación (El Ritual de Unión)
  const pairMutation = useMutation({
    mutationFn: async ({ identifier, clientMutationId }: { identifier: string; clientMutationId: string }) => {
      return await coupleApi.pair({
        identifier,
        client_mutation_id: clientMutationId,
      })
    },
    onSuccess: async (data: PairCoupleResponse) => {
      // 1. Guardar en Dexie db.couple
      await coupleStore.saveCouple({
        id: data.couple_id,
        status: 'active',
        partnerId: data.partner.id,
        partnerName: data.partner.display_name,
      })

      // 2. Actualizar db.profile con el nuevo couple_id
      const currentProfile = await db.profile.toCollection().first()
      if (currentProfile) {
        await db.profile.update(currentProfile.id, {
          coupleId: data.couple_id,
        })
      }

      // 3. Invalidar consultas de TanStack Query
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
      await queryClient.invalidateQueries({ queryKey: COUPLE_CURRENT_QUERY_KEY })
    },
  })

  // Mutación para generar código digital de respaldo LZ-XXXX
  const createInviteCodeMutation = useMutation({
    mutationFn: async () => {
      return await coupleApi.createInviteCode()
    },
  })

  return {
    couple: currentCoupleQuery.data?.couple,
    partner: currentCoupleQuery.data?.partner,
    myTags: currentCoupleQuery.data?.my_tags ?? [],
    isLoadingCouple: currentCoupleQuery.isLoading,
    currentCoupleQuery,
    claimTag: claimTagMutation.mutateAsync,
    isClaiming: claimTagMutation.isPending,
    pair: pairMutation.mutateAsync,
    isPairing: pairMutation.isPending,
    pairError: pairMutation.error,
    createInviteCode: createInviteCodeMutation.mutateAsync,
    isCreatingInviteCode: createInviteCodeMutation.isPending,
  }
}

/**
 * Hook para resolver un identificador (/api/couple/resolve/:identifier)
 */
export function useResolveIdentifier(identifier: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: COUPLE_RESOLVE_QUERY_KEY(identifier),
    queryFn: () => coupleApi.resolveIdentifier(identifier),
    enabled: options.enabled ?? Boolean(identifier),
    retry: false,
  })
}
