import { and, desc, eq, inArray, isNull, lte, ne, notInArray, sql } from 'drizzle-orm'
import type {
  ActivityCategory,
  ActivityHistoryItem,
  ActivityOccasion,
  ActivityResponseType,
  ActivityTone,
  PromptConfig,
  SubmissionItem,
  SubmissionPayload,
  SubmitActivityInput,
  SubmitActivityResponse,
  TodayActivityResponse,
} from '../../../shared'
import type { DbClient } from '../../db'
import {
  activityPrompts,
  coupleMembers,
  couples,
  dailyActivities,
  idempotencyKeys,
  submissions,
} from '../../db/schema'
import {
  ActivityForbiddenError,
  ActivityIdempotencyHitError,
  ActivityImmutableConflictError,
  ActivityNotFoundError,
  ActivityValidationError,
} from './activities.errors'

const ENABLED_HITO3_RESPONSE_TYPES: ActivityResponseType[] = [
  'text_only',
  'choice',
  'scale',
  'prediction',
  'music',
]

export interface CoupleActivityContext {
  coupleId: string
  timezone: string
  maxRomanceIntensity: number
  anniversaryDate: Date | null
}

export class ActivitiesRepository {
  constructor(private readonly db: DbClient) {}

  async findActiveCoupleContextByUserId(userId: string): Promise<CoupleActivityContext | null> {
    const rows = await this.db
      .select({
        coupleId: couples.id,
        status: couples.status,
        timezone: couples.timezone,
        maxRomanceIntensity: couples.maxRomanceIntensity,
        anniversaryDate: couples.anniversaryDate,
      })
      .from(coupleMembers)
      .innerJoin(couples, eq(coupleMembers.coupleId, couples.id))
      .where(and(eq(coupleMembers.userId, userId), eq(couples.status, 'active')))
      .limit(1)

    if (!rows.length) return null

    return {
      coupleId: rows[0].coupleId,
      timezone: rows[0].timezone,
      maxRomanceIntensity: rows[0].maxRomanceIntensity,
      anniversaryDate: rows[0].anniversaryDate,
    }
  }

  async findDailyActivityByDate(coupleId: string, logicalDate: string) {
    const rows = await this.db
      .select()
      .from(dailyActivities)
      .where(and(eq(dailyActivities.coupleId, coupleId), eq(dailyActivities.logicalDate, logicalDate)))
      .limit(1)

    return rows[0] || null
  }

