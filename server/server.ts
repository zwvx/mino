import { Elysia } from 'elysia'

import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'

import { ip } from './plugins/cloudflare'
import { identity } from './plugins/identity'
import { matchProvider } from './utils/route'

import * as requestSchema from './schema'
import type { SchemaRequestType } from './schema'

import type { NonNullableKeyData } from './core/database'

import { Index } from './views'

import { proxyResponseStream } from './utils/stream'
import { parseDuration, msToHuman } from '@/utils/time'

export async function startServer() {
    const serverPort = Number(Bun.env.PORT || (Mino.isProduction ? 30180 : 30181))

    new Elysia()
        .use(ip).use(identity).use(cors()).use(html())
        .onBeforeHandle(({ ip, country, status }) => {
            if (!ip || !country) return status(403)
        })
        .get('/', () => {
            return Index()
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
            const identityKey = identity.key

            const activeRequests = Mino.Memory.getActiveRequests(identityKey)
            if (activeRequests >= provider.concurrency.identity && identity.user?.tier !== 'ADMIN') {
                return status(429)
            }

            const schemaMap = provider.schema?.find((s) => s.id === identity.schema)
            if (!schemaMap) return status(400)

            let schema: SchemaRequestType | undefined
            let providerKey: NonNullableKeyData
            let requestToken: number = 0
            let isChatCompletion: boolean = false

            let providerCooldown: string = provider.cooldown.default
            let cooldownType: string = 'default'

            let concurrencyIncremented = false
            let allocatedKeyId: string | null = null
            let shouldDeferCleanup = false
            let skipCooldownUpdate = false

            const cleanup = () => {
                if (concurrencyIncremented) {
                    Mino.Memory.decrActiveRequests(identityKey)
                }

                if (allocatedKeyId) {
                    Mino.Memory.decrKeyConcurrency(allocatedKeyId)
                    allocatedKeyId = null
                }

                if (!skipCooldownUpdate) {
                    try {
                        const cooldownDuration = parseDuration(providerCooldown || '0s')
                        Mino.Memory.setCooldown(identityKey, cooldownType, Date.now() + cooldownDuration)
                    } catch (e) {
                        console.error('Failed to parse cooldown', e)
                    }
                }
            }

            try {
                schema = new requestSchema.default[identity.schema](request.clone())

                isChatCompletion = schema.isChatCompletionEndpoint()
                if (isChatCompletion) {
                    providerCooldown = provider.cooldown.chat_completion || provider.cooldown.default
                    cooldownType = 'chat_completion'
                }

                if (identity.user?.tier !== 'ADMIN') {
                    const nextAllowedAt = Mino.Memory.getCooldown(identityKey, cooldownType)
                    const now = Date.now()

                    if (nextAllowedAt > now) {
                        skipCooldownUpdate = true
                        return status(429, schema.errorObject(`Please wait ${msToHuman(nextAllowedAt - now)} before sending another ${isChatCompletion ? 'chat completion' : 'request'}`, 'invalid_request_error', 'cooldown'))
                    }
                }

                // todo: validation, preflight

                schema.stripHeaders()
                schema.overrideHeaders(provider.override.headers)

                const bodyBuffer = schema.request.body ? await schema.request.arrayBuffer() : null

                if (isChatCompletion && bodyBuffer) {
                    requestToken = schema.getRequestToken(bodyBuffer)

                    if (identity.user?.tier !== 'ADMIN') {
                        if (requestToken > provider.limit.payload.input) {
                            return status(400, schema.errorObject(`Token limit exceeded. Maximum ${provider.limit.payload.input} tokens.`, 'invalid_request_error', 'token_limit_exceeded'))
                        }
                    }

                    Mino.Memory.incrActiveRequests(identityKey)
                    concurrencyIncremented = true
                }

                let retryCount = 0
                const maxRetryCount = 10

                while (retryCount < maxRetryCount) {
                    providerKey = await Mino.Memory.allocateKey(identityKey, provider)
                    allocatedKeyId = providerKey.key
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
                        const statusCode = response.status
                        const isRetryable = [401, 402, 429].includes(statusCode) || statusCode >= 500

                        if (!isRetryable) {
                            Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)

                            shouldDeferCleanup = true
                            return proxyResponseStream(new Response(response.body, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            }), cleanup)
                        }

                        if (statusCode === 401) {
                            await Mino.Database.setProviderKeyState(providerKey.key, 'disabled')
                            invalidateKey = true
                        }

                        if ([402, 429].includes(statusCode)) {
                            await Mino.Database.setProviderKeyState(providerKey.key, 'ratelimited')
                            invalidateKey = true
                        }

                        if (invalidateKey) {
                            Mino.Memory.invalidateKey(identityKey, provider.keys_id)
                            Mino.Memory.decrKeyConcurrency(providerKey.key)
                            allocatedKeyId = null
                        } else {
                            Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)
                        }

                        retryCount++
                        continue
                    }

                    const respHeaders = new Headers(response.headers)
                    schema.cleanupResponseHeaders(respHeaders)

                    Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)

                    shouldDeferCleanup = true
                    return proxyResponseStream(new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: respHeaders
                    }), async (res) => {
                        if (schema && schema.isChatCompletionEndpoint()) {
                            // todo: log the chat?
                            const { content, tokenCount } = schema.parseSSEChatResponse(res)

                            const totalToken = requestToken + tokenCount
                            await Mino.Database.incrProviderGeneratedToken(provider.id, totalToken)
                        }

                        await Mino.Database.incrProviderRequest(provider.id)
                        cleanup()
                    })
                }

                return status(500, schema.errorObject('Your allocated keys are currently unavailable. Try again?', 'api_error'))
            } catch (err) {
                console.error(err)
                shouldDeferCleanup = false
                return status(500)
            } finally {
                if (!shouldDeferCleanup) {
                    cleanup()
                }
            }
        })
        .listen(serverPort, () => {
            console.log(`server is online. http://127.0.0.1:${serverPort}`)
        })
}