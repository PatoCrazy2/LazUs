import type {
  ActivityHistoryResponse,
  MusicSearchResult,
  SubmitActivityInput,
  SubmitActivityResponse,
  TodayActivityResponse,
} from '../../../../shared'

export class ActivitiesApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ActivitiesApiError'
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
    credentials: 'include',
  })

  let data: any = null
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    data = await response.json()
  }

  if (!response.ok) {
    const errorMessage = data?.error || response.statusText || 'Error en la solicitud'
    throw new ActivitiesApiError(errorMessage, response.status)
  }

  return data as T
}

export const activitiesApi = {
  async getTodayActivity(): Promise<TodayActivityResponse> {
    return await request<TodayActivityResponse>('/api/activities/today', {
      method: 'GET',
    })
  },

  async submitActivity(
    activityId: string,
    input: SubmitActivityInput
  ): Promise<SubmitActivityResponse> {
    return await request<SubmitActivityResponse>(`/api/activities/${activityId}/submissions`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async getActivityResults(activityId: string): Promise<TodayActivityResponse> {
    return await request<TodayActivityResponse>(`/api/activities/${activityId}/results`, {
      method: 'GET',
    })
  },

  async getHistory(): Promise<ActivityHistoryResponse> {
    return await request<ActivityHistoryResponse>('/api/activities/history', {
      method: 'GET',
    })
  },

  async searchMusic(query: string): Promise<MusicSearchResult> {
    const encoded = encodeURIComponent(query.trim())
    return await request<MusicSearchResult>(`/api/activities/music/search?q=${encoded}`, {
      method: 'GET',
    })
  },
}
