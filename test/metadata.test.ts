import { describe, expect, test, beforeEach } from "bun:test"
import { MinoDatabase } from "../server/core/database"

import * as schema from '@/data/db/schema'

describe("MinoDatabase Metadata Filtering", () => {
    let db: MinoDatabase
    const providerKeyId = "test-provider"

    beforeEach(async () => {
        db = new MinoDatabase(":memory:")

        db.db.run(sql`
            CREATE TABLE IF NOT EXISTS provider_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider_key_id TEXT NOT NULL,
                key TEXT NOT NULL UNIQUE,
                state TEXT NOT NULL DEFAULT 'active',
                metadata BLOB,
                total_used INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
            );
        `)

        await db.db.insert(schema.providerKeys).values([
            {
                providerKeyId,
                key: "key-tier-1",
                state: "active",
                metadata: { info: { tier: "Tier 1" } }
            },
            {
                providerKeyId,
                key: "key-tier-2",
                state: "active",
                metadata: { info: { tier: "Tier 2" } }
            },
            {
                providerKeyId,
                key: "key-no-metadata",
                state: "active",
                metadata: {}
            },
            {
                providerKeyId,
                key: "key-other-provider",
                state: "active",
                metadata: { info: { tier: "Tier 1" } }
            }
        ])
    })

    test("should filter keys by metadata", async () => {
        const key = await db.getRandomProviderKey(providerKeyId, [], [{ key: "tier", value: "Tier 1" }])
        expect(key).not.toBeUndefined()
        expect(["key-tier-1", "key-other-provider"]).toContain(key!.key)
    })

    test("should return undefined if no key matches metadata", async () => {
        const key = await db.getRandomProviderKey(providerKeyId, [], [{ key: "tier", value: "Tier 3" }])
        expect(key).toBeUndefined()
    })

    test("should match key with no metadata filter", async () => {
        const key = await db.getRandomProviderKey(providerKeyId)
        expect(key).not.toBeUndefined()
        expect(["key-tier-1", "key-tier-2", "key-no-metadata", "key-other-provider"]).toContain(key!.key)
    })

    test("should respect excludeKeyIds along with metadata filter", async () => {
        const key = await db.getRandomProviderKey(providerKeyId, ["key-tier-1", "key-other-provider"], [{ key: "tier", value: "Tier 1" }])
        expect(key).toBeUndefined()
    })
})

function sql(strings: TemplateStringsArray) {
    return strings.join("")
}