  async selectNextPromptForCouple(
    coupleId: string,
    mmDd: string,
    isAnniversary: boolean,
    maxRomanceIntensity: number
  ) {
    // 1. Prioridad Fecha Especial: Aniversario primero, luego fecha calendario MM-DD
    const specialCandidates: string[] = []
    if (isAnniversary) specialCandidates.push('anniversary')
    specialCandidates.push(mmDd)

    for (const specialKey of specialCandidates) {
      const specialRows = await this.db
        .select()
        .from(activityPrompts)
        .where(
          and(
            eq(activityPrompts.isActive, true),
            eq(activityPrompts.specialDate, specialKey),
            inArray(activityPrompts.responseType, ENABLED_HITO3_RESPONSE_TYPES),
            lte(activityPrompts.intensity, maxRomanceIntensity)
          )
        )
        .limit(1)

      if (specialRows.length > 0) {
        return specialRows[0]
      }
    }

    // 2. Obtener historial de prompts ya usados por la pareja y última categoría
    const pastActivities = await this.db
      .select({
        promptId: dailyActivities.promptId,
        category: dailyActivities.category,
        logicalDate: dailyActivities.logicalDate,
      })
      .from(dailyActivities)
      .where(eq(dailyActivities.coupleId, coupleId))
      .orderBy(desc(dailyActivities.logicalDate))

    const lastCategory = pastActivities[0]?.category ?? null
    const usedPromptIds = pastActivities
      .map((a) => a.promptId)
      .filter((id): id is string => Boolean(id))

    const baseConditions = [
      eq(activityPrompts.isActive, true),
      isNull(activityPrompts.specialDate),
      inArray(activityPrompts.responseType, ENABLED_HITO3_RESPONSE_TYPES),
      lte(activityPrompts.intensity, maxRomanceIntensity),
    ]

    if (usedPromptIds.length > 0) {
      baseConditions.push(notInArray(activityPrompts.id, usedPromptIds))
    }

    // Preferir categoría distinta a la del día anterior
    if (lastCategory) {
      const freshCategoryPrompts = await this.db
        .select()
        .from(activityPrompts)
        .where(and(...baseConditions, ne(activityPrompts.category, lastCategory)))

      if (freshCategoryPrompts.length > 0) {
        const idx = Math.floor(Math.random() * freshCategoryPrompts.length)
        return freshCategoryPrompts[idx]
      }
    }

    const anyUnusedPrompts = await this.db
      .select()
      .from(activityPrompts)
      .where(and(...baseConditions))

    if (anyUnusedPrompts.length > 0) {
      const idx = Math.floor(Math.random() * anyUnusedPrompts.length)
      return anyUnusedPrompts[idx]
    }

    // 3. Fallback si la pareja completó todo el catálogo: reciclar evitando la categoría de ayer
    const fallbackConditions = [
      eq(activityPrompts.isActive, true),
      isNull(activityPrompts.specialDate),
      inArray(activityPrompts.responseType, ENABLED_HITO3_RESPONSE_TYPES),
      lte(activityPrompts.intensity, maxRomanceIntensity),
    ]

    const allEligible = await this.db
      .select()
      .from(activityPrompts)
      .where(and(...fallbackConditions))

    if (allEligible.length > 0) {
      const diffCat = lastCategory
        ? allEligible.filter((p) => p.category !== lastCategory)
        : allEligible
      const pool = diffCat.length > 0 ? diffCat : allEligible
      return pool[Math.floor(Math.random() * pool.length)]
    }

    return null
  }

  async createOrGetDailyActivity(params: {
    coupleId: string
    logicalDate: string
    promptId: string | null
    prompt: string
    category: ActivityCategory
    tone: ActivityTone
    occasion: ActivityOccasion
    responseType: ActivityResponseType
    promptConfig: PromptConfig
  }) {
    await this.db
      .insert(dailyActivities)
      .values({
        coupleId: params.coupleId,
        logicalDate: params.logicalDate,
        promptId: params.promptId,
        prompt: params.prompt,
        category: params.category,
        tone: params.tone,
        occasion: params.occasion,
        responseType: params.responseType,
        promptConfig: params.promptConfig ?? null,
        status: 'pending',
      })
      .onConflictDoNothing({
        target: [dailyActivities.coupleId, dailyActivities.logicalDate],
      })

    const created = await this.findDailyActivityByDate(params.coupleId, params.logicalDate)
    if (!created) {
      throw new Error('No se pudo inicializar la actividad diaria')
    }
    return created
  }

