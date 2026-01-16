import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'

export async function runMigrate() {
    console.log("running migrations...")
    const sqlite = new Database('data/db/database.db')
    const db = drizzle(sqlite)

    try {
        migrate(db, { migrationsFolder: 'data/db/migrations' })
        console.log("migrations completed.")
    } catch (error) {
        console.error("migration failed:", error)
        process.exit(1)
    }
}

if (import.meta.main) {
    runMigrate()
}
