import { z } from 'zod'

export const ActivityCategorySchema = z.enum([
  'getting_to_know',
  'memories',
  'future',
  'gratitude',
  'life_values',
  'music',
  'romance',
  'play',
  'together_irl',
  'daily_checkin',
])
export type ActivityCategory = z.infer<typeof ActivityCategorySchema>

export const ActivityToneSchema = z.enum(['light', 'playful', 'tender', 'deep'])
export type ActivityTone = z.infer<typeof ActivityToneSchema>

export const ActivityOccasionSchema = z.enum(['daily', 'special_date', 'long_distance'])
export type ActivityOccasion = z.infer<typeof ActivityOccasionSchema>

export const ActivityResponseTypeSchema = z.enum([
  'text_only',
  'choice',
  'scale',
  'prediction',
  'music',
  'photo_only',
  'both',
  'voice',
])
export type ActivityResponseType = z.infer<typeof ActivityResponseTypeSchema>

export const ACTIVITY_CATEGORY_META: Record<
  ActivityCategory,
  { label: string; color: string; icon: string }
> = {
  getting_to_know: { label: 'Conociéndonos', color: '#E11D48', icon: 'Sparkles' },
  memories: { label: 'Recuerdos', color: '#D97706', icon: 'Clock' },
  future: { label: 'Futuro', color: '#0284C7', icon: 'Compass' },
  gratitude: { label: 'Gratitud', color: '#059669', icon: 'HeartHandshake' },
  life_values: { label: 'Vida y Valores', color: '#4F46E5', icon: 'Flame' },
  music: { label: 'Música', color: '#0D9488', icon: 'Music' },
  romance: { label: 'Romance', color: '#DB2777', icon: 'Heart' },
  play: { label: 'Juego', color: '#9333EA', icon: 'Dices' },
  together_irl: { label: 'Juntos IRL', color: '#EA580C', icon: 'Footprints' },
  daily_checkin: { label: 'Check-in', color: '#65A30D', icon: 'Sun' },
}

export const PromptConfigSchema = z
  .object({
    options: z.array(z.string().min(1).max(120)).min(2).max(6).optional(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    min_label: z.string().max(40).optional(),
    max_label: z.string().max(40).optional(),
    emojis: z.array(z.string()).optional(),
  })
  .nullable()
  .optional()
export type PromptConfig = z.infer<typeof PromptConfigSchema>

export const MusicTrackSchema = z.object({
  track_id: z.string().min(1),
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  album: z.string().max(200).optional(),
  artwork_url: z.string().url(),
  preview_url: z.string().url(),
  external_url: z.string().url().optional(),
  note: z.string().max(500).optional(),
})
export type MusicTrack = z.infer<typeof MusicTrackSchema>

export const SubmissionPayloadSchema = z.union([
  z.object({
    type: z.literal('choice'),
    selected_option: z.string().min(1).max(120),
  }),
  z.object({
    type: z.literal('scale'),
    value: z.number().int().min(1).max(10),
    note: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal('prediction'),
    my_answer: z.string().min(1).max(500),
    guessed_partner_answer: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal('music'),
    track: MusicTrackSchema,
  }),
  z.object({
    type: z.literal('voice'),
    duration_sec: z.number().min(0.5).max(60),
    mime_type: z.string().min(1).max(100),
  }),
  z.object({
    type: z.literal('photo'),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    mime_type: z.string().min(1).max(100).optional(),
  }),
])
export type SubmissionPayload = z.infer<typeof SubmissionPayloadSchema>

export const SubmissionItemSchema = z.object({
  content: z.string().nullable(),
  media_key: z.string().nullable(),
  payload: SubmissionPayloadSchema.nullable().optional(),
  completed_at: z.string(),
})
export type SubmissionItem = z.infer<typeof SubmissionItemSchema>

export const TodayActivityResponseSchema = z.object({
  id: z.string().uuid(),
  logical_date: z.string(),
  prompt: z.string(),
  category: ActivityCategorySchema,
  tone: ActivityToneSchema,
  occasion: ActivityOccasionSchema,
  response_type: ActivityResponseTypeSchema,
  prompt_config: PromptConfigSchema,
  status: z.enum(['pending', 'revealed']),
  revealed_at: z.string().nullable(),
  my_submission: SubmissionItemSchema.nullable(),
  partner_completed: z.boolean(),
  // Zero-Leak: solo presente cuando status === 'revealed'
  partner_submission: SubmissionItemSchema.nullable().optional(),
})
export type TodayActivityResponse = z.infer<typeof TodayActivityResponseSchema>

export const SubmitActivityResponseSchema = z.object({
  status: z.literal('success'),
  client_mutation_id: z.string().uuid(),
  activity_id: z.string().uuid(),
  activity_status: z.enum(['pending', 'revealed']),
  state: z.enum(['partner_pending', 'revealed']),
  message: z.string(),
})
export type SubmitActivityResponse = z.infer<typeof SubmitActivityResponseSchema>

export const ActivityHistoryItemSchema = z.object({
  id: z.string().uuid(),
  logical_date: z.string(),
  prompt: z.string(),
  category: ActivityCategorySchema,
  tone: ActivityToneSchema,
  occasion: ActivityOccasionSchema,
  response_type: ActivityResponseTypeSchema,
  revealed_at: z.string().nullable(),
  my_submission: SubmissionItemSchema.nullable(),
  partner_submission: SubmissionItemSchema.nullable(),
})
export type ActivityHistoryItem = z.infer<typeof ActivityHistoryItemSchema>

export const ActivityHistoryResponseSchema = z.object({
  items: z.array(ActivityHistoryItemSchema),
})
export type ActivityHistoryResponse = z.infer<typeof ActivityHistoryResponseSchema>

export const MusicSearchResultSchema = z.object({
  tracks: z.array(MusicTrackSchema),
})
export type MusicSearchResult = z.infer<typeof MusicSearchResultSchema>
