import { describe, expect, it } from 'vitest'
import {
  ClientMutationHeaderSchema,
  SubmitActivityInputSchema,
  SendAffectionInputSchema,
} from '../../shared'

describe('Shared Zod Schemas & Invariants', () => {
  it('debe exigir que client_mutation_id sea un UUIDv4 válido', () => {
    const valid = ClientMutationHeaderSchema.safeParse({
      client_mutation_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(valid.success).toBe(true)

    const invalid = ClientMutationHeaderSchema.safeParse({
      client_mutation_id: 'not-a-uuid',
    })
    expect(invalid.success).toBe(false)
  })

  it('debe validar payload de respuesta diaria (Blind Reveal)', () => {
    const valid = SubmitActivityInputSchema.safeParse({
      client_mutation_id: '550e8400-e29b-41d4-a716-446655440000',
      activity_id: '123e4567-e89b-12d3-a456-426614174000',
      content: 'Mi momento favorito fue cuando cocinamos juntos.',
    })
    expect(valid.success).toBe(true)
  })

  it('debe validar eventos de afecto con valor por defecto heart_tap', () => {
    const res = SendAffectionInputSchema.safeParse({
      client_mutation_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.event_type).toBe('heart_tap')
    }
  })
})
