import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { ACTIVITY_HISTORY_QUERY_KEY } from '../activities/hooks/useActivityHistory'
import { TODAY_ACTIVITY_QUERY_KEY } from '../activities/hooks/useTodayActivity'
import { useAuth } from '../auth/hooks/useAuth'
import { useCouple } from '../couple/hooks/useCouple'
import { CoupleRealtimeClient, type RealtimeConnectionStatus } from './realtime.client'
import {
  type AffectionPulse,
  CoupleRealtimeContext,
  handleRealtimeDomainEvent,
} from './realtime.context'

interface RealtimeProviderProps {
  children: ReactNode
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()
  const { couple } = useCouple()
  const coupleId = couple?.status === 'active' ? couple.id : null
  const shouldConnect = isAuthenticated && coupleId !== null

  const [rawStatus, setRawStatus] = useState<RealtimeConnectionStatus>('disconnected')
  const [rawPartnerOnline, setRawPartnerOnline] = useState(false)
  const [affectionPulse, setAffectionPulse] = useState<AffectionPulse | null>(null)

  useEffect(() => {
    if (!shouldConnect || !coupleId) {
      return
    }

    const client = new CoupleRealtimeClient({
      onStatusChange: (status) => {
        setRawStatus(status)
        if (status === 'disconnected') {
          setRawPartnerOnline(false)
        }
      },
      onEvent: (event) => {
        handleRealtimeDomainEvent(event, {
          setPartnerOnline: setRawPartnerOnline,
          invalidateTodayActivity: () => {
            void queryClient.invalidateQueries({ queryKey: TODAY_ACTIVITY_QUERY_KEY })
          },
          invalidateActivityHistory: () => {
            void queryClient.invalidateQueries({ queryKey: ACTIVITY_HISTORY_QUERY_KEY })
          },
          triggerAffection: (eventType) => {
            setAffectionPulse({ id: Date.now(), eventType })
          },
        })
      },
    })

    client.start()
    return () => {
      client.stop()
    }
  }, [shouldConnect, coupleId, queryClient])

  const value = useMemo(
    () => ({
      connectionStatus: shouldConnect ? rawStatus : ('disconnected' as const),
      isPartnerOnline: shouldConnect ? rawPartnerOnline : false,
      affectionPulse: shouldConnect ? affectionPulse : null,
    }),
    [shouldConnect, rawStatus, rawPartnerOnline, affectionPulse]
  )

  return <CoupleRealtimeContext.Provider value={value}>{children}</CoupleRealtimeContext.Provider>
}
