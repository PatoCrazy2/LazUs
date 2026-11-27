import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { ACTIVITY_HISTORY_QUERY_KEY } from '../activities/hooks/useActivityHistory'
import { TODAY_ACTIVITY_QUERY_KEY } from '../activities/hooks/useTodayActivity'
import { AUTH_QUERY_KEY, useAuth } from '../auth/hooks/useAuth'
import { COUPLE_CURRENT_QUERY_KEY, useCouple } from '../couple/hooks/useCouple'
import { WEEKLY_COLLAGES_QUERY_KEY } from '../media'
import { CoupleRealtimeClient, type RealtimeConnectionStatus } from './realtime.client'
import {
  type AffectionPulse,
  CoupleRealtimeContext,
  handleRealtimeDomainEvent,
  type PairingCelebration,
} from './realtime.context'

interface RealtimeProviderProps {
  children: ReactNode
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()
  const { couple } = useCouple()
  const coupleId = couple?.status === 'active' ? couple.id : null

  // Clave determinista de sala: evita condiciones de carrera al pasar de user:<id> -> couple:<id>
  const roomKey = isAuthenticated
    ? coupleId
      ? `couple:${coupleId}`
      : user?.id
        ? `user:${user.id}`
        : null
    : null

  const [rawStatus, setRawStatus] = useState<RealtimeConnectionStatus>('disconnected')
  const [rawPartnerOnline, setRawPartnerOnline] = useState(false)
  const [affectionPulse, setAffectionPulse] = useState<AffectionPulse | null>(null)
  const [pairingCelebration, setPairingCelebration] = useState<PairingCelebration | null>(null)

  useEffect(() => {
    if (!roomKey) {
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
            void queryClient.invalidateQueries({ queryKey: WEEKLY_COLLAGES_QUERY_KEY })
          },
          invalidateCoupleState: () => {
            void queryClient.invalidateQueries({ queryKey: COUPLE_CURRENT_QUERY_KEY })
            void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
          },
          triggerAffection: (eventType) => {
            setAffectionPulse({ id: Date.now(), eventType })
          },
          triggerPairingCelebration: (pairedCoupleId, partnerDisplayName) => {
            setPairingCelebration({
              id: Date.now(),
              coupleId: pairedCoupleId,
              partnerDisplayName,
            })
          },
        })
      },
    })

    client.start()
    return () => {
      client.stop()
    }
  }, [roomKey, queryClient])

  const value = useMemo(
    () => ({
      connectionStatus: roomKey ? rawStatus : ('disconnected' as const),
      isPartnerOnline: coupleId !== null ? rawPartnerOnline : false,
      affectionPulse: coupleId !== null ? affectionPulse : null,
      pairingCelebration: isAuthenticated ? pairingCelebration : null,
    }),
    [roomKey, rawStatus, coupleId, rawPartnerOnline, affectionPulse, isAuthenticated, pairingCelebration]
  )

  return <CoupleRealtimeContext.Provider value={value}>{children}</CoupleRealtimeContext.Provider>
}
