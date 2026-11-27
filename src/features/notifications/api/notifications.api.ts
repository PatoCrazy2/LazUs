import type {
  PushStatusResponse,
  PushSubscriptionInput,
  PushSubscriptionMutationResponse,
  TestPushInput,
  TestPushResponse,
  UnsubscribePushInput,
  VapidPublicKeyResponse,
} from '../../../../shared'

export class NotificationsApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'NotificationsApiError'
    this.status = status
  }
}

async function parseApiResponse<T>(response: Response, fallbackError: string): Promise<T> {
  let data: Record<string, unknown> | null = null
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    data = (await response.json()) as Record<string, unknown>
  }

  if (!response.ok) {
    const message =
      (typeof data?.error === 'string' && data.error) || response.statusText || fallbackError
    throw new NotificationsApiError(message, response.status)
  }

  return data as unknown as T
}

export const notificationsApi = {
  async getVapidPublicKey(): Promise<VapidPublicKeyResponse> {
    const response = await fetch('/api/notifications/vapid-public-key', {
      method: 'GET',
      credentials: 'include',
    })
    return parseApiResponse<VapidPublicKeyResponse>(
      response,
      'No se pudo obtener la configuración de notificaciones'
    )
  },

  async getStatus(endpoint?: string): Promise<PushStatusResponse> {
    const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''
    const response = await fetch(`/api/notifications/status${query}`, {
      method: 'GET',
      credentials: 'include',
    })
    return parseApiResponse<PushStatusResponse>(
      response,
      'No se pudo consultar el estado de avisos'
    )
  },

  async subscribe(input: PushSubscriptionInput): Promise<PushSubscriptionMutationResponse> {
    const response = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    })
    return parseApiResponse<PushSubscriptionMutationResponse>(
      response,
      'No se pudieron activar los avisos en este dispositivo'
    )
  },

  async unsubscribe(input: UnsubscribePushInput): Promise<PushSubscriptionMutationResponse> {
    const response = await fetch('/api/notifications/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    })
    return parseApiResponse<PushSubscriptionMutationResponse>(
      response,
      'No se pudieron desactivar los avisos en este dispositivo'
    )
  },

  async sendTestPush(input: TestPushInput): Promise<TestPushResponse> {
    const response = await fetch('/api/notifications/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    })
    return parseApiResponse<TestPushResponse>(
      response,
      'No se pudo enviar el aviso de prueba'
    )
  },
}