  /**
   * INVARIANTE ZERO-LEAK:
   * Si status !== 'revealed', la consulta SQL hacia el partner NUNCA selecciona
   * las columnas content, media_key ni payload; únicamente comprueba la existencia del id.
   */
  async getSafeActivityViewForUser(
    activityId: string,
    coupleId: string,
    userId: string
  ): Promise<TodayActivityResponse> {
    const actRows = await this.db
      .select()
      .from(dailyActivities)
      .where(eq(dailyActivities.id, activityId))
      .limit(1)

    const activity = actRows[0]
    if (!activity) {
      throw new ActivityNotFoundError()
    }
    if (activity.coupleId !== coupleId) {
      throw new ActivityForbiddenError()
    }

    // 1. Propia respuesta del usuario actual (siempre permitida)
    const myRows = await this.db
      .select({
        content: submissions.content,
        mediaKey: submissions.mediaKey,
        payload: submissions.payload,
        completedAt: submissions.completedAt,
      })
      .from(submissions)
      .where(and(eq(submissions.activityId, activityId), eq(submissions.userId, userId)))
      .limit(1)

    const mySubmission: SubmissionItem | null = myRows[0]
      ? {
          content: myRows[0].content,
          media_key: myRows[0].mediaKey,
          payload: (myRows[0].payload as SubmissionPayload | null) ?? null,
          completed_at: myRows[0].completedAt.toISOString(),
        }
      : null

    // 2. Estado/respuesta de la pareja con aislamiento SQL estricto
    if (activity.status !== 'revealed') {
      const partnerStatusRows = await this.db
        .select({ id: submissions.id })
        .from(submissions)
        .where(and(eq(submissions.activityId, activityId), ne(submissions.userId, userId)))
        .limit(1)

      return {
        id: activity.id,
        logical_date: activity.logicalDate,
        prompt: activity.prompt,
        category: activity.category,
        tone: activity.tone,
        occasion: activity.occasion,
        response_type: activity.responseType,
        prompt_config: (activity.promptConfig as PromptConfig) ?? null,
        status: 'pending',
        revealed_at: null,
        my_submission: mySubmission,
        partner_completed: partnerStatusRows.length > 0,
      }
    }

    // Solo cuando status === 'revealed' leemos el contenido de la pareja en SQL
    const partnerFullRows = await this.db
      .select({
        content: submissions.content,
        mediaKey: submissions.mediaKey,
        payload: submissions.payload,
        completedAt: submissions.completedAt,
      })
      .from(submissions)
      .where(and(eq(submissions.activityId, activityId), ne(submissions.userId, userId)))
      .limit(1)

    const partnerSubmission: SubmissionItem | null = partnerFullRows[0]
      ? {
          content: partnerFullRows[0].content,
          media_key: partnerFullRows[0].mediaKey,
          payload: (partnerFullRows[0].payload as SubmissionPayload | null) ?? null,
          completed_at: partnerFullRows[0].completedAt.toISOString(),
        }
      : null

    return {
      id: activity.id,
      logical_date: activity.logicalDate,
      prompt: activity.prompt,
      category: activity.category,
      tone: activity.tone,
      occasion: activity.occasion,
      response_type: activity.responseType,
      prompt_config: (activity.promptConfig as PromptConfig) ?? null,
      status: 'revealed',
      revealed_at: activity.revealedAt?.toISOString() ?? null,
      my_submission: mySubmission,
      partner_completed: Boolean(partnerSubmission),
      partner_submission: partnerSubmission,
    }
  }

