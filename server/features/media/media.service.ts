import {
  UPLOAD_URL_TTL_SECONDS,
  VIEW_URL_TTL_SECONDS,
  getExtensionForMimeType,
  type RequestUploadUrlInput,
  type RequestUploadUrlResponse,
  type RequestViewUrlResponse,
  type SaveRenderedCollageInput,
  type SaveRenderedCollageResponse,
  type WeeklyCollageHighlight,
  type WeeklyCollageItem,
  type WeeklyCollageListResponse,
} from '../../../shared'
import type { DbClient } from '../../db'
import type { weeklyCollages } from '../../db/schema'
import { computeLogicalDateParts } from '../activities/activities.service'
import { MediaForbiddenError, MediaNotFoundError, MediaValidationError } from './media.errors'
import { MediaRepository, type RevealedWeekActivityRow } from './media.repository'
import type { MediaStorageSigner } from './r2.signer'

interface StoredHighlightEntry {
  activity_id: string
  logical_date: string
  prompt: string
  category: WeeklyCollageHighlight['category']
  response_type: WeeklyCollageHighlight['response_type']
  entries: Array<{
    user_id: string
    name: string
    content: string | null
    media_key: string | null
  }>
}

/**
 * Calcula el rango Lunes–Domingo (YYYY-MM-DD) al que pertenece una fecha lógica.
 */
export function computeIsoWeekRange(logicalDate: string): {
  weekStartDate: string
  weekEndDate: string
} {
  const [y, m, d] = logicalDate.split('-').map(Number)
  const utcDate = new Date(Date.UTC(y!, m! - 1, d!))
  const dayOfWeek = utcDate.getUTCDay() // 0=Dom, 1=Lun, ... 6=Sab
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek

  const monday = new Date(utcDate)
  monday.setUTCDate(utcDate.getUTCDate() + diffToMonday)

  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const fmt = (dt: Date) => dt.toISOString().slice(0, 10)
  return {
    weekStartDate: fmt(monday),
    weekEndDate: fmt(sunday),
  }
}

function summarizeSubmissionText(sub: RevealedWeekActivityRow['submissions'][number]): string | null {
  if (sub.content && sub.content.trim().length > 0) {
    return sub.content.trim().slice(0, 240)
  }
  const payload = sub.payload as Record<string, any> | null
  if (!payload || typeof payload !== 'object') return null

  switch (payload.type) {
    case 'choice':
      return typeof payload.selected_option === 'string' ? payload.selected_option : null
    case 'scale':
      return payload.note
        ? `${payload.value}/5 — ${String(payload.note).slice(0, 180)}`
        : `Nivel ${payload.value}`
    case 'prediction':
      return typeof payload.my_answer === 'string' ? payload.my_answer.slice(0, 200) : null
    case 'music':
      return payload.track?.title
        ? `🎵 ${payload.track.title} — ${payload.track.artist ?? ''}`.trim()
        : null
    case 'voice':
      return typeof payload.duration_sec === 'number'
        ? `🎙️ Nota de voz (${Math.round(payload.duration_sec)}s)`
        : '🎙️ Nota de voz'
    default:
      return null
  }
}

export class MediaService {
  private readonly repo: MediaRepository

  constructor(
    db: DbClient,
    private readonly signer: MediaStorageSigner,
    private readonly nowProvider: () => Date = () => new Date()
  ) {
    this.repo = new MediaRepository(db)
  }

  private async requireCoupleContext(userId: string) {
    const ctx = await this.repo.findActiveCoupleContextByUserId(userId)
    if (!ctx) {
      throw new MediaForbiddenError('Debes tener una pareja vinculada activa para usar multimedia')
    }
    return ctx
  }

