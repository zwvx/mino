import { Database } from 'bun:sqlite'

import { and, eq, sql, notInArray } from 'drizzle-orm'
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import * as schema from '@/data/db/schema'

import { calcSpentPerScale } from '@/utils/math'

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

    async setProviderKeyState(providerKey: string, state: 'active' | 'ratelimited' | 'error' | 'disabled', log = true) {
        await this.db.update(schema.providerKeys)
            .set({
                state,
                updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(eq(schema.providerKeys.key, providerKey))

        if (log) {
            console.log(`provider key <${providerKey.slice(0, 12)}...> state changed to <${state}>`)
        }
    }

    async setProviderKeyMetadata(providerKey: string, metadata: schema.ProviderKeyMetadata) {
        await this.db.update(schema.providerKeys)
            .set({ metadata })
            .where(eq(schema.providerKeys.key, providerKey))
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

    async incrProviderTokens(providerId: string, inputTokens: number, outputTokens: number) {
        await this.db.update(schema.providers)
            .set({
                totalTokensInput: sql`total_tokens_input + ${inputTokens}`,
                totalTokensOutput: sql`total_tokens_output + ${outputTokens}`
            })
            .where(eq(schema.providers.id, providerId))
            .run()
    }

    async incrProviderRequest(providerId: string) {
        await this.db.update(schema.providers)
            .set({ totalRequest: sql`total_request + 1` })
            .where(eq(schema.providers.id, providerId))
            .run()
    }

    async getProviderKeysByState(providerKeyId: string, state: 'active' | 'ratelimited' | 'error' | 'disabled') {
        return this.db.select()
            .from(schema.providerKeys)
            .where(and(
                eq(schema.providerKeys.providerKeyId, providerKeyId),
                eq(schema.providerKeys.state, state)
            )).all()
    }

    async pruneDisabledKeys() {
        await this.db.delete(schema.providerKeys)
            .where(eq(schema.providerKeys.state, 'disabled'))
            .run()
    }

    async deleteProviderKey(providerKeyId: string, key: string) {
        await this.db.delete(schema.providerKeys)
            .where(and(
                eq(schema.providerKeys.providerKeyId, providerKeyId),
                eq(schema.providerKeys.key, key)
            ))
            .run()
    }

    async getProviderInfo() {
        const providers = Object.fromEntries(Object.entries(Mino.Memory.Providers).filter(([pid, provider]) => provider.enable && !provider.hidden))
        const providerInfos: Record<string, any>[] = []

        for (const [pid, provider] of Object.entries(providers)) {
            const providerInfo = await this.db.select().from(schema.providers).where(eq(schema.providers.id, pid)).get()
            if (!providerInfo) {
                console.error(`provider <${pid}> not found in database`)
                continue
            }

            const totalKeys = await this.db.select({ id: schema.providerKeys.id }).from(schema.providerKeys).where(and(
                eq(schema.providerKeys.providerKeyId, provider.keys_id),
                eq(schema.providerKeys.state, 'active')
            )).all()

            const totalInputSpent = calcSpentPerScale(providerInfo.totalTokensInput, provider.pricing.input.value, provider.pricing.input.token_scale)
            const totalOutputSpent = calcSpentPerScale(providerInfo.totalTokensOutput, provider.pricing.output.value, provider.pricing.output.token_scale)

            const usFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
            const totalSpent = usFormat.format(totalInputSpent + totalOutputSpent)

            providerInfos.push({
                keys: {
                    id: `keys:${pid}`,
                    value: totalKeys.length.toString()
                },
                spent: {
                    id: `spent:${pid}`,
                    value: totalSpent
                }
            })
        }

        return providerInfos
    }
}