  async executeAtomicSubmission(params: {
    userId: string
    coupleId: string
    todayLogicalDate: string
    activityId: string
    input: SubmitActivityInput
    validateActivityInput: (activity: typeof dailyActivities.$inferSelect) => void
  }): Promise<SubmitActivityResponse> {
    const { userId, coupleId, todayLogicalDate, activityId, input, validateActivityInput } = params

    return await this.db.transaction(async (tx) => {
      // 1. Idempotency Check
      const existingKey = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, input.client_mutation_id))
        .limit(1)

      if (existingKey.length > 0) {
        if (existingKey[0].userId !== userId) {
          throw new ActivityValidationError('Identificador de mutación inválido')
        }
        throw new ActivityIdempotencyHitError(
          existingKey[0].responseBody,
          existingKey[0].responseCode
        )
      }

      // 2. Bloqueo pesimista FOR UPDATE sobre daily_activities para sincronizar el blind reveal
      const lockedResult = await tx.execute(
        sql`SELECT id FROM ${dailyActivities} WHERE id = ${activityId} FOR UPDATE`
      )
      if (!lockedResult.rows.length) {
        throw new ActivityNotFoundError()
      }

      const actRows = await tx
        .select()
        .from(dailyActivities)
        .where(eq(dailyActivities.id, activityId))
        .limit(1)

      const activity = actRows[0]
      if (!activity) {
        throw new ActivityNotFoundError()
      }

      // 3. Autorización de pareja y vigencia diaria estricta
      if (activity.coupleId !== coupleId) {
        throw new ActivityForbiddenError()
      }

      if (activity.logicalDate !== todayLogicalDate) {
        throw new ActivityValidationError(
          'Esta actividad pertenece a otro día y ya se encuentra cerrada'
        )
      }

      // 4. Validar formato de respuesta contra el tipo de la actividad
      validateActivityInput(activity)

      // 5. Inmutabilidad: verificar si el usuario ya respondió
      const existingSub = await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(and(eq(submissions.activityId, activityId), eq(submissions.userId, userId)))
        .limit(1)

      if (existingSub.length > 0) {
        throw new ActivityImmutableConflictError()
      }

      // 6. Insertar respuesta sellada
      try {
        await tx.insert(submissions).values({
          activityId,
          userId,
          content: input.content?.trim() || null,
          mediaKey: input.media_key || null,
          payload: input.payload ?? null,
        })
      } catch (err: any) {
        if (err?.code === '23505' || err?.cause?.code === '23505') {
          throw new ActivityImmutableConflictError()
        }
        throw err
      }

      // 7. Evaluar si ambos miembros ya respondieron para desbloquear el Blind Reveal
      const allSubs = await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.activityId, activityId))

      const bothCompleted = allSubs.length >= 2
      const finalStatus: 'pending' | 'revealed' = bothCompleted ? 'revealed' : 'pending'

      if (bothCompleted && activity.status !== 'revealed') {
        await tx
          .update(dailyActivities)
          .set({
            status: 'revealed',
            revealedAt: new Date(),
          })
          .where(eq(dailyActivities.id, activityId))
      }

      const responseBody: SubmitActivityResponse = {
        status: 'success',
        client_mutation_id: input.client_mutation_id,
        activity_id: activityId,
        activity_status: finalStatus,
        state: bothCompleted ? 'revealed' : 'partner_pending',
        message: bothCompleted
          ? '¡Ambos respondieron! Sus respuestas han sido reveladas.'
          : 'Respuesta guardada ❤️. Esperando a tu pareja para revelar.',
      }

      // 8. Registrar llave de idempotencia
      await tx.insert(idempotencyKeys).values({
        key: input.client_mutation_id,
        userId,
        operationType: 'SUBMIT_ACTIVITY',
        responseCode: 200,
        responseBody,
      })

      return responseBody
    })
  }

  async findRevealedHistory(
    coupleId: string,
    userId: string,
    limit = 30
  ): Promise<ActivityHistoryItem[]> {
    const revealedActivities = await this.db
      .select()
      .from(dailyActivities)
      .where(and(eq(dailyActivities.coupleId, coupleId), eq(dailyActivities.status, 'revealed')))
      .orderBy(desc(dailyActivities.logicalDate), desc(dailyActivities.revealedAt))
      .limit(limit)

    if (!revealedActivities.length) return []

    const activityIds = revealedActivities.map((a) => a.id)
    const subs = await this.db
      .select()
      .from(submissions)
      .where(inArray(submissions.activityId, activityIds))

    const subsByActivity = new Map<string, (typeof subs)[number][]>()
    for (const s of subs) {
      const list = subsByActivity.get(s.activityId) ?? []
      list.push(s)
      subsByActivity.set(s.activityId, list)
    }

    return revealedActivities.map((act) => {
      const actSubs = subsByActivity.get(act.id) ?? []
      const mine = actSubs.find((s) => s.userId === userId)
      const partner = actSubs.find((s) => s.userId !== userId)

      return {
        id: act.id,
        logical_date: act.logicalDate,
        prompt: act.prompt,
        category: act.category,
        tone: act.tone,
        occasion: act.occasion,
        response_type: act.responseType,
        revealed_at: act.revealedAt?.toISOString() ?? null,
        my_submission: mine
          ? {
              content: mine.content,
              media_key: mine.mediaKey,
              payload: (mine.payload as SubmissionPayload | null) ?? null,
              completed_at: mine.completedAt.toISOString(),
            }
          : null,
        partner_submission: partner
          ? {
              content: partner.content,
              media_key: partner.mediaKey,
              payload: (partner.payload as SubmissionPayload | null) ?? null,
              completed_at: partner.completedAt.toISOString(),
            }
          : null,
      }
    })
  }
}
