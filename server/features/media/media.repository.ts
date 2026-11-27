import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { DbClient } from '../../db'
import {
  coupleMembers,
  couples,
  dailyActivities,
  submissions,
  users,
  weeklyCollages,
} from '../../db/schema'

export interface MediaCoupleContext {
  coupleId: string
  timezone: string
  role: 'partner_a' | 'partner_b'
}

export interface SubmissionMediaOwnership {
  submissionId: string
  submissionUserId: string
  activityId: string
  coupleId: string
  activityStatus: 'pending' | 'revealed'
}

export interface RevealedWeekActivityRow {
  activity: typeof dailyActivities.$inferSelect
  submissions: Array<{
    userId: string
    displayName: string
    content: string | null
    mediaKey: string | null
    payload: unknown
    completedAt: Date
  }>
}

export class MediaRepository {
  constructor(private readonly db: DbClient) {}

  async findActiveCoupleContextByUserId(userId: string): Promise<MediaCoupleContext | null> {
    const [row] = await this.db
      .select({
        coupleId: couples.id,
        timezone: couples.timezone,
        role: coupleMembers.role,
      })
      .from(coupleMembers)
      .innerJoin(couples, eq(coupleMembers.coupleId, couples.id))
      .where(and(eq(coupleMembers.userId, userId), eq(couples.status, 'active')))
      .limit(1)

    return row ?? null
  }

  async findSubmissionByMediaKey(mediaKey: string): Promise<SubmissionMediaOwnership | null> {
    const [row] = await this.db
      .select({
        submissionId: submissions.id,
        submissionUserId: submissions.userId,
        activityId: dailyActivities.id,
        coupleId: dailyActivities.coupleId,
        activityStatus: dailyActivities.status,
      })
      .from(submissions)
      .innerJoin(dailyActivities, eq(submissions.activityId, dailyActivities.id))
      .where(eq(submissions.mediaKey, mediaKey))
      .limit(1)

    return row ?? null
  }

  async listActiveCouples(): Promise<Array<{ id: string; timezone: string }>> {
    return await this.db
      .select({
        id: couples.id,
        timezone: couples.timezone,
      })
      .from(couples)
      .where(eq(couples.status, 'active'))
  }

  async findRevealedActivitiesInDateRange(
    coupleId: string,
    weekStartDate: string,
    weekEndDate: string
  ): Promise<RevealedWeekActivityRow[]> {
    const activities = await this.db
      .select()
      .from(dailyActivities)
      .where(
        and(
          eq(dailyActivities.coupleId, coupleId),
          eq(dailyActivities.status, 'revealed'),
          gte(dailyActivities.logicalDate, weekStartDate),
          lte(dailyActivities.logicalDate, weekEndDate)
        )
      )
      .orderBy(desc(dailyActivities.logicalDate))

    if (activities.length === 0) {
      return []
    }

    const activityIds = activities.map((a) => a.id)
    const subs = await this.db
      .select({
        activityId: submissions.activityId,
        userId: submissions.userId,
        displayName: users.displayName,
        content: submissions.content,
        mediaKey: submissions.mediaKey,
        payload: submissions.payload,
        completedAt: submissions.completedAt,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .where(inArray(submissions.activityId, activityIds))

    const byActivity = new Map<string, RevealedWeekActivityRow['submissions']>()
    for (const s of subs) {
      const list = byActivity.get(s.activityId) ?? []
      list.push({
        userId: s.userId,
        displayName: s.displayName,
        content: s.content,
        mediaKey: s.mediaKey,
        payload: s.payload,
        completedAt: s.completedAt,
      })
      byActivity.set(s.activityId, list)
    }

    return activities.map((activity) => ({
      activity,
      submissions: byActivity.get(activity.id) ?? [],
    }))
  }

  async findCollageByCoupleAndWeek(coupleId: string, weekStartDate: string) {
    const [row] = await this.db
      .select()
      .from(weeklyCollages)
      .where(
        and(
          eq(weeklyCollages.coupleId, coupleId),
          eq(weeklyCollages.weekStartDate, weekStartDate)
        )
      )
      .limit(1)
    return row ?? null
  }

  async findCollageById(collageId: string) {
    const [row] = await this.db
      .select()
      .from(weeklyCollages)
      .where(eq(weeklyCollages.id, collageId))
      .limit(1)
    return row ?? null
  }

  async listCollagesForCouple(coupleId: string, limit = 52) {
    return await this.db
      .select()
      .from(weeklyCollages)
      .where(eq(weeklyCollages.coupleId, coupleId))
      .orderBy(desc(weeklyCollages.weekStartDate))
      .limit(limit)
  }

  async upsertWeeklyCollage(params: {
    coupleId: string
    weekStartDate: string
    weekEndDate: string
    highlights: unknown
    activitiesCount: number
    now: Date
  }) {
    const existing = await this.findCollageByCoupleAndWeek(params.coupleId, params.weekStartDate)
    if (!existing) {
      const [created] = await this.db
        .insert(weeklyCollages)
        .values({
          coupleId: params.coupleId,
          weekStartDate: params.weekStartDate,
          weekEndDate: params.weekEndDate,
          status: 'ready',
          highlights: params.highlights,
          activitiesCount: params.activitiesCount,
          createdAt: params.now,
          updatedAt: params.now,
        })
        .returning()
      return created!
    }

    // Si llegaron nuevas actividades reveladas durante la semana, actualizamos highlights
    // pero preservamos rendered/mediaKey si no cambió el conteo.
    const countChanged = existing.activitiesCount !== params.activitiesCount
    const [updated] = await this.db
      .update(weeklyCollages)
      .set({
        highlights: params.highlights,
        activitiesCount: params.activitiesCount,
        status: countChanged ? 'ready' : existing.status,
        updatedAt: params.now,
      })
      .where(eq(weeklyCollages.id, existing.id))
      .returning()

    return updated!
  }

  async markCollageRendered(params: {
    collageId: string
    coupleId: string
    mediaKey: string
    now: Date
  }) {
    const [updated] = await this.db
      .update(weeklyCollages)
      .set({
        status: 'rendered',
        mediaKey: params.mediaKey,
        renderedAt: params.now,
        updatedAt: params.now,
      })
      .where(
        and(eq(weeklyCollages.id, params.collageId), eq(weeklyCollages.coupleId, params.coupleId))
      )
      .returning()

    return updated ?? null
  }
}
