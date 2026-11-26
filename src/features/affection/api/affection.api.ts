import type { SendAffectionInput } from '../../../../shared'

export interface SendAffectionResponse {
  status: 'success'
  affection_id: string
  client_mutation_id: string
  event_type: SendAffectionInput['event_type']
  created_at: string
  message: string
}

export class AffectionApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AffectionApiError'
    this.status = status
  }
}

export const affectionApi = {
  async sendAffection(input: SendAffectionInput): Promise<SendAffectionResponse> {
    const response = await fetch('/api/affection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    })

    let data: Record<string, unknown> | null = null
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      data = (await response.json()) as Record<string, unknown>
    }

    if (!response.ok) {
      const errorMessage =
        (typeof data?.error === 'string' && data.error) ||
        response.statusText ||
        'Error al enviar el toque de afecto'
      throw new AffectionApiError(errorMessage, response.status)
    }

    return data as unknown as SendAffectionResponse
  },
}
