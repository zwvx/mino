import { Elysia } from 'elysia'

import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'

import { ip } from './plugins/cloudflare'
import { identity } from './plugins/identity'

import * as requestSchema from './schema'
import type { SchemaRequestType } from './schema'

import type { KeyData } from './core/database'

export async function startServer() {
    const serverPort = Number(Bun.env.PORT || (Mino.isProduction ? 30180 : 30181))

    new Elysia()
        .use(ip).use(identity).use(cors()).use(html())
        .onBeforeHandle(({ ip, country, status }) => {
            if (!ip || !country) return status(403)
        })
        .get('/', () => {
            return 'mino.'
        })
        .all('/x/*', async ({ request, ip, identity, status }) => {
            const pathname = new URL(request.url).pathname
            if (!pathname.startsWith('/x/')) return status(404)

            const slicepath = pathname.slice(3)
            const slashIndex = slicepath.indexOf('/')

            const path = {
                provider: decodeURIComponent(slashIndex === -1 ? slicepath : slicepath.slice(0, slashIndex)),
                endpoint: slashIndex === -1 ? '/' : slicepath.slice(slashIndex)
            }

            if (!path.provider) {
                return status(404)
            }

            const provider = Mino.Memory.Providers[path.provider]

            if (!provider) return status(404)
            if (identity.schema === 'unknown') return status(400)

            if (!identity.key) {
                if (provider.require_auth) return status(401)
                identity.key = ip as string
            }

            const schemaMap = provider.schema.find((s) => s.id === identity.schema)
            if (!schemaMap) return status(400)

            // todo: identity, request schema, concurrency

            let schema: SchemaRequestType
            let providerKey: KeyData

            try {
                schema = new requestSchema.default[identity.schema](request.clone())

                providerKey = await Mino.Database.allocateProviderKey(identity.key, provider.keys_id)
                schema.setProviderKey(providerKey.key)

                const endpointType = providerKey.metadata?.endpoint || 'default'
                const endpoint = provider.endpoint[endpointType] + schemaMap.upstream_path + path.endpoint

                // todo: transform headers, token count, validation

                schema.stripHeaders()

                const response = await fetch(endpoint, {
                    method: schema.request.method,
                    headers: schema.request.headers,
                    body: schema.request.body
                })

                const respHeaders = new Headers(response.headers)
                schema.cleanupResponseHeaders(respHeaders)

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: respHeaders
                })
            } catch (err) {
                console.error(err)
                return status(500)
            } finally {
                if (providerKey) {
                    Mino.Memory.allocatedKey.incrUsed(identity.key, provider.keys_id)
                }
            }
        })
        .listen(serverPort, () => {
            console.log(`server is online. http://127.0.0.1:${serverPort}`)
        })
}