  private assertKeyBelongsToCouple(mediaKey: string, coupleId: string, expectedKind?: string): void {
    if (!mediaKey || mediaKey.includes('..') || mediaKey.startsWith('/')) {
      throw new MediaValidationError('Clave de archivo inválida')
    }
    const prefix = expectedKind
      ? `couples/${coupleId}/${expectedKind}/`
      : `couples/${coupleId}/`
    if (!mediaKey.startsWith(prefix)) {
      throw new MediaForbiddenError('No tienes permiso para acceder a este archivo')
    }
  }

  async requestUploadUrl(
    userId: string,
    input: RequestUploadUrlInput
  ): Promise<RequestUploadUrlResponse> {
    const coupleCtx = await this.requireCoupleContext(userId)
    const ext = getExtensionForMimeType(input.content_type)
    const mediaKey = `couples/${coupleCtx.coupleId}/${input.kind}/${crypto.randomUUID()}.${ext}`

    const signed = await this.signer.createUploadUrl({
      key: mediaKey,
      contentType: input.content_type,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      now: this.nowProvider(),
    })

    return {
      media_key: mediaKey,
      upload_url: signed.url,
      method: 'PUT',
      headers: signed.headers,
      expires_in: signed.expiresIn,
      expires_at: signed.expiresAt,
    }
  }

  /**
   * Emite una URL firmada GET de corta duración (<= 15 min) aplicando estrictamente
   * aislamiento por pareja e invariante Zero-Leak desde PostgreSQL.
   */
  async requestViewUrl(userId: string, mediaKey: string): Promise<RequestViewUrlResponse> {
    const coupleCtx = await this.requireCoupleContext(userId)
    this.assertKeyBelongsToCouple(mediaKey, coupleCtx.coupleId)

    // Invariante Zero-Leak: verificar en PostgreSQL si el archivo pertenece a una submission
    const ownership = await this.repo.findSubmissionByMediaKey(mediaKey)
    if (ownership) {
      if (ownership.coupleId !== coupleCtx.coupleId) {
        throw new MediaForbiddenError('No tienes permiso para acceder a este archivo')
      }
      if (ownership.submissionUserId !== userId && ownership.activityStatus !== 'revealed') {
        throw new MediaForbiddenError(
          'El archivo de tu pareja está bloqueado hasta que ambos completen la actividad'
        )
      }
    }

    const signed = await this.signer.createViewUrl({
      key: mediaKey,
      expiresInSeconds: VIEW_URL_TTL_SECONDS,
      now: this.nowProvider(),
    })

    return {
      media_key: mediaKey,
      view_url: signed.url,
      expires_in: signed.expiresIn,
      expires_at: signed.expiresAt,
    }
  }

  async compileWeeklyCollageForCouple(
    coupleId: string,
    timezone: string,
    referenceDate?: Date
  ): Promise<typeof weeklyCollages.$inferSelect | null> {
    const now = referenceDate ?? this.nowProvider()
    const { logicalDate } = computeLogicalDateParts(timezone, now)
    const { weekStartDate, weekEndDate } = computeIsoWeekRange(logicalDate)

    const revealedRows = await this.repo.findRevealedActivitiesInDateRange(
      coupleId,
      weekStartDate,
      weekEndDate
    )

    if (revealedRows.length === 0) {
      return null
    }

    // Priorizar actividades con fotografías para el collage visual (hasta 6 momentos)
    const sorted = [...revealedRows].sort((a, b) => {
      const aHasPhoto =
        a.activity.responseType === 'photo_only' || a.activity.responseType === 'both' ? 1 : 0
      const bHasPhoto =
        b.activity.responseType === 'photo_only' || b.activity.responseType === 'both' ? 1 : 0
      if (aHasPhoto !== bHasPhoto) return bHasPhoto - aHasPhoto
      return b.activity.logicalDate.localeCompare(a.activity.logicalDate)
    })

    const storedHighlights: StoredHighlightEntry[] = sorted.slice(0, 6).map((row) => ({
      activity_id: row.activity.id,
      logical_date: row.activity.logicalDate,
      prompt: row.activity.prompt,
      category: row.activity.category,
      response_type: row.activity.responseType,
      entries: row.submissions.map((sub) => ({
        user_id: sub.userId,
        name: sub.displayName,
        content: summarizeSubmissionText(sub),
        media_key: sub.mediaKey,
      })),
    }))

    return await this.repo.upsertWeeklyCollage({
      coupleId,
      weekStartDate,
      weekEndDate,
      highlights: storedHighlights,
      activitiesCount: revealedRows.length,
      now,
    })
  }

