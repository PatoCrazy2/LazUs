import { z } from 'zod'

const isoTimestampSchema = z.string().min(1).max(64)

export const PartnerOnlineEventSchema = z
  .object({
    type: z.literal('partner_online'),
    userId: z.string().uuid(),
    timestamp: isoTimestampSchema,
  })
  .strict()

export const PartnerOfflineEventSchema = z
  .object({
    type: z.literal('partner_offline'),
    userId: z.string().uuid(),
    timestamp: isoTimestampSchema,
  })
  .strict()

export const PartnerSubmissionCompletedEventSchema = z
  .object({
    type: z.literal('partner_submission_completed'),
    activityId: z.string().uuid(),
    timestamp: isoTimestampSchema,
  })
  .strict()

export const ActivityReadyToRevealEventSchema = z
  .object({
    type: z.literal('activity_ready_to_reveal'),
    activityId: z.string().uuid(),
    timestamp: isoTimestampSchema,
  })
  .strict()

export const AffectionReceivedEventSchema = z
  .object({
    type: z.literal('affection_received'),
    senderUserId: z.string().uuid(),
    eventType: z.enum(['heart_tap', 'hug', 'kiss', 'thinking_of_you']),
    timestamp: isoTimestampSchema,
  })
  .strict()

export const CouplePairedEventSchema = z
  .object({
    type: z.literal('couple_paired'),
    coupleId: z.string().uuid(),
    partnerDisplayName: z.string().min(1).max(120),
    timestamp: isoTimestampSchema,
  })
  .strict()

// Unión discriminada estricta — Garantía Zero-Leak: imposible incluir content/payload/media_key
export const SafeRealtimeEventSchema = z.discriminatedUnion('type', [
  PartnerOnlineEventSchema,
  PartnerOfflineEventSchema,
  PartnerSubmissionCompletedEventSchema,
  ActivityReadyToRevealEventSchema,
  AffectionReceivedEventSchema,
  CouplePairedEventSchema,
])

export type SafeRealtimeEvent = z.infer<typeof SafeRealtimeEventSchema>

export const RealtimeBroadcastAudienceSchema = z.enum(['partner_only', 'both'])
export type RealtimeBroadcastAudience = z.infer<typeof RealtimeBroadcastAudienceSchema>

export const RealtimeBroadcastRequestSchema = z
  .object({
    event: SafeRealtimeEventSchema,
    audience: RealtimeBroadcastAudienceSchema.default('both'),
    excludeUserId: z.string().uuid().optional(),
  })
  .strict()

export type RealtimeBroadcastRequest = z.infer<typeof RealtimeBroadcastRequestSchema>
