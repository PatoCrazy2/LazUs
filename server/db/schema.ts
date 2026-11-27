import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// Enums de Dominio
export const coupleStatusEnum = pgEnum('couple_status', ['pending', 'active', 'paused', 'archived'])
export const activityStatusEnum = pgEnum('activity_status', ['pending', 'revealed'])
export const memberRoleEnum = pgEnum('member_role', ['partner_a', 'partner_b'])
export const tokenTypeEnum = pgEnum('auth_token_type', ['email_verification', 'password_reset'])
export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
])
export const activityCategoryEnum = pgEnum('activity_category', [
  'getting_to_know',
  'memories',
  'future',
  'gratitude',
  'life_values',
  'music',
  'romance',
  'play',
  'together_irl',
  'daily_checkin',
])
export const activityToneEnum = pgEnum('activity_tone', ['light', 'playful', 'tender', 'deep'])
export const activityOccasionEnum = pgEnum('activity_occasion', [
  'daily',
  'special_date',
  'long_distance',
])
export const activityResponseTypeEnum = pgEnum('activity_response_type', [
  'text_only',
  'choice',
  'scale',
  'prediction',
  'music',
  'photo_only',
  'both',
  'voice',
])
export const weeklyCollageStatusEnum = pgEnum('weekly_collage_status', ['ready', 'rendered'])

// 1. Usuarios
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  googleId: varchar('google_id', { length: 255 }).unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// 2. Parejas
export const couples = pgTable('couples', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: coupleStatusEnum('status').default('pending').notNull(),
  timezone: varchar('timezone', { length: 64 }).default('America/Mexico_City').notNull(),
  maxRomanceIntensity: integer('max_romance_intensity').default(2).notNull(),
  anniversaryDate: timestamp('anniversary_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// 3. Miembros de Pareja (Exactamente 2 por pareja)
export const coupleMembers = pgTable(
  'couple_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coupleId: uuid('couple_id')
      .references(() => couples.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: memberRoleEnum('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('idx_couple_user').on(t.coupleId, t.userId),
    uniqueIndex('idx_user_active_membership').on(t.userId),
  ]
)

// 4. Tags NFC Físicos
export const nfcTags = pgTable(
  'nfc_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tagIdentifier: varchar('tag_identifier', { length: 128 }).unique().notNull(),
    coupleId: uuid('couple_id').references(() => couples.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    lastTappedAt: timestamp('last_tapped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_nfc_tags_owner').on(t.ownerUserId),
    index('idx_nfc_tags_couple').on(t.coupleId),
  ]
)

// 4b. Invitaciones Digitales de Respaldo
export const coupleInvitations = pgTable(
  'couple_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inviterUserId: uuid('inviter_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    coupleId: uuid('couple_id')
      .references(() => couples.id, { onDelete: 'cascade' }),
    invitationCode: varchar('invitation_code', { length: 64 }).unique().notNull(),
    status: invitationStatusEnum('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedByUserId: uuid('accepted_by_user_id')
      .references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_couple_invitations_code').on(t.invitationCode),
    index('idx_couple_invitations_inviter').on(t.inviterUserId),
  ]
)

// 4c. Catálogo Curado de Actividades (3 Ejes: Tema, Tono, Ocasión)
export const activityPrompts = pgTable(
  'activity_prompts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 100 }).unique().notNull(),
    prompt: text('prompt').notNull(),
    category: activityCategoryEnum('category').notNull(),
    tone: activityToneEnum('tone').default('light').notNull(),
    occasion: activityOccasionEnum('occasion').default('daily').notNull(),
    intensity: integer('intensity').default(1).notNull(), // 1=suave, 2=medio, 3=intenso
    responseType: activityResponseTypeEnum('response_type').default('text_only').notNull(),
    promptConfig: jsonb('prompt_config'),
    specialDate: varchar('special_date', { length: 16 }), // Ej: '02-14', '12-25', 'anniversary'
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_activity_prompts_special_date').on(t.specialDate),
    index('idx_activity_prompts_category').on(t.category),
  ]
)

// 5. Actividades Diarias
export const dailyActivities = pgTable(
  'daily_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coupleId: uuid('couple_id')
      .references(() => couples.id, { onDelete: 'cascade' })
      .notNull(),
    promptId: uuid('prompt_id').references(() => activityPrompts.id, { onDelete: 'set null' }),
    logicalDate: varchar('logical_date', { length: 10 }).notNull(), // Formato: YYYY-MM-DD
    prompt: text('prompt').notNull(),
    category: activityCategoryEnum('category').default('getting_to_know').notNull(),
    tone: activityToneEnum('tone').default('light').notNull(),
    occasion: activityOccasionEnum('occasion').default('daily').notNull(),
    responseType: activityResponseTypeEnum('response_type').default('text_only').notNull(),
    promptConfig: jsonb('prompt_config'),
    status: activityStatusEnum('status').default('pending').notNull(),
    revealedAt: timestamp('revealed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('idx_couple_logical_date').on(t.coupleId, t.logicalDate),
    index('idx_couple_activity_status').on(t.coupleId, t.status),
  ]
)

// 6. Respuestas / Submissions (Sujetas a la regla del Blind Reveal)
export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    activityId: uuid('activity_id')
      .references(() => dailyActivities.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content'),
    mediaKey: varchar('media_key', { length: 512 }),
    payload: jsonb('payload'),
    completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('idx_user_activity_submission').on(t.activityId, t.userId),
  ]
)

// 7. Eventos de Afecto (Toques rápidos NFC / hápticos)
export const affectionEvents = pgTable('affection_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  coupleId: uuid('couple_id')
    .references(() => couples.id, { onDelete: 'cascade' })
    .notNull(),
  senderUserId: uuid('sender_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  eventType: varchar('event_type', { length: 64 }).default('heart_tap').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// 8. Llaves de Idempotencia (Garantía de tolerancia a fallos y reintentos del outbox)
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: uuid('key').primaryKey(), // client_mutation_id (UUIDv4)
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    operationType: varchar('operation_type', { length: 64 }).notNull(),
    responseCode: integer('response_code').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_idempotency_user').on(t.userId),
  ]
)

// 9. Sesiones
export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // SHA-256(raw_session_token)
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_sessions_user_id').on(t.userId),
    index('idx_sessions_expires_at').on(t.expiresAt),
  ]
)

