import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/hooks/useAuth'
import { useCouple } from '../../couple/hooks/useCouple'
import { activitiesApi } from '../api/activities.api'

export const ACTIVITY_HISTORY_QUERY_KEY = ['activities', 'history'] as const

export function useActivityHistory() {
  const { isAuthenticated } = useAuth()
  const { couple } = useCouple()
  const hasActiveCouple = couple?.status === 'active'

  const historyQuery = useQuery({
    queryKey: ACTIVITY_HISTORY_QUERY_KEY,
    enabled: isAuthenticated && hasActiveCouple,
    retry: false,
    staleTime: 2 * 60 * 1000,
    queryFn: () => activitiesApi.getHistory(),
  })

  return {
    items: historyQuery.data?.items ?? [],
    isLoading: historyQuery.isLoading,
    error: historyQuery.error,
    refetch: historyQuery.refetch,
  }
}
