import { z } from 'zod'

// Invariante: Toda mutación generada por el cliente debe incluir un UUIDv4
export const ClientMutationHeaderSchema = z.object({
  client_mutation_id: z.string().uuid(),
})

// Tipos de mutación soportados por el Outbox local
export const MutationTypeSchema = z.enum([
  'SUBMIT_ACTIVITY',
  'SEND_AFFECTION',
  'CLAIM_NFC_TAG',
  'UPDATE_PROFILE',
  'LINK_COUPLE',
])

export type MutationType = z.infer<typeof MutationTypeSchema>

// Estado del item en la cola offline (incluye Dead-Letter Queue con failed_permanent)
export const OutboxStatusSchema = z.enum([
  'pending',
  'syncing',
  'synced',
  'failed_permanent',
])

export type OutboxStatus = z.infer<typeof OutboxStatusSchema>

// Contrato de mutación de respuesta diaria (Blind Reveal)
export const SubmitActivityInputSchema = z.object({
  client_mutation_id: z.string().uuid(),
  activity_id: z.string().uuid(),
  content: z.string().min(1).max(2000).optional(),
  media_key: z.string().max(512).optional(),
})

export type SubmitActivityInput = z.infer<typeof SubmitActivityInputSchema>

// Contrato de evento de afecto (NFC Tap)
export const SendAffectionInputSchema = z.object({
  client_mutation_id: z.string().uuid(),
  event_type: z.enum(['heart_tap', 'hug', 'kiss', 'thinking_of_you']).default('heart_tap'),
})

export type SendAffectionInput = z.infer<typeof SendAffectionInputSchema>

// Contrato de resolución de NFC Tag
export const ResolveNfcTagInputSchema = z.object({
  tag_identifier: z.string().min(1).max(128),
})

export type ResolveNfcTagInput = z.infer<typeof ResolveNfcTagInputSchema>
