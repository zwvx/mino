import { Database } from 'bun:sqlite'

import { and, eq, sql, notInArray } from 'drizzle-orm'
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import * as schema from '@/data/db/schema'

export type KeyData = Awaited<ReturnType<typeof Mino.Database.getRandomProviderKey>>
export type NonNullableKeyData = NonNullable<KeyData>

export class MinoDatabase {
    public db: BunSQLiteDatabase<typeof schema>

    constructor() {
        const sqlite = new Database('data/db/database.db')
        sqlite.run('PRAGMA journal_mode = WAL;')
        this.db = drizzle(sqlite, { schema })
    }

    async init() {
        migrate(this.db, { migrationsFolder: 'data/db/migrations' })

        await this.initializeProvider()

        console.log('database connection initialized')
    }

    async getRandomProviderKey(providerKeyId: string, excludeKeyIds?: string[]) {
        const conditions = [
            eq(schema.providerKeys.providerKeyId, providerKeyId),
            eq(schema.providerKeys.state, 'active')
        ]

        if (excludeKeyIds?.length) {
            conditions.push(notInArray(schema.providerKeys.key, excludeKeyIds))
        }

        return this.db.select()
            .from(schema.providerKeys)
            .where(and(...conditions))
            .orderBy(sql`RANDOM()`)
            .limit(1).get()
    }

    async setProviderKeyState(providerKey: string, state: 'active' | 'ratelimited' | 'error' | 'disabled') {
        await this.db.update(schema.providerKeys)
            .set({ state })
            .where(eq(schema.providerKeys.key, providerKey))

        console.log(`provider key <${providerKey.slice(0, 12)}...> state changed to <${state}>`)
    }

    async initializeProvider() {
        for (const pid in Mino.Memory.Providers) {
            const provider = Mino.Memory.Providers[pid]
            if (!provider || !provider.id) {
                console.error(`provider <${pid}> has no id`)
                continue
            }

            this.db.insert(schema.providers).values({
                id: provider.id
            }).onConflictDoNothing().run()
        }

        console.log(`provider initialized into database`)
    }

    async getUserFromToken(token: string) {
        return this.db.select().from(schema.users).where(eq(schema.users.token, token)).get()
    }

    async getUserAllowedProviders(userId: number) {
        return this.db.select().from(schema.userAllowedProvider).where(eq(schema.userAllowedProvider.userId, userId)).all()
    }

    async incrProviderGeneratedToken(providerId: string, token: number) {
        await this.db.update(schema.providers)
            .set({ totalTokensGenerated: sql`total_tokens_generated + ${token}` })
            .where(eq(schema.providers.id, providerId))
            .run()
    }

    async incrProviderRequest(providerId: string) {
        await this.db.update(schema.providers)
            .set({ totalRequest: sql`total_request + 1` })
            .where(eq(schema.providers.id, providerId))
            .run()
    }
}
