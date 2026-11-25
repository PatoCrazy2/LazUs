import type { TapIntent } from '../../../../shared'
import { db } from '../../../db'
import {
  affectionStore,
  type EnqueueAffectionResult,
  triggerAffectionHaptics,
} from '../../affection'

export const DEFAULT_TAP_TIMEZONE = 'America/Mexico_City'

export type TapResolutionResult =
  | {
      type: 'redirect_link'
      identifier: string
      elapsedMs: number
    }
  | {
      type: 'navigate_home'
      tapIntent: TapIntent
      caseNumber: 1 | 2 | 3
      deduplicated?: boolean
      clientMutationId?: string | null
      elapsedMs: number
    }

export interface TapResolverOptions {
  referenceDate?: Date
  nowMs?: number
  timeZone?: string
  vibrate?: (pattern: number[]) => boolean | void
  enqueueAffection?: (nowMs: number) => Promise<EnqueueAffectionResult>
}

export function computeTapLogicalDate(
  referenceDate: Date = new Date(),
  timeZone: string = DEFAULT_TAP_TIMEZONE
): string {
  let safeTz = timeZone || DEFAULT_TAP_TIMEZONE
  try {
    Intl.DateTimeFormat('en-CA', { timeZone: safeTz })
  } catch {
    safeTz = DEFAULT_TAP_TIMEZONE
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate)
}

/**
 * Resuelve instantáneamente (<50 ms) la acción de una lectura HTTPS /tap/:tagId
 * consultando únicamente Dexie local (cero bloqueo por red, cero Web NFC API).
 */
export async function resolveTapAction(
  tagId: string,
  options: TapResolverOptions = {}
): Promise<TapResolutionResult> {
  const startPerf = performance.now()
  const cleanTagId = tagId.trim()
  const referenceDate = options.referenceDate ?? new Date()
  const nowMs = options.nowMs ?? referenceDate.getTime()

  // Lectura paralela ultrarrápida sobre índices locales de Dexie
  const [couple, profile, latestActivity] = await Promise.all([
    db.couple.toCollection().first(),
    db.profile.toCollection().first(),
    db.activities.orderBy('logicalDate').reverse().first(),
  ])

  const hasActiveCouple = couple ? couple.status === 'active' : Boolean(profile?.coupleId)

  // Opción A: Si el usuario aún no tiene pareja vinculada activa, delegar al flujo /link/:identifier
  if (!hasActiveCouple) {
    return {
      type: 'redirect_link',
      identifier: cleanTagId,
      elapsedMs: performance.now() - startPerf,
    }
  }

  const todayLogicalDate = computeTapLogicalDate(referenceDate, options.timeZone)
  const todayActivity =
    latestActivity && latestActivity.logicalDate === todayLogicalDate ? latestActivity : undefined

  // Caso 1: No existe actividad local hoy o el usuario aún no ha respondido -> ir a responder
  if (!todayActivity || !todayActivity.mySubmissionCompleted) {
    return {
      type: 'navigate_home',
      tapIntent: 'answer',
      caseNumber: 1,
      elapsedMs: performance.now() - startPerf,
    }
  }

  // Caso 3: Ambos respondieron (o el estado ya figura como 'revealed') -> abrir resultados revelados
  if (
    todayActivity.status === 'revealed' ||
    (todayActivity.mySubmissionCompleted && todayActivity.partnerSubmissionCompleted)
  ) {
    return {
      type: 'navigate_home',
      tapIntent: 'reveal',
      caseNumber: 3,
      elapsedMs: performance.now() - startPerf,
    }
  }

  // Caso 2: El usuario ya respondió y su pareja aún no -> vibración + toque de afecto en segundo plano
  triggerAffectionHaptics(options.vibrate)

  const enqueue =
    options.enqueueAffection ??
    ((timestampMs: number) => affectionStore.sendOrQueueAffection('heart_tap', timestampMs))

  const affectionResult = await enqueue(nowMs)

  return {
    type: 'navigate_home',
    tapIntent: 'affection_sent',
    caseNumber: 2,
    deduplicated: affectionResult.deduplicated,
    clientMutationId: affectionResult.clientMutationId,
    elapsedMs: performance.now() - startPerf,
  }
}
