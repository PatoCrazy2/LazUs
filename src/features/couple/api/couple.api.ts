import type {
  ClaimTagInput,
  CreateInviteCodeResponse,
  CurrentCoupleResponse,
  PairCoupleInput,
  PairCoupleResponse,
  ResolveIdentifierResponse,
} from '../../../../shared'

export class CoupleApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'CoupleApiError'
    this.status = status
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include', // Incluye cookies HttpOnly de sesión
  })

  let data: any = null
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    data = await response.json()
  }

  if (!response.ok) {
    const errorMessage = data?.error || response.statusText || 'Error en la solicitud'
    throw new CoupleApiError(errorMessage, response.status)
  }

  return data as T
}

export const coupleApi = {
  /**
   * Resuelve el estado de un tag NFC o código de invitación (/api/couple/resolve/:identifier)
   * Puede ser consultado de forma anónima o autenticada gracias a optionalAuthMiddleware.
   */
  async resolveIdentifier(identifier: string): Promise<ResolveIdentifierResponse> {
    return await request<ResolveIdentifierResponse>(`/api/couple/resolve/${encodeURIComponent(identifier)}`)
  },

  /**
   * Reclama un tag virgen/libre asociándolo al usuario autenticado actual (/api/couple/claim-tag)
   */
  async claimTag(input: ClaimTagInput): Promise<{ status: string }> {
    return await request<{ status: string }>('/api/couple/claim-tag', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  /**
   * Vincula a la pareja de forma atómica e idempotente (/api/couple/pair)
   */
  async pair(input: PairCoupleInput): Promise<PairCoupleResponse> {
    return await request<PairCoupleResponse>('/api/couple/pair', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  /**
   * Obtiene los datos de la pareja actual, partner y pulseras (/api/couple/current)
   */
  async getCurrentCouple(): Promise<CurrentCoupleResponse> {
    return await request<CurrentCoupleResponse>('/api/couple/current')
  },

  /**
   * Genera un código de invitación digital de respaldo de 6 caracteres (/api/couple/invite-code)
   */
  async createInviteCode(): Promise<CreateInviteCodeResponse> {
    return await request<CreateInviteCodeResponse>('/api/couple/invite-code', {
      method: 'POST',
    })
  },
}
