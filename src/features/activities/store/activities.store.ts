import type {
  SubmissionPayload,
  SubmitActivityInput,
  TodayActivityResponse,
} from '../../../../shared'
import { db, type LocalActivity } from '../../../db'
import {
  getPendingMutations,
  handleSyncError,
  markMutationSynced,
} from '../../../db/outbox'
import { ActivitiesApiError, activitiesApi } from '../api/activities.api'

export const activitiesStore = {
  async saveTodayActivity(data: TodayActivityResponse): Promise<void> {
    const existing = await db.activities.get(data.id)
    const hasPendingLocal = existing?.syncStatus === 'pending_sync' && !data.my_submission

    const record: LocalActivity = {
      id: data.id,
      logicalDate: data.logical_date,
      prompt: data.prompt,
      category: data.category,
      tone: data.tone,
      occasion: data.occasion,
      responseType: data.response_type,
      promptConfig: data.prompt_config ?? null,
      status: data.status,
      mySubmissionCompleted: hasPendingLocal ? true : Boolean(data.my_submission),
      partnerSubmissionCompleted: data.partner_completed,
      myContent: hasPendingLocal
        ? existing?.myContent
        : data.my_submission?.content ?? undefined,
      myPayload: hasPendingLocal
        ? existing?.myPayload
        : data.my_submission?.payload ?? null,
      partnerContent:
        data.status === 'revealed'
          ? data.partner_submission?.content ?? undefined
          : undefined,
      partnerPayload:
        data.status === 'revealed'
          ? data.partner_submission?.payload ?? null
          : undefined,
      revealedAt: data.revealed_at ?? undefined,
      syncStatus: hasPendingLocal ? 'pending_sync' : 'synced',
    }

    await db.activities.put(record)
  },

  async getLatestLocalActivity(): Promise<LocalActivity | undefined> {
    return await db.activities.orderBy('logicalDate').reverse().first()
  },

  async saveOptimisticSubmission(
    activityId: string,
    content?: string,
    payload?: SubmissionPayload
  ): Promise<void> {
    await db.activities.update(activityId, {
      mySubmissionCompleted: true,
      myContent: content,
      myPayload: payload ?? null,
      syncStatus: 'pending_sync',
    })
  },

  async markActivitySynced(activityId: string): Promise<void> {
    await db.activities.update(activityId, {
      syncStatus: 'synced',
    })
  },

  async flushOutbox(): Promise<number> {
    const pending = await getPendingMutations()
    const activityMutations = pending.filter((m) => m.mutation_type === 'SUBMIT_ACTIVITY')
    let syncedCount = 0

    for (const item of activityMutations) {
      const input = item.payload as unknown as SubmitActivityInput
      try {
        await activitiesApi.submitActivity(input.activity_id, {
          ...input,
          client_mutation_id: item.client_mutation_id,
        })
        await markMutationSynced(item.id)
        await this.markActivitySynced(input.activity_id)
        syncedCount++
      } catch (err) {
        const statusCode = err instanceof ActivitiesApiError ? err.status : 0
        const message = err instanceof Error ? err.message : 'Error de sincronización'
        await handleSyncError(item.id, statusCode, message)
      }
    }

    return syncedCount
  },
}
