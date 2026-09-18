import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { SubmitActivityInputSchema } from '../../../shared'

export const activitiesRouter = new Hono()

// POST /api/activities/submissions
// Mutación de respuesta diaria sujeta a idempotencia y regla de Blind Reveal
activitiesRouter.post(
  '/submissions',
  zValidator('json', SubmitActivityInputSchema),
  async (c) => {
    const data = c.req.valid('json')

    // El client_mutation_id permite validar idempotencia en idempotency_keys
    return c.json({
      status: 'success',
      client_mutation_id: data.client_mutation_id,
      activity_id: data.activity_id,
      state: 'partner_pending',
      message: 'Respuesta guardada. Esperando a tu pareja para revelar.',
    })
  }
)
