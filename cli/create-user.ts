import cac from 'cac'

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { users } from '@/data/db/schema'

export async function runCreateUser() {
    const cli = cac('create-user')

    cli
        .command('', 'create a user')
        .option('--tier <tier>', 'user tier (USER/ADMIN)', { default: 'USER' })
        .option('--username <username>', 'username')
        .option('--email <email>', 'email')
        .action(async (options: { tier: string, username?: string, email?: string }) => {
            const tier = options.tier.toUpperCase()
            if (!['USER', 'ADMIN'].includes(tier)) {
                console.error('valid tiers: USER, ADMIN')
                process.exit(1)
            }

            const token = crypto.randomUUID()

            const sqlite = new Database('data/db/database.db')
            sqlite.run('PRAGMA journal_mode = WAL;')
            const db = drizzle(sqlite)

            try {
                db.insert(users).values({
                    token,
                    tier: tier as 'USER' | 'ADMIN',
                    username: options.username,
                    email: options.email
                }).run()

                console.log(`token: ${token}`)
                console.log(`tier: ${tier}`)
                
                if (options.username) console.log(`username: ${options.username}`)
                if (options.email) console.log(`email: ${options.email}`)
            } catch (error) {
                console.error('error creating user', error)
                process.exit(1)
            }
        })

    cli.help()
    cli.parse()
}

if (import.meta.main) {
    runCreateUser()
}
