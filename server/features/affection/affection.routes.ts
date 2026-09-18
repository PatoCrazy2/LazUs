import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { SendAffectionInputSchema } from '../../../shared'

export const affectionRouter = new Hono()

// POST /api/affection
// Toque de cariño originado por NFC o interacción rápida
affectionRouter.post(
  '/',
  zValidator('json', SendAffectionInputSchema),
  async (c) => {
    const data = c.req.valid('json')

    return c.json({
      status: 'success',
      client_mutation_id: data.client_mutation_id,
      event_type: data.event_type,
      message: 'Toque de afecto registrado.',
    })
  }
)
