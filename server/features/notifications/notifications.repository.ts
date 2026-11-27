import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { DbClient } from '../../db'
import { coupleMembers, pushSubscriptions, users } from '../../db/schema'

export interface StoredPushSubscription {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

export class NotificationsRepository {
  constructor(private readonly db: DbClient) {}

  async upsertSubscription(params: {
    userId: string
    endpoint: string
    p256dh: string
    auth: string
    userAgent?: string
  }): Promise<number> {
    const now = new Date()

    await this.db
      .insert(pushSubscriptions)
      .values({
        userId: params.userId,
        endpoint: params.endpoint,
        p256dh: params.p256dh,
        auth: params.auth,
        userAgent: params.userAgent ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: params.userId,
          p256dh: params.p256dh,
          auth: params.auth,
          userAgent: params.userAgent ?? null,
          updatedAt: now,
        },
      })

    return this.countSubscriptionsForUser(params.userId)
  }

  async deleteSubscriptionByEndpoint(
    userId: string,
    endpoint: string
  ): Promise<{ deleted: boolean; subscriptionsCount: number }> {
    const deletedRows = await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .returning({ id: pushSubscriptions.id })

    const subscriptionsCount = await this.countSubscriptionsForUser(userId)
    return {
      deleted: deletedRows.length > 0,
      subscriptionsCount,
    }
  }

  async deleteSubscriptionsByEndpoints(endpoints: string[]): Promise<number> {
    if (endpoints.length === 0) return 0

    const deleted = await this.db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, endpoints))
      .returning({ id: pushSubscriptions.id })

    return deleted.length
  }

  async countSubscriptionsForUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))

    return row?.count ?? 0
  }

  async getUserSubscriptionStatus(
    userId: string,
    endpoint?: string
  ): Promise<{ subscriptionsCount: number; currentDeviceSubscribed: boolean }> {
    const subscriptionsCount = await this.countSubscriptionsForUser(userId)

    if (!endpoint || subscriptionsCount === 0) {
      return {
        subscriptionsCount,
        currentDeviceSubscribed: false,
      }
    }

    const [match] = await this.db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .limit(1)

    return {
      subscriptionsCount,
      currentDeviceSubscribed: Boolean(match),
    }
  }

  async findUserSubscriptionByEndpoint(
    userId: string,
    endpoint: string
  ): Promise<StoredPushSubscription | null> {
    const [row] = await this.db
      .select({
        id: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .limit(1)

    return row ?? null
  }

  async findPartnerSubscriptionsForCouple(
    coupleId: string,
    senderUserId: string
  ): Promise<{
    senderName: string
    partnerUserId: string | null
    subscriptions: StoredPushSubscription[]
  }> {
    const [[sender], [partnerMember]] = await Promise.all([
      this.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, senderUserId))
        .limit(1),
      this.db
        .select({ userId: coupleMembers.userId })
        .from(coupleMembers)
        .where(and(eq(coupleMembers.coupleId, coupleId), ne(coupleMembers.userId, senderUserId)))
        .limit(1),
    ])

    const senderName = sender?.displayName?.trim() || 'Tu pareja'

    if (!partnerMember) {
      return {
        senderName,
        partnerUserId: null,
        subscriptions: [],
      }
    }

    const subscriptions = await this.db
      .select({
        id: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, partnerMember.userId))

    return {
      senderName,
      partnerUserId: partnerMember.userId,
      subscriptions,
    }
  }

  async touchSubscriptionsLastUsed(endpoints: string[]): Promise<void> {
    if (endpoints.length === 0) return

    await this.db
      .update(pushSubscriptions)
      .set({ lastUsedAt: new Date() })
      .where(inArray(pushSubscriptions.endpoint, endpoints))
  }
}
