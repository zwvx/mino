import { Elysia } from 'elysia'

import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'

import { ip } from './plugins/cloudflare'
import { identity } from './plugins/identity'
import { matchProvider } from './utils/route'

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
        .all('/x/*', async ({ request, ip, country, identity, status }) => {
            if (!['GET', 'POST'].includes(request.method)) return status(403)

            const pathname = new URL(request.url).pathname
            if (!pathname.startsWith('/x/')) return status(404)

            const slicepath = decodeURIComponent(pathname.slice(3))
            const match = matchProvider(slicepath, Object.keys(Mino.Memory.Providers))
            if (!match) return status(404)

            const provider = Mino.Memory.Providers[match.provider]
            if (!provider) return status(404)

            if (!identity.schema && provider.schema?.[0]) {
                identity.schema = provider.schema[0].id as requestSchema.SchemaType
            }

            if (!identity.schema) return status(400)

            if (provider.require_auth) {
                if (!identity.user) return status(403)

                if (identity.user.tier !== 'ADMIN') {
                    const allowedProviders = await Mino.Database.getUserAllowedProviders(identity.user.id)
                    if (!allowedProviders.find((p) => p.providerId === provider.id)) {
                        return status(403)
                    }
                }
            } else {
                if (identity.user?.tier !== 'ADMIN') {
                    identity.key = `${country}:${ip}`
                }
            }

            if (!identity.key) return status(400)

            const idCon = Mino.Memory.identityConcurrency.get(identity.key)
            if (idCon >= provider.concurrency.identity) return status(429)

            const schemaMap = provider.schema.find((s) => s.id === identity.schema)
            if (!schemaMap) return status(400)

            // todo: limit

            let schema: SchemaRequestType | undefined
            let providerKey: KeyData

            try {
                schema = new requestSchema.default[identity.schema](request.clone())

                // todo: transform headers, token count, validation

                schema.stripHeaders()
                schema.overrideHeaders(provider.override.headers)

                const bodyBuffer = schema.request.body ? await schema.request.arrayBuffer() : null

                let retryCount = 0
                const maxRetryCount = 10

                if (schema.isChatCompletionEndpoint()) {
                    Mino.Memory.identityConcurrency.incr(identity.key)
                }

                while (retryCount < maxRetryCount) {
                    providerKey = await Mino.Database.allocateProviderKey(identity.key, provider.keys_id)
                    schema.setProviderKey(providerKey.key)

                    const endpointType = providerKey.metadata?.endpoint || 'default'
                    const endpoint = (provider.endpoint[endpointType] + schemaMap.upstream_path + match.endpoint).replace(/([^:]\/)\/+/g, '$1')

                    const response = await fetch(endpoint, {
                        method: schema.request.method,
                        headers: schema.request.headers,
                        body: bodyBuffer
                    })

                    if (!response.ok) {
                        let invalidateKey = false

                        if (response.status === 400) {
                            if (providerKey) {
                                Mino.Memory.allocatedKey.incrUsed(identity.key, provider.keys_id)
                            }

                            return new Response(response.body, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            })
                        }

                        if (response.status === 401) {
                            Mino.Database.setProviderKeyState(providerKey.key, 'disabled')
                            invalidateKey = true
                        }

                        if ([402, 429].includes(response.status)) {
                            Mino.Database.setProviderKeyState(providerKey.key, 'ratelimited')
                            invalidateKey = true
                        }

                        if (invalidateKey) {
                            Mino.Memory.allocatedKey.invalidate(identity.key, provider.keys_id)
                        } else {
                            if (providerKey) {
                                Mino.Memory.allocatedKey.incrUsed(identity.key, provider.keys_id)
                            }
                        }

                        retryCount++
                        continue
                    }

                    const respHeaders = new Headers(response.headers)
                    schema.cleanupResponseHeaders(respHeaders)

                    if (providerKey) {
                        Mino.Memory.allocatedKey.incrUsed(identity.key, provider.keys_id)
                    }

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: respHeaders
                    })
                }

                return status(500, schema.errorObject('All given allocated keys are unavailable, try again?', 'api_error'))
            } catch (err) {
                console.error(err)
                return status(500)
            } finally {
                if (schema?.isChatCompletionEndpoint()) {
                    Mino.Memory.identityConcurrency.decr(identity.key)
                }
            }
        })
        .listen(serverPort, () => {
            console.log(`server is online. http://127.0.0.1:${serverPort}`)
        })
}