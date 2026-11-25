import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { activitiesApi } from '../api/activities.api'

export function useMusicSearch(rawQuery: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(rawQuery)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(rawQuery.trim())
    }, 350)
    return () => clearTimeout(timer)
  }, [rawQuery])

  const searchQuery = useQuery({
    queryKey: ['activities', 'music', 'search', debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => activitiesApi.searchMusic(debouncedQuery),
  })

  return {
    tracks: searchQuery.data?.tracks ?? [],
    isSearching: searchQuery.isFetching,
    error: searchQuery.error,
  }
}
