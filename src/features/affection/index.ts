export {
  AffectionApiError,
  affectionApi,
  type SendAffectionResponse,
} from './api/affection.api'
export {
  FloatingHeartBurst,
  type FloatingHeartBurstProps,
} from './components/FloatingHeartBurst'
export { useSendAffection } from './hooks/useSendAffection'
export {
  AFFECTION_COOLDOWN_MS,
  type AffectionEventType,
  affectionStore,
  type EnqueueAffectionResult,
} from './store/affection.store'
export { AFFECTION_HAPTIC_PATTERN, triggerAffectionHaptics } from './utils/haptics'
