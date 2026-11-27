import { z } from 'zod'
import { ActivityCategorySchema, ActivityResponseTypeSchema } from './activities.schema'

export const ALLOWED_PHOTO_MIME_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const
export const ALLOWED_VOICE_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
] as const
export const ALLOWED_COLLAGE_MIME_TYPES = ['image/png', 'image/webp', 'image/jpeg'] as const

export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_VOICE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
export const MAX_COLLAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_VOICE_DURATION_SEC = 60

// Invariantes de seguridad de TTL (segundos)
export const UPLOAD_URL_TTL_SECONDS = 600 // <= 10 min
export const VIEW_URL_TTL_SECONDS = 900 // <= 15 min

export const MediaKindSchema = z.enum(['photo', 'voice', 'collage'])
export type MediaKind = z.infer<typeof MediaKindSchema>

export function getAllowedMimeTypesForKind(kind: MediaKind): readonly string[] {
  switch (kind) {
    case 'photo':
      return ALLOWED_PHOTO_MIME_TYPES
    case 'voice':
      return ALLOWED_VOICE_MIME_TYPES
    case 'collage':
      return ALLOWED_COLLAGE_MIME_TYPES
  }
}

export function getMaxSizeBytesForKind(kind: MediaKind): number {
  switch (kind) {
    case 'photo':
      return MAX_PHOTO_SIZE_BYTES
    case 'voice':
      return MAX_VOICE_SIZE_BYTES
    case 'collage':
      return MAX_COLLAGE_SIZE_BYTES
  }
}

export function getExtensionForMimeType(contentType: string): string {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  switch (normalized) {
    case 'image/webp':
      return 'webp'
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'audio/webm':
      return 'webm'
    case 'audio/mp4':
      return 'm4a'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/ogg':
      return 'ogg'
    default:
      return 'bin'
  }
}

export const RequestUploadUrlInputSchema = z
  .object({
    kind: MediaKindSchema,
    content_type: z.string().min(1).max(100),
    size_bytes: z.number().int().positive(),
    activity_id: z.string().uuid().optional(),
    collage_id: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const baseMime = data.content_type.split(';')[0]?.trim().toLowerCase() ?? ''
    const allowed = getAllowedMimeTypesForKind(data.kind)
    if (!allowed.includes(baseMime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content_type'],
        message: `Tipo MIME no permitido para ${data.kind}. Permitidos: ${allowed.join(', ')}`,
      })
    }

    const maxBytes = getMaxSizeBytesForKind(data.kind)
    if (data.size_bytes > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['size_bytes'],
        message: `El archivo supera el tamaño máximo permitido (${Math.round(maxBytes / (1024 * 1024))} MB)`,
      })
    }
  })

export type RequestUploadUrlInput = z.infer<typeof RequestUploadUrlInputSchema>

export const RequestUploadUrlResponseSchema = z.object({
  media_key: z.string().min(1).max(512),
  upload_url: z.string().url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expires_in: z.number().int().min(1).max(UPLOAD_URL_TTL_SECONDS),
  expires_at: z.string(),
})

export type RequestUploadUrlResponse = z.infer<typeof RequestUploadUrlResponseSchema>

export const RequestViewUrlInputSchema = z.object({
  media_key: z.string().min(1).max(512),
})

export type RequestViewUrlInput = z.infer<typeof RequestViewUrlInputSchema>

export const RequestViewUrlResponseSchema = z.object({
  media_key: z.string().min(1).max(512),
  view_url: z.string().url(),
  expires_in: z.number().int().min(1).max(VIEW_URL_TTL_SECONDS),
  expires_at: z.string(),
})

export type RequestViewUrlResponse = z.infer<typeof RequestViewUrlResponseSchema>

// --- Collage Semanal ("Nuestros Momentos") ---

export const WeeklyCollageStatusSchema = z.enum(['ready', 'rendered'])
export type WeeklyCollageStatus = z.infer<typeof WeeklyCollageStatusSchema>

export const WeeklyCollageHighlightSchema = z.object({
  activity_id: z.string().uuid(),
  logical_date: z.string(), // YYYY-MM-DD
  prompt: z.string(),
  category: ActivityCategorySchema,
  response_type: ActivityResponseTypeSchema,
  my_content: z.string().nullable().optional(),
  partner_content: z.string().nullable().optional(),
  my_media_key: z.string().nullable().optional(),
  partner_media_key: z.string().nullable().optional(),
  my_name: z.string().optional(),
  partner_name: z.string().optional(),
})

export type WeeklyCollageHighlight = z.infer<typeof WeeklyCollageHighlightSchema>

export const WeeklyCollageItemSchema = z.object({
  id: z.string().uuid(),
  couple_id: z.string().uuid(),
  week_start_date: z.string(), // YYYY-MM-DD (Lunes)
  week_end_date: z.string(), // YYYY-MM-DD (Domingo)
  status: WeeklyCollageStatusSchema,
  media_key: z.string().nullable(),
  highlights: z.array(WeeklyCollageHighlightSchema),
  activities_count: z.number().int().min(0),
  rendered_at: z.string().nullable(),
  created_at: z.string(),
})

export type WeeklyCollageItem = z.infer<typeof WeeklyCollageItemSchema>

export const WeeklyCollageListResponseSchema = z.object({
  items: z.array(WeeklyCollageItemSchema),
})

export type WeeklyCollageListResponse = z.infer<typeof WeeklyCollageListResponseSchema>

export const SaveRenderedCollageInputSchema = z.object({
  media_key: z.string().min(1).max(512),
  client_mutation_id: z.string().uuid().optional(),
})

export type SaveRenderedCollageInput = z.infer<typeof SaveRenderedCollageInputSchema>

export const SaveRenderedCollageResponseSchema = z.object({
  status: z.literal('success'),
  collage: WeeklyCollageItemSchema,
})

export type SaveRenderedCollageResponse = z.infer<typeof SaveRenderedCollageResponseSchema>
