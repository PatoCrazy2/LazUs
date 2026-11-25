import { useContext } from 'react'
import { CoupleRealtimeContext } from '../realtime.context'

export function useCoupleRealtime() {
  return useContext(CoupleRealtimeContext)
}
