import { Elysia } from 'elysia'
import type { SchemaType } from '../schema'

type Identity = {
    schema: SchemaType | null
    key: string | null
    user: Awaited<ReturnType<typeof Mino.Database.getUserFromToken>> | null
}

export const identity = (app: Elysia) =>
    app.derive(async ({ path, headers, query }) => {
        const res: Identity = {
            schema: null,
            key: null,
            user: null
        }

        if (headers['authorization']) {
            res.schema = 'openai'
            res.key = headers['authorization'].replace('Bearer ', '').trim() || null
        }

        // vague check
        if (headers['x-api-key']) {
            res.schema = 'anthropic'
            res.key = headers['x-api-key']
        }

        if (headers['x-goog-api-key'] || (path.includes('/v1beta') && query['key'])) {
            res.schema = 'gemini'
            res.key = headers['x-goog-api-key'] || query['key']!
        }

        if (res.key) {
            const userToken = await Mino.Database.getUserFromToken(res.key)
            if (userToken) {
                res.user = userToken
            }
        }

        return { identity: res }
    })
