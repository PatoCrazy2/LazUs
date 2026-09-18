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

// 1. Usuarios
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// 2. Parejas
export const couples = pgTable('couples', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: coupleStatusEnum('status').default('pending').notNull(),
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
export const nfcTags = pgTable('nfc_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  tagIdentifier: varchar('tag_identifier', { length: 128 }).unique().notNull(),
  coupleId: uuid('couple_id').references(() => couples.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  lastTappedAt: timestamp('last_tapped_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// 5. Actividades Diarias
export const dailyActivities = pgTable(
  'daily_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coupleId: uuid('couple_id')
      .references(() => couples.id, { onDelete: 'cascade' })
      .notNull(),
    logicalDate: varchar('logical_date', { length: 10 }).notNull(), // Formato: YYYY-MM-DD
    prompt: text('prompt').notNull(),
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
