import type {
  ActivityHistoryResponse,
  MusicSearchResult,
  MusicTrack,
  PromptConfig,
  SubmitActivityInput,
  SubmitActivityResponse,
  TodayActivityResponse,
} from '../../../shared'
import type { DbClient } from '../../db'
import type { dailyActivities } from '../../db/schema'
import { INITIAL_PROMPTS } from '../../db/seeds/prompts'
import type { ActivityPushNotifier } from '../notifications/notifications.service'
import type { CoupleEventPublisher } from '../realtime/realtime.publisher'
import {
  ActivityForbiddenError,
  ActivityIdempotencyHitError,
  ActivityValidationError,
} from './activities.errors'
import { ActivitiesRepository } from './activities.repository'

const DEFAULT_TIMEZONE = 'America/Mexico_City'

export function computeLogicalDateParts(timezone: string, referenceDate: Date = new Date()): {
  logicalDate: string
  mmDd: string
} {
  let tz = timezone || DEFAULT_TIMEZONE
  try {
    Intl.DateTimeFormat('en-CA', { timeZone: tz })
  } catch {
    tz = DEFAULT_TIMEZONE
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  // Formato garantizado por en-CA: YYYY-MM-DD
  const logicalDate = formatter.format(referenceDate)
  const mmDd = logicalDate.slice(5, 10)
  return { logicalDate, mmDd }
}

export class ActivitiesService {
  private readonly repo: ActivitiesRepository

  constructor(
    db: DbClient,
    private readonly nowProvider: () => Date = () => new Date(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly realtimePublisher?: CoupleEventPublisher,
    private readonly scheduleBackground?: (task: Promise<unknown>) => Promise<void> | void,
    private readonly pushNotifier?: ActivityPushNotifier
  ) {
    this.repo = new ActivitiesRepository(db)
  }

  private async requireCoupleContext(userId: string) {
    const ctx = await this.repo.findActiveCoupleContextByUserId(userId)
    if (!ctx) {
      throw new ActivityForbiddenError('Debes tener una pareja vinculada activa para ver actividades')
    }
    return ctx
  }

  async getOrCreateTodayActivity(userId: string): Promise<TodayActivityResponse> {
    const coupleCtx = await this.requireCoupleContext(userId)
    const now = this.nowProvider()
    const { logicalDate, mmDd } = computeLogicalDateParts(coupleCtx.timezone, now)

    let activity = await this.repo.findDailyActivityByDate(coupleCtx.coupleId, logicalDate)

    if (!activity) {
      let isAnniversary = false
      if (coupleCtx.anniversaryDate) {
        const annivParts = computeLogicalDateParts(coupleCtx.timezone, coupleCtx.anniversaryDate)
        isAnniversary = annivParts.mmDd === mmDd
      }

      const selectedPrompt = await this.repo.selectNextPromptForCouple(
        coupleCtx.coupleId,
        mmDd,
        isAnniversary,
        coupleCtx.maxRomanceIntensity
      )

      const fallbackSeed = INITIAL_PROMPTS[0]

      activity = await this.repo.createOrGetDailyActivity({
        coupleId: coupleCtx.coupleId,
        logicalDate,
        promptId: selectedPrompt?.id ?? null,
        prompt: selectedPrompt?.prompt ?? fallbackSeed.prompt,
        category: selectedPrompt?.category ?? fallbackSeed.category,
        tone: selectedPrompt?.tone ?? fallbackSeed.tone,
        occasion: selectedPrompt?.occasion ?? fallbackSeed.occasion,
        responseType: selectedPrompt?.responseType ?? fallbackSeed.responseType,
        promptConfig: ((selectedPrompt?.promptConfig as PromptConfig) ??
          fallbackSeed.promptConfig ??
          null),
      })
    }

    return await this.repo.getSafeActivityViewForUser(activity.id, coupleCtx.coupleId, userId)
  }

  async submitActivity(
    userId: string,
    activityId: string,
    input: SubmitActivityInput
  ): Promise<SubmitActivityResponse> {
    if (input.activity_id && input.activity_id !== activityId) {
      throw new ActivityValidationError('El activity_id no coincide con la ruta solicitada')
    }

    const coupleCtx = await this.requireCoupleContext(userId)
    const { logicalDate } = computeLogicalDateParts(coupleCtx.timezone, this.nowProvider())

    let result: SubmitActivityResponse
    try {
      result = await this.repo.executeAtomicSubmission({
        userId,
        coupleId: coupleCtx.coupleId,
        todayLogicalDate: logicalDate,
        activityId,
        input,
        validateActivityInput: (activity) => this.validateInputAgainstActivity(activity, input),
      })
    } catch (error) {
      if (error instanceof ActivityIdempotencyHitError) {
        // Reintento idempotente: no duplicar evento WebSocket
        return error.responseBody as SubmitActivityResponse
      }
      throw error
    }

    if (this.realtimePublisher) {
      const timestamp = this.nowProvider().toISOString()
      const isRevealed = result.activity_status === 'revealed'
      const publishTask = this.realtimePublisher.publish({
        coupleId: coupleCtx.coupleId,
        audience: isRevealed ? 'both' : 'partner_only',
        excludeUserId: isRevealed ? undefined : userId,
        event: isRevealed
          ? {
              type: 'activity_ready_to_reveal',
              activityId: result.activity_id,
              timestamp,
            }
          : {
              type: 'partner_submission_completed',
              activityId: result.activity_id,
              timestamp,
            },
      })

      if (this.scheduleBackground) {
        await this.scheduleBackground(publishTask)
      } else {
        await publishTask.catch(() => undefined)
      }
    }

    if (this.pushNotifier) {
      const pushTask = this.pushNotifier.notifyPartnerActivityUpdate(
        coupleCtx.coupleId,
        userId,
        result.activity_status
      )
      if (this.scheduleBackground) {
        await this.scheduleBackground(pushTask)
      } else {
        await pushTask.catch(() => undefined)
      }
    }

    return result
  }

  async getActivityResults(userId: string, activityId: string): Promise<TodayActivityResponse> {
    const coupleCtx = await this.requireCoupleContext(userId)
    const view = await this.repo.getSafeActivityViewForUser(activityId, coupleCtx.coupleId, userId)

    if (view.status !== 'revealed') {
      throw new ActivityForbiddenError(
        'Los resultados están bloqueados hasta que ambos miembros completen la actividad'
      )
    }

    return view
  }

  async getHistory(userId: string): Promise<ActivityHistoryResponse> {
    const coupleCtx = await this.requireCoupleContext(userId)
    const items = await this.repo.findRevealedHistory(coupleCtx.coupleId, userId)
    return { items }
  }

  async searchMusic(query: string): Promise<MusicSearchResult> {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      return { tracks: [] }
    }

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      trimmed
    )}&entity=song&limit=8&country=MX`

    const response = await this.fetchImpl(url, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Error al consultar catálogo musical (${response.status})`)
    }

    const data = (await response.json()) as {
      results?: Array<{
        trackId?: number
        trackName?: string
        artistName?: string
        collectionName?: string
        artworkUrl100?: string
        previewUrl?: string
        trackViewUrl?: string
      }>
    }

    const tracks: MusicTrack[] = (data.results ?? [])
      .filter(
        (item) =>
          item.trackId &&
          item.trackName &&
          item.artistName &&
          item.artworkUrl100 &&
          item.previewUrl
      )
      .map((item) => ({
        track_id: String(item.trackId),
        title: item.trackName!,
        artist: item.artistName!,
        album: item.collectionName,
        artwork_url: item.artworkUrl100!.replace('100x100bb', '600x600bb'),
        preview_url: item.previewUrl!,
        external_url: item.trackViewUrl,
      }))

    return { tracks }
  }

  private validateInputAgainstActivity(
    activity: typeof dailyActivities.$inferSelect,
    input: SubmitActivityInput
  ): void {
    const config = (activity.promptConfig as PromptConfig) ?? null

    switch (activity.responseType) {
      case 'text_only': {
        if (!input.content || input.content.trim().length === 0) {
          throw new ActivityValidationError('Debes escribir una respuesta de texto')
        }
        break
      }
      case 'choice': {
        if (input.payload?.type !== 'choice') {
          throw new ActivityValidationError('Debes seleccionar una opción válida')
        }
        if (config?.options && !config.options.includes(input.payload.selected_option)) {
          throw new ActivityValidationError('La opción elegida no pertenece a esta pregunta')
        }
        break
      }
      case 'scale': {
        if (input.payload?.type !== 'scale') {
          throw new ActivityValidationError('Debes elegir un valor en la escala')
        }
        const min = config?.min ?? 1
        const max = config?.max ?? 5
        if (input.payload.value < min || input.payload.value > max) {
          throw new ActivityValidationError(`El valor debe estar entre ${min} y ${max}`)
        }
        break
      }
      case 'prediction': {
        if (
          input.payload?.type !== 'prediction' ||
          !input.payload.my_answer.trim() ||
          !input.payload.guessed_partner_answer.trim()
        ) {
          throw new ActivityValidationError(
            'Debes completar tu respuesta y tu predicción sobre tu pareja'
          )
        }
        break
      }
      case 'music': {
        if (input.payload?.type !== 'music' || !input.payload.track?.track_id) {
          throw new ActivityValidationError('Debes elegir una canción para responder')
        }
        break
      }
      case 'photo_only': {
        this.assertValidSubmissionMediaKey(input.media_key, activity.coupleId, 'photo')
        break
      }
      case 'both': {
        this.assertValidSubmissionMediaKey(input.media_key, activity.coupleId, 'photo')
        if (!input.content || input.content.trim().length === 0) {
          throw new ActivityValidationError('Debes añadir un mensaje junto con tu foto')
        }
        break
      }
      case 'voice': {
        this.assertValidSubmissionMediaKey(input.media_key, activity.coupleId, 'voice')
        if (input.payload && input.payload.type !== 'voice') {
          throw new ActivityValidationError('Metadatos de nota de voz inválidos')
        }
        break
      }
      default: {
        throw new ActivityValidationError(
          `El formato '${activity.responseType}' aún no está habilitado`
        )
      }
    }
  }

  private assertValidSubmissionMediaKey(
    mediaKey: string | undefined,
    coupleId: string,
    kind: 'photo' | 'voice'
  ): void {
    if (!mediaKey || mediaKey.trim().length === 0) {
      throw new ActivityValidationError(
        kind === 'photo'
          ? 'Debes subir una fotografía para responder esta actividad'
          : 'Debes grabar una nota de voz para responder esta actividad'
      )
    }
    if (mediaKey.includes('..') || !mediaKey.startsWith(`couples/${coupleId}/${kind}/`)) {
      throw new ActivityForbiddenError('El archivo multimedia no pertenece a tu pareja')
    }
  }
}
