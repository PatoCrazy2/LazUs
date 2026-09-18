import type {
  AuthUserDto,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  SetPasswordInput,
  VerifyEmailInput,
} from '../../../../shared'

export class AuthApiError extends Error {
  status: number
  retryAfter?: number

  constructor(message: string, status: number, retryAfter?: number) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.retryAfter = retryAfter
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
    const retryAfterHeader = response.headers.get('Retry-After')
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined
    throw new AuthApiError(errorMessage, response.status, retryAfter)
  }

  return data as T
}

export const authApi = {
  async register(input: RegisterInput): Promise<{ user: AuthUserDto }> {
    return await request<{ user: AuthUserDto }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async login(input: LoginInput): Promise<{ user: AuthUserDto }> {
    return await request<{ user: AuthUserDto }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async logout(): Promise<{ message: string }> {
    return await request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    })
  },

  async getMe(): Promise<{ user: AuthUserDto }> {
    return await request<{ user: AuthUserDto }>('/api/auth/me', {
      method: 'GET',
    })
  },

  async verifyEmail(input: VerifyEmailInput): Promise<{ message: string }> {
    return await request<{ message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async resendVerification(input: ResendVerificationInput): Promise<{ message: string }> {
    return await request<{ message: string }>('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<{ message: string }> {
    return await request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async resetPassword(input: ResetPasswordInput): Promise<{ user: AuthUserDto; message: string }> {
    return await request<{ user: AuthUserDto; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async setPassword(input: SetPasswordInput): Promise<{ message: string }> {
    return await request<{ message: string }>('/api/auth/set-password', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  getGoogleAuthUrl(): string {
    return '/api/auth/google'
  },
}
