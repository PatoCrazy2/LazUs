import type { MediaKind } from '../../../../shared'
import { db, type LocalPendingMedia } from '../../../db'
import { mediaApi } from '../api/media.api'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export const pendingMediaStore = {
  /**
   * Almacena temporalmente un Blob ya comprimido (~300–500 KB) en IndexedDB para envío offline.
   */
  async savePendingMedia(params: {
    id?: string
    kind: MediaKind
    blob: Blob
    contentType: string
  }): Promise<LocalPendingMedia> {
    const record: LocalPendingMedia = {
      id: params.id ?? crypto.randomUUID(),
      kind: params.kind,
      blob: params.blob,
      contentType: params.contentType,
      sizeBytes: params.blob.size,
      createdAt: Date.now(),
    }

    await db.pending_media.put(record)
    return record
  },

  async getPendingMedia(id: string): Promise<LocalPendingMedia | undefined> {
    return await db.pending_media.get(id)
  },

  async deletePendingMedia(id: string): Promise<void> {
    await db.pending_media.delete(id)
  },

  /**
   * Sube el Blob pendiente directamente a R2 y lo purga de IndexedDB de inmediato tras el éxito.
   */
  async uploadAndPurgePendingMedia(
    pendingMediaId: string,
    options?: { activityId?: string }
  ): Promise<string> {
    const record = await db.pending_media.get(pendingMediaId)
    if (!record) {
      throw new Error('El archivo multimedia pendiente ya no existe en el dispositivo')
    }

    const { mediaKey } = await mediaApi.uploadMediaDirect({
      kind: record.kind,
      blob: record.blob,
      contentType: record.contentType,
      activityId: options?.activityId,
    })

    // Purga inmediata para mantener IndexedDB ligero en iOS Safari / Android
    await db.pending_media.delete(pendingMediaId)
    return mediaKey
  },

  /**
   * Limpia archivos huérfanos con más de 7 días de antigüedad.
   */
  async purgeExpiredPendingMedia(maxAgeMs: number = SEVEN_DAYS_MS): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    return await db.pending_media.where('createdAt').below(cutoff).delete()
  },
}
