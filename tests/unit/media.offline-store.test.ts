import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db'
import { enqueueMutation } from '../../src/db/outbox'
import { activitiesApi } from '../../src/features/activities/api/activities.api'
import { activitiesStore } from '../../src/features/activities/store/activities.store'
import { mediaApi, pendingMediaStore } from '../../src/features/media'

describe('Fase 3: Offline-First Media Queue (pending_media + Outbox sync + purga inmediata)', () => {
  beforeEach(async () => {
    await db.activities.clear()
    await db.outbox.clear()
    await db.pending_media.clear()
    vi.restoreAllMocks()
  })

  it('1. Sube Blob pendiente directo a R2, sella la actividad y purga pending_media de Dexie al instante', async () => {
    const activityId = crypto.randomUUID()
    await db.activities.put({
      id: activityId,
      logicalDate: '2026-11-26',
      prompt: 'Foto de tu tarde',
      responseType: 'photo_only',
      status: 'pending',
      mySubmissionCompleted: true,
      partnerSubmissionCompleted: false,
      syncStatus: 'pending_sync',
    })

    const fakeBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' })
    const savedMedia = await pendingMediaStore.savePendingMedia({
      kind: 'photo',
      blob: fakeBlob,
      contentType: 'image/webp',
    })

    await enqueueMutation('SUBMIT_ACTIVITY', {
      activity_id: activityId,
      pending_media_id: savedMedia.id,
      payload: { type: 'photo', width: 1920, height: 1080, mime_type: 'image/webp' },
    })

    const uploadSpy = vi
      .spyOn(mediaApi, 'uploadMediaDirect')
      .mockResolvedValue({ mediaKey: 'couples/c1/photo/uploaded-1.webp' })
    const submitSpy = vi.spyOn(activitiesApi, 'submitActivity').mockResolvedValue({
      status: 'success',
      client_mutation_id: crypto.randomUUID(),
      activity_id: activityId,
      activity_status: 'pending',
      state: 'partner_pending',
      message: 'Guardado',
    })

    const synced = await activitiesStore.flushOutbox()
    expect(synced).toBe(1)
    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(submitSpy).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({
        media_key: 'couples/c1/photo/uploaded-1.webp',
      })
    )

    // Purga inmediata verificada: 0 blobs huérfanos en IndexedDB
    expect(await db.pending_media.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    const updatedActivity = await db.activities.get(activityId)
    expect(updatedActivity?.syncStatus).toBe('synced')
  })

  it('2. Purga automáticamente blobs huérfanos con más de 7 días de antigüedad', async () => {
    const oldBlob = new Blob(['old'], { type: 'image/webp' })
    const freshBlob = new Blob(['fresh'], { type: 'audio/webm' })

    await db.pending_media.put({
      id: 'old-orphan',
      kind: 'photo',
      blob: oldBlob,
      contentType: 'image/webp',
      sizeBytes: oldBlob.size,
      createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    })
    await db.pending_media.put({
      id: 'recent-item',
      kind: 'voice',
      blob: freshBlob,
      contentType: 'audio/webm',
      sizeBytes: freshBlob.size,
      createdAt: Date.now() - 1000,
    })

    const removed = await pendingMediaStore.purgeExpiredPendingMedia()
    expect(removed).toBe(1)
    expect(await db.pending_media.get('old-orphan')).toBeUndefined()
    expect(await db.pending_media.get('recent-item')).toBeDefined()
  })
})
