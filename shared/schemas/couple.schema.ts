import { z } from 'zod'

// 1. DTO de Resolución de Tag o Código (/link/:identifier)
export const ResolveIdentifierResponseSchema = z.object({
  identifier: z.string(),
  type: z.enum(['nfc_tag', 'digital_invite']),
  state: z.enum([
    'unclaimed',       // Tag libre -> PWA auto-reclama en segundo plano sin botones
    'owned_by_me',     // Pulsera del propio usuario autenticado
    'ready_to_pair',   // Pulsera o invitación del partner -> Listo para confirmar unión
    'already_paired',  // Ya pertenece a una pareja activa
    'invalid',         // Código inexistente o caducado
  ]),
  owner: z
    .object({
      id: z.string().uuid(),
      display_name: z.string(),
      avatar_url: z.string().nullable(),
    })
    .nullable(),
})

export type ResolveIdentifierResponse = z.infer<typeof ResolveIdentifierResponseSchema>

// 2. DTO Canónico para Reclamar Tag Físico (Fuente única)
export const ClaimTagInputSchema = z.object({
  tag_identifier: z.string().min(1).max(128),
})

export type ClaimTagInput = z.infer<typeof ClaimTagInputSchema>

// 3. DTO para Vincular Pareja (Transacción Atómica con Idempotencia)
export const PairCoupleInputSchema = z.object({
  client_mutation_id: z.string().uuid(),
  identifier: z.string().min(1).max(128), // tag_identifier o invitation_code
})

export type PairCoupleInput = z.infer<typeof PairCoupleInputSchema>

export const PairCoupleResponseSchema = z.object({
  status: z.literal('success'),
  couple_id: z.string().uuid(),
  partner: z.object({
    id: z.string().uuid(),
    display_name: z.string(),
    avatar_url: z.string().nullable(),
  }),
})

export type PairCoupleResponse = z.infer<typeof PairCoupleResponseSchema>

// 4. DTO para Crear Código Digital de Respaldo
export const CreateInviteCodeResponseSchema = z.object({
  invitation_code: z.string(),
  expires_at: z.string(),
})

export type CreateInviteCodeResponse = z.infer<typeof CreateInviteCodeResponseSchema>

// 5. DTO de Consulta de Pareja Actual
export const CurrentCoupleResponseSchema = z.object({
  couple: z
    .object({
      id: z.string().uuid(),
      status: z.enum(['pending', 'active', 'paused', 'archived']),
      anniversary_date: z.string().nullable(),
      created_at: z.string(),
    })
    .nullable(),
  partner: z
    .object({
      id: z.string().uuid(),
      display_name: z.string(),
      avatar_url: z.string().nullable(),
    })
    .nullable(),
  my_tags: z.array(
    z.object({
      id: z.string().uuid(),
      tag_identifier: z.string(),
      last_tapped_at: z.string().nullable(),
    })
  ),
})

export type CurrentCoupleResponse = z.infer<typeof CurrentCoupleResponseSchema>
