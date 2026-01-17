import { Database } from 'bun:sqlite'

import { and, eq, sql } from 'drizzle-orm'
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import * as schema from '@/data/db/schema'

export type KeyData = Awaited<ReturnType<typeof Mino.Database.getRandomProviderKey>>

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

    async getUserToken(token: string) {
        return this.db.select().from(schema.users).where(eq(schema.users.token, token)).get()
    }

    async getRandomProviderKey(providerKeyId: string) {
        return this.db.select()
            .from(schema.providerKeys)
            .where(and(
                eq(schema.providerKeys.providerKeyId, providerKeyId),
                eq(schema.providerKeys.state, 'active')
            ))
            .orderBy(sql`RANDOM()`)
            .limit(1).get()
    }

    async allocateProviderKey(identity: string, providerKeyId: string) {
        const provider = Mino.Memory.Providers[providerKeyId]
        if (!provider) {
            throw new Error(`provider <${providerKeyId}> not found`)
        }

        if (provider.concurrency.keys.max_usage_same_key > 1) {
            const key = Mino.Memory.allocatedKey.get(identity, providerKeyId)
            if (key && key.key && key.used) {
                const maxUsage = provider.concurrency.keys.max_usage_same_key
                if (key.used < maxUsage) {
                    // Mino.Memory.allocatedKey.incrUsed(identity, providerKeyId)
                    console.log(`re-using allocated key for <${identity}> to <${key.key.key.slice(0, 12)}...> (${key.used + 1}/${maxUsage})`)
                    return key.key
                }
            }
        }

        const keyData = await this.getRandomProviderKey(providerKeyId)

        if (!keyData) {
            throw new Error(`no key available for <${providerKeyId}>`)
        }

        Mino.Memory.allocatedKey.updateKey(identity, keyData.providerKeyId, keyData)
        // Mino.Memory.allocatedKey.incrUsed(identity, keyData.providerKeyId)

        console.log(`allocated key for <${identity}> to <${keyData.key.slice(0, 12)}...>`)
        return keyData
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
}
