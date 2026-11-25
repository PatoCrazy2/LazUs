export {
  AffectionApiError,
  affectionApi,
  type SendAffectionResponse,
} from './api/affection.api'
export { useSendAffection } from './hooks/useSendAffection'
export {
  AFFECTION_COOLDOWN_MS,
  type AffectionEventType,
  affectionStore,
  type EnqueueAffectionResult,
} from './store/affection.store'
