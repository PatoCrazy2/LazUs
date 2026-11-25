import { eq, or, and, sql } from 'drizzle-orm'
import type { DbClient } from '../../db'
import {
  couples,
  coupleMembers,
  nfcTags,
  coupleInvitations,
  idempotencyKeys,
  users,
} from '../../db/schema'
import { CoupleConflictError, IdempotencyConflictError } from './couple.errors'

export class CoupleRepository {
  constructor(private readonly db: DbClient) {}

  async findTagByIdentifier(tagIdentifier: string) {
    const result = await this.db
      .select({
        id: nfcTags.id,
        tagIdentifier: nfcTags.tagIdentifier,
        coupleId: nfcTags.coupleId,
        ownerUserId: nfcTags.ownerUserId,
        ownerDisplayName: users.displayName,
        ownerAvatarUrl: users.avatarUrl,
      })
      .from(nfcTags)
      .leftJoin(users, eq(nfcTags.ownerUserId, users.id))
      .where(eq(nfcTags.tagIdentifier, tagIdentifier))
      .limit(1)

    return result[0] || null
  }

  async claimTagForUser(tagIdentifier: string, userId: string) {
    await this.db
      .insert(nfcTags)
      .values({
        tagIdentifier,
        ownerUserId: userId,
      })
      .onConflictDoUpdate({
        target: nfcTags.tagIdentifier,
        set: { ownerUserId: userId },
      })
  }

  async findUserMembership(userId: string) {
    const result = await this.db
      .select()
      .from(coupleMembers)
      .where(eq(coupleMembers.userId, userId))
      .limit(1)
    return result[0] || null
  }

  async findInvitationByCode(code: string) {
    const result = await this.db
      .select({
        id: coupleInvitations.id,
        inviterUserId: coupleInvitations.inviterUserId,
        status: coupleInvitations.status,
        expiresAt: coupleInvitations.expiresAt,
        inviterDisplayName: users.displayName,
        inviterAvatarUrl: users.avatarUrl,
      })
      .from(coupleInvitations)
      .leftJoin(users, eq(coupleInvitations.inviterUserId, users.id))
      .where(eq(coupleInvitations.invitationCode, code))
      .limit(1)

    return result[0] || null
  }

  async createInvitation(inviterUserId: string, code: string, expiresAt: Date) {
    await this.db.insert(coupleInvitations).values({
      inviterUserId,
      invitationCode: code,
      expiresAt,
      status: 'pending',
    })
  }

  async findUserTags(userId: string) {
    return await this.db
      .select({
        id: nfcTags.id,
        tagIdentifier: nfcTags.tagIdentifier,
        lastTappedAt: nfcTags.lastTappedAt,
      })
      .from(nfcTags)
      .where(eq(nfcTags.ownerUserId, userId))
  }

  async findActiveCoupleByUserId(userId: string) {
    const membership = await this.findUserMembership(userId)
    if (!membership) return null

    const coupleResult = await this.db
      .select()
      .from(couples)
      .where(eq(couples.id, membership.coupleId))
      .limit(1)
    
    if (!coupleResult.length) return null

    const partnerMembership = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(coupleMembers)
      .innerJoin(users, eq(coupleMembers.userId, users.id))
      .where(
        and(
          eq(coupleMembers.coupleId, membership.coupleId),
          sql`${coupleMembers.userId} != ${userId}`
        )
      )
      .limit(1)

    return {
      couple: coupleResult[0],
      partner: partnerMembership[0] || null,
    }
  }

  async executeAtomicPairing(
    inviterUserId: string,
    acceptorUserId: string,
    clientMutationId: string,
    tagIdentifierToUpdate?: string
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Idempotency Check
      const existingKey = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, clientMutationId))
        .limit(1)
      
      if (existingKey.length > 0) {
        throw new IdempotencyConflictError(
          existingKey[0].responseBody,
          existingKey[0].responseCode
        )
      }

      try {
        // Lock both users to prevent concurrent pairings
        await tx.execute(
          sql`SELECT id FROM ${users} WHERE id IN (${inviterUserId}, ${acceptorUserId}) FOR UPDATE`
        )

        // Validate memberships inside transaction
        const inviterMembership = await tx
          .select()
          .from(coupleMembers)
          .where(eq(coupleMembers.userId, inviterUserId))
          .limit(1)
          
        const acceptorMembership = await tx
          .select()
          .from(coupleMembers)
          .where(eq(coupleMembers.userId, acceptorUserId))
          .limit(1)

        if (inviterMembership.length > 0 || acceptorMembership.length > 0) {
          throw new CoupleConflictError()
        }

        // Insert new couple
        const newCouple = await tx
          .insert(couples)
          .values({ status: 'active' })
          .returning()
        
        const coupleId = newCouple[0].id

        // Insert memberships
        await tx.insert(coupleMembers).values([
          { coupleId, userId: inviterUserId, role: 'partner_a' },
          { coupleId, userId: acceptorUserId, role: 'partner_b' },
        ])

        // Update tags
        await tx
          .update(nfcTags)
          .set({ coupleId })
          .where(
            or(
              eq(nfcTags.ownerUserId, inviterUserId),
              eq(nfcTags.ownerUserId, acceptorUserId)
            )
          )
        
        // Update invitation if it was a code (handled by service if needed, but not strictly required if we don't track the exact invitation used, but wait: if there are pending invitations from inviter, we should probably mark them accepted/expired. For simplicity, just let them expire or update any pending).
        await tx
          .update(coupleInvitations)
          .set({ status: 'accepted', acceptedByUserId: acceptorUserId, acceptedAt: new Date(), coupleId })
          .where(and(eq(coupleInvitations.inviterUserId, inviterUserId), eq(coupleInvitations.status, 'pending')))

        // Fetch partner details for the response
        const partner = await tx
          .select({
            id: users.id,
            display_name: users.displayName,
            avatar_url: users.avatarUrl,
          })
          .from(users)
          .where(eq(users.id, inviterUserId))
          .limit(1)

        const responseBody = {
          status: 'success' as const,
          couple_id: coupleId,
          partner: partner[0],
        }

        // Save idempotency key
        await tx.insert(idempotencyKeys).values({
          key: clientMutationId,
          userId: acceptorUserId,
          operationType: 'LINK_COUPLE',
          responseCode: 200,
          responseBody,
        })

        return responseBody
      } catch (error: any) {
        if (error?.code === '23505' || error?.cause?.code === '23505') {
          throw new CoupleConflictError()
        }
        throw error
      }
    })
  }
}
