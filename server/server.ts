import { Elysia } from 'elysia'
import { performance as perf } from 'perf_hooks'

import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'

import { ip } from './plugins/cloudflare'
import { identity } from './plugins/identity'
import { matchProvider } from './utils/route'
import { checkRequestSpike } from './security/request-spike'

import * as requestSchema from './schema'
import type { SchemaRequestType } from './schema'

import type { NonNullableKeyData } from './core/database'

import { Index } from './views'

import { proxyResponseStream, interceptFirstChunk } from './utils/stream'
import { parseDuration, msToHuman } from '@/utils/time'
import type { ResponseValidator } from '@/modules/scripts/response_validation/types'

export async function startServer() {
    const serverPort = Number(Bun.env.PORT || (Mino.isProduction ? 30180 : 30181))

    new Elysia()
        .use(ip).use(identity).use(cors()).use(html())
        .onBeforeHandle(({ ip, country, status }) => {
            if (!ip || !country) return status(403)
        })
        .get('/', async () => {
            return await Index()
        })
        .all('/x/*', async ({ request, ip, country, identity, status }) => {
            const requestStart = perf.now()

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
            let cleanupCalled = false

            const cleanup = () => {
                if (cleanupCalled) return
                cleanupCalled = true

                console.log(`[${identityKey}] [${identity.schema}] ${pathname} took ${(perf.now() - requestStart).toFixed(2)}ms`)

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

            const handleResponseComplete = async (responseContent: string) => {
                if (schema && isChatCompletion) {
                    // todo: log the chat?
                    const { content, tokenCount } = schema.parseSSEChatResponse(responseContent)

                    const totalToken = requestToken + tokenCount
                    await Mino.Database.incrProviderGeneratedToken(provider.id, totalToken)
                }
                await Mino.Database.incrProviderRequest(provider.id)
                cleanup()
            }

            try {
                schema = new requestSchema.default[identity.schema](request.clone())

                if (checkRequestSpike(ip!)) {
                    return status(429, schema.errorObject(`Mino is currently under high load. Visit "/verify/v1" to verify your IP.`, 'invalid_request_error', 'under_attack'))
                }

                isChatCompletion = schema.isChatCompletionEndpoint()
                if (isChatCompletion) {
                    providerCooldown = provider.cooldown.chat_completion || provider.cooldown.default
                    cooldownType = 'chat_completion'
                }

                if (schema.isModelListEndpoint()) {
                    const models = Mino.Memory.getProviderModels(provider.id)
                    if (!models) return status(503)
                    return status(200, schema.getObjectModels(models))
                }

                if (identity.user?.tier !== 'ADMIN') {
                    const nextAllowedAt = Mino.Memory.getCooldown(identityKey, cooldownType)
                    const now = Date.now()

                    if (nextAllowedAt > now) {
                        skipCooldownUpdate = true
                        return status(429, schema.errorObject(`Please wait ${msToHuman(nextAllowedAt - now)} before sending another ${isChatCompletion ? 'chat completion' : 'request'}`, 'invalid_request_error', 'cooldown'))
                    }
                }

                // todo: preflight

                schema.stripHeaders()
                schema.overrideHeaders(provider.override.headers)

                const bodyBuffer = schema.request.body ? await schema.request.arrayBuffer() : null

                if (isChatCompletion && bodyBuffer) {
                    const tokenResult = schema.getRequestToken(bodyBuffer)

                    if (tokenResult === null) {
                        return status(400, schema.errorObject('Invalid request body. Expected valid JSON with messages array.', 'invalid_request_error', 'invalid_body'))
                    }

                    requestToken = tokenResult

                    if (identity.user?.tier !== 'ADMIN') {
                        if (requestToken > provider.limit.payload.input) {
                            return status(400, schema.errorObject(`Token limit exceeded. Maximum ${provider.limit.payload.input} tokens.`, 'invalid_request_error', 'token_limit_exceeded'))
                        }
                    }

                    Mino.Memory.incrActiveRequests(identityKey)
                    concurrencyIncremented = true

                    console.log(`[${identityKey}] [${identity.schema}] [${provider.id}] chat completion request. input tokens: ${requestToken.toLocaleString()}`)
                }

                let retryCount = 0
                const maxRetryCount = 10

                while (retryCount < maxRetryCount) {
                    providerKey = await Mino.Memory.allocateKey(identityKey, provider)
                    allocatedKeyId = providerKey.key
                    schema.setProviderKey(providerKey.key)

                    const endpointType = providerKey.metadata?.endpoint || 'default'
                    const baseUrl = schemaMap.base ?? provider.endpoint[endpointType]
                    const endpoint = (baseUrl + schemaMap.upstream_path + match.endpoint).replace(/([^:]\/)\/+/g, '$1')

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
                            if (!provider.concurrency.keys.key_stay_active) {
                                await Mino.Database.setProviderKeyState(providerKey.key, 'disabled')
                            }
                            invalidateKey = true
                        }

                        if ([402, 429].includes(statusCode)) {
                            if (!provider.concurrency.keys.key_stay_active) {
                                await Mino.Database.setProviderKeyState(providerKey.key, 'ratelimited')
                            }
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

                    if (provider.scripts?.response_validation) {
                        let validator: ResponseValidator | null = null
                        try {
                            const mod = await import(`@/modules/scripts/response_validation/${provider.scripts.response_validation}`)
                            validator = mod.default as ResponseValidator
                        } catch { }

                        if (validator) {
                            const intercepted = await interceptFirstChunk(response)
                            if (intercepted) {
                                const validationResult = validator(intercepted.firstChunk)

                                if (!validationResult.valid) {
                                    if (!provider.concurrency.keys.key_stay_active) {
                                        if (validationResult.keyState === 'disabled') {
                                            await Mino.Database.setProviderKeyState(providerKey.key, 'disabled')
                                        } else if (validationResult.keyState === 'ratelimited') {
                                            await Mino.Database.setProviderKeyState(providerKey.key, 'ratelimited')
                                        }
                                    }

                                    if (validationResult.retryable) {
                                        Mino.Memory.invalidateKey(identityKey, provider.keys_id)
                                        Mino.Memory.decrKeyConcurrency(providerKey.key)
                                        allocatedKeyId = null
                                        retryCount++
                                        continue
                                    }

                                    return status(
                                        validationResult.statusCode || 500,
                                        schema.errorObject(
                                            validationResult.errorMessage || 'Provider error',
                                            'api_error'
                                        )
                                    )
                                }

                                Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)

                                shouldDeferCleanup = true
                                return proxyResponseStream(new Response(intercepted.createStream(), {
                                    status: response.status,
                                    statusText: response.statusText,
                                    headers: respHeaders
                                }), (res) => handleResponseComplete(intercepted.firstChunk + res))
                            }
                        }
                    }

                    Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)

                    shouldDeferCleanup = true
                    return proxyResponseStream(new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: respHeaders
                    }), handleResponseComplete)
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