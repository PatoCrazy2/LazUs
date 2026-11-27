import {
  RequestUploadUrlResponseSchema,
  RequestViewUrlResponseSchema,
  SaveRenderedCollageResponseSchema,
  WeeklyCollageListResponseSchema,
  type MediaKind,
  type RequestUploadUrlInput,
  type RequestUploadUrlResponse,
  type RequestViewUrlResponse,
  type SaveRenderedCollageResponse,
  type WeeklyCollageListResponse,
} from '../../../../shared'

export class MediaApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MediaApiError'
    this.status = status
  }
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string }
    return body.error || body.message || fallback
  } catch {
    return fallback
  }
}

export const mediaApi = {
  async requestUploadUrl(input: RequestUploadUrlInput): Promise<RequestUploadUrlResponse> {
    const res = await fetch('/api/media/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      throw new MediaApiError(
        await parseErrorMessage(res, 'No se pudo obtener el permiso de subida'),
        res.status
      )
    }

    return RequestUploadUrlResponseSchema.parse(await res.json())
  },

  /**
   * Subida directa del navegador a Cloudflare R2 (cero proxy por Hono/Workers).
   */
  async uploadBlobDirect(
    uploadUrl: string,
    headers: Record<string, string>,
    blob: Blob
  ): Promise<void> {
    const isSameOrigin =
      typeof window !== 'undefined' && uploadUrl.startsWith(window.location.origin)

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      // No enviar cookies a R2 (solo a dev-object en el mismo origen si aplica)
      credentials: isSameOrigin ? 'include' : 'omit',
      body: blob,
    })

    if (!res.ok) {
      throw new MediaApiError('No se pudo subir el archivo multimedia al almacenamiento', res.status)
    }
  },

  async uploadMediaDirect(params: {
    kind: MediaKind
    blob: Blob
    contentType: string
    activityId?: string
    collageId?: string
  }): Promise<{ mediaKey: string }> {
    const normalizedMime = params.contentType.split(';')[0]?.trim().toLowerCase() || params.contentType
    const presigned = await this.requestUploadUrl({
      kind: params.kind,
      content_type: normalizedMime,
      size_bytes: params.blob.size,
      activity_id: params.activityId,
      collage_id: params.collageId,
    })

    await this.uploadBlobDirect(presigned.upload_url, presigned.headers, params.blob)
    return { mediaKey: presigned.media_key }
  },

  async requestViewUrl(mediaKey: string): Promise<RequestViewUrlResponse> {
    const res = await fetch('/api/media/view-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ media_key: mediaKey }),
    })

    if (!res.ok) {
      throw new MediaApiError(
        await parseErrorMessage(res, 'No se pudo cargar el archivo privado'),
        res.status
      )
    }

    return RequestViewUrlResponseSchema.parse(await res.json())
  },

  async listWeeklyCollages(): Promise<WeeklyCollageListResponse> {
    const res = await fetch('/api/media/collages', {
      method: 'GET',
      credentials: 'include',
    })

    if (!res.ok) {
      throw new MediaApiError(
        await parseErrorMessage(res, 'No se pudieron cargar los collages semanales'),
        res.status
      )
    }

    return WeeklyCollageListResponseSchema.parse(await res.json())
  },

  async saveRenderedCollage(
    collageId: string,
    mediaKey: string
  ): Promise<SaveRenderedCollageResponse> {
    const res = await fetch(`/api/media/collages/${encodeURIComponent(collageId)}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        media_key: mediaKey,
        client_mutation_id: crypto.randomUUID(),
      }),
    })

    if (!res.ok) {
      throw new MediaApiError(
        await parseErrorMessage(res, 'No se pudo guardar el collage renderizado'),
        res.status
      )
    }

    return SaveRenderedCollageResponseSchema.parse(await res.json())
  },
}
