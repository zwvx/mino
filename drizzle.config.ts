import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'sqlite',
    schema: './data/db/schema.ts',
    dbCredentials: {
        url: './data/db/database.db'
    },
    out: './data/db/migrations'
})
