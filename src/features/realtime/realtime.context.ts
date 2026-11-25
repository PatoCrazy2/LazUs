import { createContext } from 'react'
import type { SafeRealtimeEvent } from '../../../shared'
import type { RealtimeConnectionStatus } from './realtime.client'

export interface AffectionPulse {
  id: number
  eventType: string
}

export interface CoupleRealtimeContextValue {
  connectionStatus: RealtimeConnectionStatus
  isPartnerOnline: boolean
  affectionPulse: AffectionPulse | null
}

export const DEFAULT_REALTIME_CONTEXT: CoupleRealtimeContextValue = {
  connectionStatus: 'disconnected',
  isPartnerOnline: false,
  affectionPulse: null,
}

export const CoupleRealtimeContext = createContext<CoupleRealtimeContextValue>(
  DEFAULT_REALTIME_CONTEXT
)

export interface RealtimeDomainHandlers {
  setPartnerOnline: (online: boolean) => void
  invalidateTodayActivity: () => void
  invalidateActivityHistory: () => void
  triggerAffection: (eventType: string) => void
  vibrate?: (pattern: number[]) => void
}

export const AFFECTION_VIBRATION_PATTERN = [40, 60, 40]

export function handleRealtimeDomainEvent(
  event: SafeRealtimeEvent,
  handlers: RealtimeDomainHandlers
): void {
  switch (event.type) {
    case 'partner_online':
      handlers.setPartnerOnline(true)
      return
    case 'partner_offline':
      handlers.setPartnerOnline(false)
      return
    case 'partner_submission_completed':
      handlers.invalidateTodayActivity()
      return
    case 'activity_ready_to_reveal':
      handlers.invalidateTodayActivity()
      handlers.invalidateActivityHistory()
      return
    case 'affection_received':
      if (handlers.vibrate) {
        handlers.vibrate(AFFECTION_VIBRATION_PATTERN)
      } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(AFFECTION_VIBRATION_PATTERN)
      }
      handlers.triggerAffection(event.eventType)
      return
  }
}
