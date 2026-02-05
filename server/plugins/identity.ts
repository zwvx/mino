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

        if (headers['x-api-key'] || headers['anthropic-version']) {
            res.schema = 'anthropic'
            res.key = headers['x-api-key'] || null
        } else if (headers['x-goog-api-key']) {
            res.schema = 'gemini'
            res.key = headers['x-goog-api-key']
        }

        if (!res.schema) {
            if (path.endsWith('/messages')) {
                res.schema = 'anthropic'
            } else if (path.includes(':generateContent') || path.includes(':streamGenerateContent')) {
                res.schema = 'gemini'
            }
        }

        if (!res.schema && headers['authorization']) {
            const authKey = headers['authorization'].replace('Bearer ', '').trim()

            if (path.includes('/anthropic')) {
                res.schema = 'anthropic'
                if (!res.key) res.key = authKey
            } else if (
                path.includes('/chat/completions') ||
                path.includes('/completions') ||
                path.includes('/embeddings') ||
                path.includes('/models')
            ) {
                res.schema = 'openai'
                res.key = authKey
            } else {
                res.schema = 'openai'
                res.key = authKey
            }
        }

        if (!res.schema && query['key']) {
            if (path.includes('/v1') || path.includes('/v1beta')) {
                res.schema = 'gemini'
                res.key = query['key']!
            }
        }

        if (res.schema === 'anthropic' && !res.key && headers['authorization']) {
            res.key = headers['authorization'].replace('Bearer ', '').trim()
        }
        if (res.schema === 'gemini' && !res.key && query['key']) {
            res.key = query['key']!
        }

        if (res.key) {
            const userToken = await Mino.Database.getUserFromToken(res.key)
            if (userToken) {
                res.user = userToken
            }
        }

        return { identity: res }
    })