  async compileAllCouplesWeeklyCollages(referenceDate?: Date): Promise<{
    couplesChecked: number
    collagesCompiled: number
  }> {
    const activeCouples = await this.repo.listActiveCouples()
    let collagesCompiled = 0

    for (const couple of activeCouples) {
      const compiled = await this.compileWeeklyCollageForCouple(
        couple.id,
        couple.timezone,
        referenceDate
      )
      if (compiled) {
        collagesCompiled++
      }
    }

    return {
      couplesChecked: activeCouples.length,
      collagesCompiled,
    }
  }

  private mapCollageRowForUser(
    row: typeof weeklyCollages.$inferSelect,
    userId: string
  ): WeeklyCollageItem {
    const rawHighlights = Array.isArray(row.highlights)
      ? (row.highlights as StoredHighlightEntry[])
      : []

    const highlights: WeeklyCollageHighlight[] = rawHighlights.map((h) => {
      const mine = h.entries?.find((e) => e.user_id === userId)
      const partner = h.entries?.find((e) => e.user_id !== userId)
      return {
        activity_id: h.activity_id,
        logical_date: h.logical_date,
        prompt: h.prompt,
        category: h.category,
        response_type: h.response_type,
        my_content: mine?.content ?? null,
        partner_content: partner?.content ?? null,
        my_media_key: mine?.media_key ?? null,
        partner_media_key: partner?.media_key ?? null,
        my_name: mine?.name,
        partner_name: partner?.name,
      }
    })

    return {
      id: row.id,
      couple_id: row.coupleId,
      week_start_date: row.weekStartDate,
      week_end_date: row.weekEndDate,
      status: row.status,
      media_key: row.mediaKey ?? null,
      highlights,
      activities_count: row.activitiesCount,
      rendered_at: row.renderedAt ? row.renderedAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
    }
  }

  async listWeeklyCollages(userId: string): Promise<WeeklyCollageListResponse> {
    const coupleCtx = await this.requireCoupleContext(userId)

    // Compilación perezosa de la semana activa si ya hay actividades reveladas
    await this.compileWeeklyCollageForCouple(coupleCtx.coupleId, coupleCtx.timezone)

    const rows = await this.repo.listCollagesForCouple(coupleCtx.coupleId)
    return {
      items: rows.map((row) => this.mapCollageRowForUser(row, userId)),
    }
  }

  async saveRenderedCollage(
    userId: string,
    collageId: string,
    input: SaveRenderedCollageInput
  ): Promise<SaveRenderedCollageResponse> {
    const coupleCtx = await this.requireCoupleContext(userId)
    this.assertKeyBelongsToCouple(input.media_key, coupleCtx.coupleId, 'collage')

    const existing = await this.repo.findCollageById(collageId)
    if (!existing) {
      throw new MediaNotFoundError('El collage semanal no existe')
    }
    if (existing.coupleId !== coupleCtx.coupleId) {
      throw new MediaForbiddenError('No tienes permiso para actualizar este collage')
    }

    const updated = await this.repo.markCollageRendered({
      collageId: existing.id,
      coupleId: coupleCtx.coupleId,
      mediaKey: input.media_key,
      now: this.nowProvider(),
    })

    if (!updated) {
      throw new MediaNotFoundError('El collage semanal no existe')
    }

    return {
      status: 'success',
      collage: this.mapCollageRowForUser(updated, userId),
    }
  }
}
