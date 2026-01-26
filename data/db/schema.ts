import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, blob, primaryKey, index } from 'drizzle-orm/sqlite-core'

export interface ProviderKeyMetadata {
    endpoint?: string
    info?: Record<string, any>
}

export const providers = sqliteTable('providers', {
    id: text('id').primaryKey(),
    totalRequest: integer('total_request').notNull().default(0),
    totalTokensInput: integer('total_tokens_input').notNull().default(0),
    totalTokensOutput: integer('total_tokens_output').notNull().default(0)
})

export const providerKeys = sqliteTable('provider_keys', {
    id: integer('id').notNull().primaryKey({ autoIncrement: true }),
    providerKeyId: text('provider_key_id').notNull(),
    key: text('key').notNull().unique(),
    state: text('state', { enum: ['active', 'ratelimited', 'error', 'disabled'] }).notNull().default('active'),
    metadata: blob('metadata', { mode: 'json' }).$type<ProviderKeyMetadata>().default({}),
    totalUsed: integer('total_used').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`)
}, (table) => [
    index('provider_key_id_idx').on(table.providerKeyId),
    index('provider_key_key_idx').on(table.key)
])

export const users = sqliteTable('users', {
    id: integer('id').notNull().primaryKey({ autoIncrement: true }),
    username: text('username'),
    email: text('email'),
    token: text('token').notNull().unique(),
    tier: text('tier', { enum: ['USER', 'ADMIN'] }).notNull().default('USER'),
    restricted: integer('restricted', { mode: 'boolean' }).notNull().default(false),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`)
}, (table) => [
    index('user_token_idx').on(table.token)
])

export const userStats = sqliteTable('user_stats', {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
    input: integer('input').notNull().default(0),
    output: integer('output').notNull().default(0),
    requests: integer('requests').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`)
}, (table) => [
    primaryKey({ columns: [table.userId, table.providerId] }),
    index('user_stats_user_id_idx').on(table.userId),
    index('user_stats_provider_id_idx').on(table.providerId)
])

export const userAllowedProvider = sqliteTable('user_allowed_provider', {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' })
}, (table) => [
    primaryKey({ columns: [table.userId, table.providerId] }),
    index('user_allowed_provider_user_id_idx').on(table.userId),
    index('user_allowed_provider_provider_id_idx').on(table.providerId)
])