// 10. Rate Limiting (Soporta claves 'ip:login:email', 'email:login:<email>', 'ip:register', 'ip:resend')
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identifier: varchar('identifier', { length: 255 }).unique().notNull(),
    attemptCount: integer('attempt_count').default(1).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_login_attempts_locked_until').on(t.lockedUntil),
  ]
)

// 11. Tokens de Autenticación
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(), // SHA-256
    type: tokenTypeEnum('type').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_auth_tokens_hash').on(t.tokenHash),
    index('idx_auth_tokens_user').on(t.userId),
  ]
)

// 12. Collages Semanales ("Nuestros Momentos")
export const weeklyCollages = pgTable(
  'weekly_collages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coupleId: uuid('couple_id')
      .references(() => couples.id, { onDelete: 'cascade' })
      .notNull(),
    weekStartDate: varchar('week_start_date', { length: 10 }).notNull(), // YYYY-MM-DD (Lunes)
    weekEndDate: varchar('week_end_date', { length: 10 }).notNull(), // YYYY-MM-DD (Domingo)
    status: weeklyCollageStatusEnum('status').default('ready').notNull(),
    mediaKey: varchar('media_key', { length: 512 }),
    highlights: jsonb('highlights').default([]).notNull(),
    activitiesCount: integer('activities_count').default(0).notNull(),
    renderedAt: timestamp('rendered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('idx_weekly_collages_couple_week').on(t.coupleId, t.weekStartDate),
    index('idx_weekly_collages_couple_created').on(t.coupleId, t.createdAt),
  ]
)

// 13. Suscripciones Web Push (Por dispositivo)
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    endpoint: text('endpoint').unique().notNull(),
    p256dh: varchar('p256dh', { length: 255 }).notNull(),
    auth: varchar('auth', { length: 128 }).notNull(),
    userAgent: varchar('user_agent', { length: 255 }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_push_subscriptions_user').on(t.userId)]
)
