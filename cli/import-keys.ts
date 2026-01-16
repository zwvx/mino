import cac from 'cac'

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { providerKeys } from '@/data/db/schema'

export async function runImport() {
    const cli = cac('import-keys')

    cli
        .command('<file>', 'key file')
        .option('--provider <id>', 'provider key id')
        .action(async (file: string, options: { provider?: string }) => {
            if (!options.provider) {
                console.error('error: --provider <id>')
                process.exit(1)
            }

            try {
                const fileRef = Bun.file(file)

                if (!(await fileRef.exists())) {
                    console.error(`file not found: ${file}`)
                    process.exit(1)
                }

                const text = await fileRef.text()
                const lines = text.split('\n')

                console.log(`parsing ${lines.length} lines`)

                const sqlite = new Database('data/db/database.db')
                sqlite.run('PRAGMA journal_mode = WAL;')
                const db = drizzle(sqlite)

                let imported = 0
                let duplicates = 0
                let errors = 0

                for (const line of lines) {
                    if (!line.trim()) continue

                    const parts = line.split('|').map(s => s.trim())
                    const key = parts[0]

                    if (!key) continue

                    try {
                        const result = db.insert(providerKeys).values({
                            providerKeyId: options.provider,
                            key: key
                        }).onConflictDoNothing().run()

                        if ((result as any).changes > 0) {
                            imported++
                        } else {
                            duplicates++
                        }
                    } catch (err) {
                        console.error(`error inserting key: ${key}`)
                        errors++
                    }
                }

                console.log(`import done. imported: ${imported}, duplicates: ${duplicates}, errors: ${errors}`)

            } catch (e) {
                console.error('unexpected error', e)
                process.exit(1)
            }
        })

    cli.help()
    cli.parse()
}

if (import.meta.main) {
    runImport()
}
