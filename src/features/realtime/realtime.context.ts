import { createContext } from 'react'
import type { SafeRealtimeEvent } from '../../../shared'
import type { RealtimeConnectionStatus } from './realtime.client'

export interface AffectionPulse {
  id: number
  eventType: string
}

export interface PairingCelebration {
  id: number
  coupleId: string
  partnerDisplayName: string
}

export interface CoupleRealtimeContextValue {
  connectionStatus: RealtimeConnectionStatus
  isPartnerOnline: boolean
  affectionPulse: AffectionPulse | null
  pairingCelebration: PairingCelebration | null
}

export const DEFAULT_REALTIME_CONTEXT: CoupleRealtimeContextValue = {
  connectionStatus: 'disconnected',
  isPartnerOnline: false,
  affectionPulse: null,
  pairingCelebration: null,
}

export const CoupleRealtimeContext = createContext<CoupleRealtimeContextValue>(
  DEFAULT_REALTIME_CONTEXT
)

export interface RealtimeDomainHandlers {
  setPartnerOnline: (online: boolean) => void
  invalidateTodayActivity: () => void
  invalidateActivityHistory: () => void
  invalidateCoupleState?: () => void
  triggerAffection: (eventType: string) => void
  triggerPairingCelebration?: (coupleId: string, partnerDisplayName: string) => void
  vibrate?: (pattern: number[]) => void
}

export const AFFECTION_VIBRATION_PATTERN = [40, 60, 40]
export const PAIRING_VIBRATION_PATTERN = [60, 50, 100]

function triggerHaptics(pattern: number[], customVibrate?: (pattern: number[]) => void): void {
  if (customVibrate) {
    customVibrate(pattern)
    return
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern)
  }
}

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
      triggerHaptics(AFFECTION_VIBRATION_PATTERN, handlers.vibrate)
      handlers.triggerAffection(event.eventType)
      return
    case 'couple_paired':
      triggerHaptics(PAIRING_VIBRATION_PATTERN, handlers.vibrate)
      handlers.invalidateCoupleState?.()
      handlers.invalidateTodayActivity()
      handlers.triggerPairingCelebration?.(event.coupleId, event.partnerDisplayName)
      return
  }
}
