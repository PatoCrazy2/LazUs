import type { DbClient } from '../../db'
import type { 
  ResolveIdentifierResponse, 
  ClaimTagInput, 
  PairCoupleInput, 
  PairCoupleResponse,
  CreateInviteCodeResponse,
  CurrentCoupleResponse
} from '../../../shared'
import { CoupleRepository } from './couple.repository'
import { CoupleConflictError, IdempotencyConflictError } from './couple.errors'

export class CoupleService {
  private repo: CoupleRepository

  constructor(db: DbClient) {
    this.repo = new CoupleRepository(db)
  }

  async resolveIdentifier(
    identifier: string,
    currentUserId?: string
  ): Promise<ResolveIdentifierResponse> {
    const isDigitalCode = /^LZ-[A-Z0-9]{4,8}$/i.test(identifier)

    if (isDigitalCode) {
      const invite = await this.repo.findInvitationByCode(identifier.toUpperCase())
      
      if (!invite) {
        return {
          identifier,
          type: 'digital_invite',
          state: 'invalid',
          owner: null,
        }
      }

      if (invite.status !== 'pending' || invite.expiresAt.getTime() < Date.now()) {
        return {
          identifier,
          type: 'digital_invite',
          state: 'invalid',
          owner: null,
        }
      }

      // If current user is the inviter, it's not ready to pair, it's owned by me
      if (currentUserId && invite.inviterUserId === currentUserId) {
         return {
          identifier,
          type: 'digital_invite',
          state: 'owned_by_me',
          owner: {
            id: invite.inviterUserId,
            display_name: invite.inviterDisplayName || '',
            avatar_url: invite.inviterAvatarUrl || null,
          },
        }
      }

      const inviterMembership = await this.repo.findUserMembership(invite.inviterUserId)
      if (inviterMembership) {
        return {
          identifier,
          type: 'digital_invite',
          state: 'already_paired',
          owner: {
            id: invite.inviterUserId,
            display_name: invite.inviterDisplayName || '',
            avatar_url: invite.inviterAvatarUrl || null,
          },
        }
      }

      return {
        identifier,
        type: 'digital_invite',
        state: 'ready_to_pair',
        owner: {
          id: invite.inviterUserId,
          display_name: invite.inviterDisplayName || '',
          avatar_url: invite.inviterAvatarUrl || null,
        },
      }
    }

    // Is NFC Tag
    const tag = await this.repo.findTagByIdentifier(identifier)

    if (!tag || !tag.ownerUserId) {
      return {
        identifier,
        type: 'nfc_tag',
        state: 'unclaimed',
        owner: null,
      }
    }

    if (currentUserId && tag.ownerUserId === currentUserId) {
      return {
        identifier,
        type: 'nfc_tag',
        state: 'owned_by_me',
        owner: {
          id: tag.ownerUserId,
          display_name: tag.ownerDisplayName || '',
          avatar_url: tag.ownerAvatarUrl || null,
        },
      }
    }

    if (tag.coupleId) {
      return {
        identifier,
        type: 'nfc_tag',
        state: 'already_paired',
        owner: {
          id: tag.ownerUserId,
          display_name: tag.ownerDisplayName || '',
          avatar_url: tag.ownerAvatarUrl || null,
        },
      }
    }
    
    // Tag has an owner but no couple ID -> ready to pair
    return {
      identifier,
      type: 'nfc_tag',
      state: 'ready_to_pair',
      owner: {
        id: tag.ownerUserId,
        display_name: tag.ownerDisplayName || '',
        avatar_url: tag.ownerAvatarUrl || null,
      },
    }
  }

  async claimTag(userId: string, input: ClaimTagInput): Promise<void> {
    const tag = await this.repo.findTagByIdentifier(input.tag_identifier)
    
    // Already claimed by this user?
    if (tag && tag.ownerUserId === userId) {
      return // Idempotent success
    }

    // Already claimed by someone else?
    if (tag && tag.ownerUserId) {
      throw new Error('Tag already claimed by another user') // Or maybe 403 Forbidden
    }

    await this.repo.claimTagForUser(input.tag_identifier, userId)
  }

  async pairCouple(userId: string, input: PairCoupleInput): Promise<PairCoupleResponse> {
    const isDigitalCode = /^LZ-[A-Z0-9]{4,8}$/i.test(input.identifier)
    let inviterUserId: string

    if (isDigitalCode) {
      const invite = await this.repo.findInvitationByCode(input.identifier.toUpperCase())
      if (!invite || invite.status !== 'pending' || invite.expiresAt.getTime() < Date.now()) {
        throw new Error('Invalid or expired invitation code')
      }
      inviterUserId = invite.inviterUserId
    } else {
      const tag = await this.repo.findTagByIdentifier(input.identifier)
      if (!tag || !tag.ownerUserId) {
        throw new Error('Invalid or unclaimed NFC tag')
      }
      inviterUserId = tag.ownerUserId
    }

    if (inviterUserId === userId) {
      throw new Error('Cannot pair with yourself')
    }

    try {
      return await this.repo.executeAtomicPairing(
        inviterUserId,
        userId,
        input.client_mutation_id,
        isDigitalCode ? undefined : input.identifier
      )
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return error.responseBody as PairCoupleResponse
      }
      throw error
    }
  }

  async getCurrentCouple(userId: string): Promise<CurrentCoupleResponse> {
    const data = await this.repo.findActiveCoupleByUserId(userId)
    const tags = await this.repo.findUserTags(userId)

    const formattedTags = tags.map(t => ({
      id: t.id,
      tag_identifier: t.tagIdentifier,
      last_tapped_at: t.lastTappedAt?.toISOString() || null,
    }))

    if (!data) {
      return { couple: null, partner: null, my_tags: formattedTags }
    }

    return {
      couple: {
        id: data.couple.id,
        status: data.couple.status,
        anniversary_date: data.couple.anniversaryDate?.toISOString() || null,
        created_at: data.couple.createdAt.toISOString(),
      },
      partner: data.partner ? {
        id: data.partner.userId,
        display_name: data.partner.displayName,
        avatar_url: data.partner.avatarUrl,
      } : null,
      my_tags: formattedTags,
    }
  }

  async generateInviteCode(userId: string): Promise<CreateInviteCodeResponse> {
    const membership = await this.repo.findUserMembership(userId)
    if (membership) {
      throw new CoupleConflictError()
    }

    const array = new Uint8Array(3)
    crypto.getRandomValues(array)
    const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    const code = `LZ-${hex}`
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await this.repo.createInvitation(userId, code, expiresAt)

    return {
      invitation_code: code,
      expires_at: expiresAt.toISOString(),
    }
  }
}
