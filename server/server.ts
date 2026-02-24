import { Elysia } from 'elysia'
import { performance as perf } from 'perf_hooks'

import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { marked } from 'marked'

import { ip } from './plugins/cloudflare'
import { identity } from './plugins/identity'
import { matchProvider } from './utils/route'
import { checkRequestSpike, markIpVerified, isIpVerified, isSpikeMode } from './security/request-spike'
import { checkBanHeaders } from './security/ban-requests'

import * as requestSchema from './schema'
import type { SchemaRequestType } from './schema'

import type { NonNullableKeyData } from './core/database'

import { Index } from './views'
import { Verify } from './views/verify'
import { FallbackView } from './views/fallback'
import { ProviderView } from './views/provider'

import { proxyResponseStream, interceptFirstChunk } from './utils/stream'
import { saveImageFromResponse, cleanupTempImages, sanitize, getOrCreateThumbnail } from './utils/image-store'
import { parseDuration, msToHuman } from '@/utils/time'
import type { ResponseValidator } from '@/modules/scripts/response_validation/types'
import type { ErrorValidator } from '@/modules/scripts/error_validation/types'
import type { ProviderPreflight } from '@/modules/scripts/request_preflight/base'

import type { EndpointType } from '@/types/endpoint-types'
import { resolveEndpointType, getHandler, EndpointHandler } from './handlers'

export function wsObject(type: string, data: Record<string, any>) {
    return { type, data }
}

import { Logger } from './utils/logger'

class CursorData {
    private static data = new Map<string, { x: number, y: number, color: string }>()
    static wsClients = new Map<string, { clientId: string, color: string, ip: string }>()
    private static ipCounts = new Map<string, number>()
    private static readonly MAX_CURSORS_PER_IP = 2

    private static readonly colors = [
        '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80',
        '#2dd4bf', '#22d3ee', '#60a5fa', '#a78bfa', '#e879f9'
    ] as const

    static generateColor(): string {
        return this.colors[Math.floor(Math.random() * this.colors.length)] as string
    }

    static canAddCursor(ip: string): boolean {
        const count = this.ipCounts.get(ip) || 0
        return count < this.MAX_CURSORS_PER_IP
    }

    static incrIp(ip: string) {
        this.ipCounts.set(ip, (this.ipCounts.get(ip) || 0) + 1)
    }

    static decrIp(ip: string) {
        const count = this.ipCounts.get(ip) || 0
        if (count <= 1) {
            this.ipCounts.delete(ip)
        } else {
            this.ipCounts.set(ip, count - 1)
        }
    }

    static set(clientId: string, x: number, y: number, color: string) {
        this.data.set(clientId, { x, y, color })
    }

    static get(clientId: string) {
        return this.data.get(clientId)
    }

    static remove(clientId: string) {
        this.data.delete(clientId)
    }

    static getAll() {
        return Array.from(this.data.entries()).map(([clientId, data]) => ({
            clientId,
            ...data
        }))
    }
}

class MotdManager {
    static currentHtml: string | null = null
    static currentCrc: number = 0
    static lastCheck: number = 0

    static async init() {
        await this.check(true)
    }

    static async check(force = false) {
        try {
            const file = Bun.file('data/motd.md')
            if (!await file.exists()) return

            const buffer = await file.arrayBuffer()
            const crc = Bun.hash.crc32(buffer)

            if (force || crc !== this.currentCrc) {
                this.currentCrc = crc
                const text = await new Response(buffer).text()
                this.currentHtml = await marked.parse(text, { async: true, breaks: true })

                Logger.info(`[MOTD] updated hash=${crc}`)
                return true
            }
        } catch (err) {
            Logger.error('[MOTD] failed to check update:', err)
        }
        return false
    }
}

export async function startServer() {
    const serverPort = Number(Bun.env.PORT || Mino.isProduction ? Mino.Config.server.port : Mino.Config.server.port + 1)

    const instance = new Elysia()
        .use(ip).use(identity).use(cors()).use(html())
        .onBeforeHandle(({ ip, country, status, request }) => {
            if (!ip || !country) {
                console.warn(`a request was made without an IP or country code: ${ip}, ${country}, ${request.method}, ${request.url}`)
                return status(403, 'Invalid IP or country code')
            }

            if (!request.url.includes('/x/')) {
                Logger.info(`[${country}:${ip}] [${request.method}] ${request.url}`)
            }
        })
        .get('/', async () => {
            return await Index()
        })
        .get('/verify', async ({ ip }) => {
            if (ip && isIpVerified(ip)) {
                return Response.redirect('/', 302)
            }
            return await Verify()
        })
        .post('/verify', async ({ request, ip, status }) => {
            if (!isSpikeMode()) {
                return { success: true }
            }

            const body = await request.json().catch(() => null) as { token?: string } | null
            if (!body?.token) {
                if (ip && isIpVerified(ip)) {
                    return { success: true }
                }
                return status(400, { success: false, error: 'missing token' })
            }

            const secretKey = Mino.isProduction
                ? Mino.Config.cloudflare.turnstile.secret_key
                : '1x0000000000000000000000000000000AA'

            const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: secretKey,
                    response: body.token,
                    remoteip: ip
                })
            })

            const result = await response.json() as { success: boolean }
            if (result.success) {
                markIpVerified(ip!)
                Logger.info(`[${ip}] IP verified`)
                return { success: true }
            }

            return status(400, { success: false, error: 'verification failed' })
        })
        .get('/gallery/:provider/:filename', async ({ params, request, status }) => {
            const { provider, filename } = params
            if (!filename.startsWith(sanitize(provider) + '_')) return status(403)

            const file = Bun.file(`temp/${filename}`)
            if (!await file.exists()) return status(404)

            const etag = `"${Bun.hash.crc32(await file.arrayBuffer()).toString(16)}"`
            if (request.headers.get('if-none-match') === etag) return status(304)

            return new Response(file, {
                headers: {
                    'Content-Type': file.type,
                    'Cache-Control': 'public, max-age=86400, immutable',
                    'ETag': etag
                }
            })
        })
        .get('/gallery/:provider/thumb/:filename', async ({ params, request, status }) => {
            const { provider, filename } = params
            if (!filename.startsWith(sanitize(provider) + '_')) return status(403)

            const thumb = await getOrCreateThumbnail(filename)
            if (!thumb) return status(404)

            const etag = `"${Bun.hash.crc32(thumb).toString(16)}"`
            if (request.headers.get('if-none-match') === etag) return status(304)

            return new Response(thumb as unknown as BodyInit, {
                headers: {
                    'Content-Type': 'image/webp',
                    'Cache-Control': 'public, max-age=86400, immutable',
                    'ETag': etag
                }
            })
        })
        .all('/x/*', async ({ request, ip, country, identity, status }) => {
            const requestStart = perf.now()

            if (request.method === 'OPTIONS') return status(204)
            if (!['GET', 'POST'].includes(request.method)) return status(403, 'Invalid request method')

            const pathname = new URL(request.url).pathname
            if (!pathname.startsWith('/x/')) return status(404)

            const slicepath = decodeURIComponent(pathname.slice(3))
            const match = matchProvider(slicepath, Object.keys(Mino.Memory.Providers))
            if (!match) return status(404)

            const provider = Mino.Memory.Providers[match.provider]
            if (!provider) return status(404)

            if (provider.override?.path) {
                const normalizedEndpoint = match.endpoint.replace(/\/+/g, '/')
                const pathOverride = provider.override.path.find((p) => p.path === normalizedEndpoint)
                if (pathOverride) {
                    return status(pathOverride.status)
                }
            }

            if (match.endpoint === '/' || pathname === `/x/${match.provider}`) {
                Logger.entry(`${country}:${ip}`, request.method, provider.id, match.endpoint)
                if (provider.page) {
                    return ProviderView({ provider })
                }
                return FallbackView()
            }

            if (!identity.schema && provider.schema?.[0]) {
                identity.schema = provider.schema[0].id as requestSchema.SchemaType
            }

            if (!identity.schema) return status(400)

            if (provider.require_auth) {
                if (!identity.user) {
                    console.warn(`[${country}:${ip}] invalid authentication.`)
                    return status(403, 'Invalid authentication')
                }

                if (identity.user.tier !== 'ADMIN') {
                    const allowedProviders = await Mino.Database.getUserAllowedProviders(identity.user.id)
                    if (!allowedProviders.find((p) => p.providerId === provider.id)) {
                        console.warn(`[${country}:${ip}] User token <${identity.user.id}> is trying to access provider <${provider.id}> without permission.`)
                        return status(403, 'User token is not allowed for this provider')
                    }
                }
            } else {
                if (identity.user?.tier !== 'ADMIN') {
                    identity.key = `${country}:${ip}`
                }
            }

            if (!identity.key) return status(400)
            const identityKey = identity.key

            const schemaMap = provider.schema?.find((s) => s.id === identity.schema)
            if (!schemaMap) return status(400)

            let schema: SchemaRequestType | undefined
            let providerKey: NonNullableKeyData
            let requestToken: number = 0
            let endpointType: EndpointType = 'passthrough'
            let handler: EndpointHandler | undefined
            let outputTokens: number = 0
            let requestModelId: string | null = null

            let providerCooldown: string = provider.cooldown.default
            let cooldownType: string = 'default'

            let concurrencyIncremented = false
            let registeredRequestId: string | null = null
            let allocatedKeyId: string | null = null
            let shouldDeferCleanup = false
            let skipCooldownUpdate = false
            let cleanupCalled = false

            const unregisterRequestNow = () => {
                if (cleanupCalled) return
                cleanupCalled = true

                const activeBeforeCleanup = Mino.Memory.getActiveRequests(identityKey)

                if (registeredRequestId) {
                    if (allocatedKeyId) {
                        Mino.Memory.clearRequestAllocatedKey(identityKey, registeredRequestId)
                        Mino.Memory.decrKeyConcurrency(allocatedKeyId)
                        allocatedKeyId = null
                    }

                    const afterUnregister = Mino.Memory.unregisterRequest(identityKey, registeredRequestId)
                    Logger.debugKey(identityKey, `unregistered request ${registeredRequestId}, activeRequests: ${activeBeforeCleanup} -> ${afterUnregister}`)
                    registeredRequestId = null
                } else {
                    if (allocatedKeyId) {
                        Mino.Memory.decrKeyConcurrency(allocatedKeyId)
                        allocatedKeyId = null
                    }
                }
            }

            const cleanup = async () => {
                unregisterRequestNow()

                if (!skipCooldownUpdate) {
                    try {
                        const cooldownDuration = parseDuration(providerCooldown || '0s')
                        Mino.Memory.setCooldown(identityKey, cooldownType, Date.now() + cooldownDuration)
                    } catch (e) {
                        Logger.error('Failed to parse cooldown', e)
                    }
                }

                if (handler?.trackUnits) {
                    Logger.completion(identityKey, identity.schema!, pathname, `${(perf.now() - requestStart).toFixed(2)}ms`, outputTokens)

                    try {
                        instance.server?.publish('provider.info', JSON.stringify(
                            wsObject('active.session', { value: await Mino.Memory.getTotalActiveRequests() })
                        ))
                    } catch { }
                } else if (handler && handler.type !== 'passthrough') {
                    Logger.completion(identityKey, identity.schema!, pathname, `${(perf.now() - requestStart).toFixed(2)}ms`)
                } else {
                    Logger.completionSimple(identityKey, identity.schema!, pathname, `${(perf.now() - requestStart).toFixed(2)}ms`)
                }
            }

            const handleResponseComplete = async (responseContent: string) => {
                try {
                    if (handler?.trackUnits) {
                        const { content, units } = handler.parseResponse(responseContent)
                        outputTokens = units

                        await Mino.Database.incrProviderTokens(provider.id, requestToken, units)

                        try {
                            instance.server?.publish('provider.info', JSON.stringify(
                                wsObject('total.tokens', { value: await Mino.Database.getTotalProviderTokens() })
                            ))
                        } catch { }
                    }
                    await Mino.Database.incrProviderRequest(provider.id)

                    if (requestModelId) {
                        Mino.Memory.recordModelLatency(provider.id, requestModelId, perf.now() - requestStart)
                    }

                    if (endpointType === 'image_generation') {
                        saveImageFromResponse(responseContent, provider.id, requestModelId ?? 'unknown').catch(() => { })
                    }
                } catch (err) {
                    Logger.fail(identityKey, 'error in handleResponseComplete:', err)
                } finally {
                    cleanup()
                }
            }

            try {
                schema = new requestSchema.default[identity.schema](request.clone())

                if (checkRequestSpike(ip!)) {
                    Logger.spike(identityKey)
                    return status(429, schema.errorObject(`Mino is currently under high load. Visit "/verify" to verify your IP.`, 'invalid_request_error', 'under_attack'))
                }

                const banResult = checkBanHeaders(request.headers)
                if (banResult.banned) {
                    Logger.warnKey(identityKey, `banned by header rule: ${banResult.rule}`)
                    return status(403, schema.errorObject(`Request from ${banResult.rule} is not allowed.`, 'invalid_request_error', 'request_banned'))
                }

                endpointType = resolveEndpointType(match.endpoint, provider.endpoint_types, schema)
                handler = getHandler(endpointType, schema)
                providerCooldown = provider.cooldown[endpointType] || provider.cooldown.default
                cooldownType = endpointType

                if (schema.isModelListEndpoint()) {
                    const models = Mino.Memory.getProviderModels(provider.id)
                    if (!models) return status(503, schema.errorObject(`Failed to retrieve models from provider.`, 'server_error', 'provider_unavailable'))
                    return status(200, schema.getObjectModels(models))
                }

                if (identity.user?.tier !== 'ADMIN') {
                    registeredRequestId = Mino.Memory.tryRegisterRequest(identityKey, provider.concurrency.identity)
                    if (!registeredRequestId) {
                        const activeRequests = Mino.Memory.getActiveRequests(identityKey)
                        Logger.warnKey(identityKey, `concurrency limit reached (${activeRequests}/${provider.concurrency.identity})`)
                        return status(429, schema.errorObject(`Identity concurrency exceeded. Maximum ${provider.concurrency.identity} requests at a time.`, 'invalid_request_error', 'concurrency_limit_exceeded'))
                    }
                    concurrencyIncremented = true
                    const activeAfter = Mino.Memory.getActiveRequests(identityKey)
                    Logger.debugKey(identityKey, `registered request ${registeredRequestId}, activeRequests now: ${activeAfter}`)
                }

                if (identity.user?.tier !== 'ADMIN') {
                    const nextAllowedAt = Mino.Memory.getCooldown(identityKey, cooldownType)
                    const now = Date.now()

                    if (nextAllowedAt > now) {
                        skipCooldownUpdate = true
                        Logger.warnKey(identityKey, `cooldown request: ${msToHuman(nextAllowedAt - now)}`)
                        return status(429, schema.errorObject(`Please wait ${msToHuman(nextAllowedAt - now)} before sending another ${endpointType === 'chat_completion' ? 'chat completion' : 'request'}`, 'invalid_request_error', 'cooldown'))
                    }
                }

                if (provider.override.strip_mode === 'minimal') {
                    schema.stripHeadersMinimal(provider.override.headers)
                } else {
                    schema.stripHeaders()
                }
                schema.overrideHeaders(provider.override.headers)

                let bodyBuffer: ArrayBuffer | null = null
                if (schema.request.body) {
                    try {
                        bodyBuffer = await Promise.race([
                            schema.request.arrayBuffer(),
                            new Promise<ArrayBuffer>((_, reject) => setTimeout(() => reject(new Error('Request body timeout')), 60000))
                        ])
                    } catch (err) {
                        Logger.warnKey(identityKey, 'failed to read request body:', err)
                        return status(408, schema.errorObject('Request body timeout', 'timeout'))
                    }
                }

                if (provider.scripts?.preflight && bodyBuffer) {
                    try {
                        const mod = await import(`@/modules/scripts/request_preflight/${provider.scripts.preflight}`)
                        const PreflightClass = mod.default as new () => ProviderPreflight
                        const preflight = new PreflightClass()

                        if (preflight.init) {
                            await preflight.init()
                        }

                        bodyBuffer = preflight.processBuffer(bodyBuffer, identity.schema!)
                        Logger.debugKey(identityKey, `applied preflight: ${preflight.name}`)
                    } catch (err) {
                        Logger.warnKey(identityKey, 'preflight script error:', err)
                    }
                }

                if (handler?.validateModel && bodyBuffer) {
                    const modelId = handler.getModelId(bodyBuffer)
                    if (modelId) {
                        requestModelId = modelId
                        const models = Mino.Memory.getProviderModels(provider.id)
                        if (models && !models.includes(modelId) && identity.user?.tier !== 'ADMIN') {
                            Logger.warnKey(identityKey, `tried to use model "${modelId}" but it is not allowed or not found.`)
                            return status(400, schema.errorObject(`Model "${modelId}" is not allowed or not found. ${models ? `Allowed models: ${models.map(model => `"${model}"`).join(', ')}` : ''}`, 'invalid_request_error', 'model_not_found'))
                        }

                        const upstreamModelId = provider.remap_models?.[modelId] ?? modelId
                        if (upstreamModelId !== modelId) {
                            bodyBuffer = handler.rewriteModel(bodyBuffer, upstreamModelId)
                            Logger.debugKey(identityKey, `remapped model "${modelId}" to "${upstreamModelId}"`)
                        }
                    } else {
                        return status(400, schema.errorObject('Model not specified.', 'invalid_request_error', 'model_not_specified'))
                    }
                }

                if (handler?.trackUnits && bodyBuffer) {
                    const tokenResult = handler.getInputUnits(bodyBuffer)

                    if (tokenResult === 0) {
                        Logger.warnKey(identityKey, `sends invalid request body for ${endpointType}.`)
                        return status(400, schema.errorObject('Invalid request body.', 'invalid_request_error', 'invalid_body'))
                    }

                    requestToken = tokenResult

                    if (identity.user?.tier !== 'ADMIN') {
                        if (requestToken > provider.limit.payload.input) {
                            Logger.warnKey(identityKey, `sends too many tokens. ${requestToken.toLocaleString()} > ${provider.limit.payload.input.toLocaleString()}`)
                            return status(400, schema.errorObject(`Token limit exceeded. Maximum ${provider.limit.payload.input.toLocaleString()} tokens. ${requestToken.toLocaleString()} tokens sent.`, 'invalid_request_error', 'token_limit_exceeded'))
                        }

                        const maxTokens = handler.getMaxOutputUnits(bodyBuffer)
                        if (maxTokens && maxTokens > provider.limit.payload.output) {
                            Logger.warnKey(identityKey, `requests too many output tokens. ${maxTokens.toLocaleString()} > ${provider.limit.payload.output.toLocaleString()}`)
                            return status(400, schema.errorObject(`Output token limit exceeded. Maximum ${provider.limit.payload.output.toLocaleString()} tokens. ${maxTokens.toLocaleString()} tokens requested.`, 'invalid_request_error', 'token_limit_exceeded'))
                        }
                    }

                    const modelId = handler.getModelId(bodyBuffer)
                    Logger.entry(identityKey, identity.schema, provider.id, modelId ?? 'unknown', `${endpointType} request. input tokens: ${requestToken.toLocaleString()}`)

                    try {
                        instance.server?.publish('provider.info', JSON.stringify(
                            wsObject('active.session', { value: await Mino.Memory.getTotalActiveRequests() })
                        ))
                    } catch { }
                } else if (handler && bodyBuffer) {
                    const modelId = handler.getModelId(bodyBuffer)
                    Logger.entry(identityKey, identity.schema!, provider.id, modelId ?? 'unknown', `${endpointType} request`)
                }

                let retryCount = 0
                const maxRetryCount = Mino.Config.server.max_retry_count

                while (retryCount < maxRetryCount) {
                    if (allocatedKeyId) {
                        Mino.Memory.decrKeyConcurrency(allocatedKeyId)
                        if (registeredRequestId) {
                            Mino.Memory.clearRequestAllocatedKey(identityKey, registeredRequestId)
                        }
                        allocatedKeyId = null
                    }

                    providerKey = await Mino.Memory.allocateKey(identityKey, provider)
                    allocatedKeyId = providerKey.key
                    if (registeredRequestId) {
                        Mino.Memory.setRequestAllocatedKey(identityKey, registeredRequestId, providerKey.key)
                    }
                    schema.setProviderKey(providerKey.key)

                    const endpointType = providerKey.metadata?.endpoint || 'default'
                    const baseUrl = schemaMap.base ?? provider.endpoint[endpointType]
                    const upstreamPath = schemaMap.upstream_path

                    const stripPath = schemaMap.strip_path ?? upstreamPath
                    const hasStripPrefix = stripPath && (
                        match.endpoint === stripPath ||
                        match.endpoint.startsWith(stripPath + '/')
                    )

                    const cleanEndpoint = hasStripPrefix
                        ? match.endpoint.slice(stripPath.length)
                        : match.endpoint

                    const urlFn = new URL(request.url)
                    const searchParams = schema.distillQuery(urlFn.searchParams)
                    const searchString = searchParams.toString()

                    let endpoint = (baseUrl + upstreamPath + cleanEndpoint).replace(/([^:]\/)\/+/g, '$1')
                    if (searchString) {
                        endpoint += (endpoint.includes('?') ? '&' : '?') + searchString
                    }

                    const timeoutSignal = AbortSignal.timeout(180_000) // 3 minutes
                    const signal = AbortSignal.any([request.signal, timeoutSignal])

                    const response = await fetch(endpoint, {
                        method: schema.request.method,
                        headers: schema.request.headers,
                        body: bodyBuffer,
                        signal
                    })

                    if (!response.ok) {
                        let invalidateKey = false
                        const statusCode = response.status
                        const isRetryable = [401, 402, 403, 429].includes(statusCode) || statusCode >= 500

                        const errorBody = await response.text().catch(() => '')

                        if (provider.scripts?.error_validation) {
                            let errorValidator: ErrorValidator | null = null
                            try {
                                const mod = await import(`@/modules/scripts/error_validation/${provider.scripts.error_validation}`)
                                errorValidator = mod.default as ErrorValidator
                            } catch { }

                            if (errorValidator) {
                                const result = errorValidator(statusCode, errorBody)

                                if (result.handled) {
                                    if (result.invalidateKey) {
                                        if (!provider.concurrency.keys.key_stay_active) {
                                            await Mino.Database.setProviderKeyState(providerKey.key, result.keyState, { source: 'request:error_validation', providerId: provider.id })
                                        }
                                        Mino.Memory.invalidateKey(identityKey, provider.keys_id)
                                        Mino.Memory.decrKeyConcurrency(providerKey.key)
                                        if (registeredRequestId) {
                                            Mino.Memory.clearRequestAllocatedKey(identityKey, registeredRequestId)
                                        }
                                        allocatedKeyId = null
                                    } else {
                                        Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)
                                    }

                                    if (result.retryable) {
                                        retryCount++
                                        Logger.retry(identityKey, retryCount, maxRetryCount)
                                        continue
                                    }

                                    return status(
                                        result.statusCode || statusCode,
                                        schema.errorObject(
                                            result.errorMessage || 'Provider error',
                                            'api_error'
                                        )
                                    )
                                }
                            }
                        }

                        if (!isRetryable) {
                            Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)

                            Logger.fail(identityKey, `[${provider.id}] non-retryable error ${statusCode}`, errorBody)

                            const isHtml = response.headers.get('content-type')?.includes('text/html') || errorBody.trim().startsWith('<')
                            if (isHtml) {
                                return status(statusCode, schema.errorObject('Provider upstream error', 'api_error'))
                            }

                            shouldDeferCleanup = true
                            return proxyResponseStream(new Response(errorBody, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            }), cleanup, { signal: request.signal })
                        }

                        if (statusCode >= 500) {
                            Logger.warnKey(identityKey, `[${provider.id}] upstream error ${statusCode}`, errorBody.slice(0, 500))
                        }

                        if ([401, 403].includes(statusCode)) {
                            Logger.fail(identityKey, `key <${providerKey.key.slice(0, 12)}...> unauthorized (${statusCode})`)
                            if (!provider.concurrency.keys.key_stay_active) {
                                await Mino.Database.setProviderKeyState(providerKey.key, 'disabled', { source: 'request', providerId: provider.id })
                            }
                            invalidateKey = true
                        }

                        if ([402, 429].includes(statusCode)) {
                            Logger.warnKey(identityKey, `key <${providerKey.key.slice(0, 12)}...> ratelimited (${statusCode})`)
                            if (!provider.concurrency.keys.key_stay_active) {
                                await Mino.Database.setProviderKeyState(providerKey.key, 'ratelimited', { source: 'request', providerId: provider.id })
                            }
                            invalidateKey = true
                        }

                        if (invalidateKey) {
                            Mino.Memory.invalidateKey(identityKey, provider.keys_id)
                            Mino.Memory.decrKeyConcurrency(providerKey.key)
                            if (registeredRequestId) {
                                Mino.Memory.clearRequestAllocatedKey(identityKey, registeredRequestId)
                            }
                            allocatedKeyId = null
                        } else {
                            Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)
                        }

                        retryCount++
                        Logger.retry(identityKey, retryCount, maxRetryCount)
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
                                            await Mino.Database.setProviderKeyState(providerKey.key, 'disabled', { source: 'request:response_validation', providerId: provider.id })
                                        } else if (validationResult.keyState === 'ratelimited') {
                                            await Mino.Database.setProviderKeyState(providerKey.key, 'ratelimited', { source: 'request:response_validation', providerId: provider.id })
                                        }
                                    }

                                    if (validationResult.retryable) {
                                        Mino.Memory.invalidateKey(identityKey, provider.keys_id)
                                        Mino.Memory.decrKeyConcurrency(providerKey.key)
                                        if (registeredRequestId) {
                                            Mino.Memory.clearRequestAllocatedKey(identityKey, registeredRequestId)
                                        }
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
                                }), (res) => handleResponseComplete(intercepted.firstChunk + res), { signal: request.signal })
                            } else {
                                Mino.Memory.decrKeyConcurrency(providerKey.key)
                                if (registeredRequestId) {
                                    Mino.Memory.clearRequestAllocatedKey(identityKey, registeredRequestId)
                                }
                                allocatedKeyId = null
                                retryCount++
                                continue
                            }
                        }
                    }

                    Mino.Memory.incrKeyUsage(identityKey, provider.keys_id)

                    shouldDeferCleanup = true
                    return proxyResponseStream(new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: respHeaders
                    }), handleResponseComplete, { signal: request.signal })
                }

                Logger.fail(identityKey, `max retries exceeded (${maxRetryCount}), all keys unavailable`)
                return status(500, schema.errorObject('Your allocated keys are currently unavailable. Try again?', 'api_error'))
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    Logger.warnKey(identityKey, 'client disconnected, request aborted')
                    shouldDeferCleanup = false
                    return
                }

                Logger.error(`[${identityKey}] uncaught error:`, err)
                shouldDeferCleanup = false
                return status(500)
            } finally {
                if (!shouldDeferCleanup) {
                    cleanup()
                }
            }
        })
        .group('/admin', (admin) => admin
            .onBeforeHandle(async ({ headers, status }) => {
                const token = headers['authorization']?.replace('Bearer ', '').trim()
                if (!token) return status(401, { error: 'Authorization required' })

                const user = await Mino.Database.getUserFromToken(token)
                if (!user || user.tier !== 'ADMIN') return status(403, { error: 'Admin access required' })
            })
            .post('/provider/reload', async ({ body, status }) => {
                try {
                    const { provider } = (body as { provider?: string }) ?? {}

                    const snapshotPageFields = (p: typeof Mino.Memory.Providers[string]) => ({
                        hidden: p.hidden,
                        enable: p.enable,
                        require_auth: p.require_auth,
                        schema_ids: p.schema?.map((s) => s.id).join(',') ?? ''
                    })

                    const before = new Map<string, ReturnType<typeof snapshotPageFields>>()
                    if (provider) {
                        const existing = Mino.Memory.Providers[provider]
                        if (existing) before.set(provider, snapshotPageFields(existing))
                    } else {
                        for (const [id, p] of Object.entries(Mino.Memory.Providers)) {
                            before.set(id, snapshotPageFields(p))
                        }
                    }

                    if (provider) {
                        await Mino.Memory.loadProvider(provider)
                        await Mino.Memory.loadProviderModels(provider)
                    } else {
                        await Mino.Memory.loadProvider()
                        await Mino.Memory.loadProviderModels()
                    }

                    let needsRefresh = false
                    const afterProviders = provider
                        ? { [provider]: Mino.Memory.Providers[provider] }
                        : Mino.Memory.Providers

                    const allIds = new Set([...before.keys(), ...Object.keys(afterProviders)])
                    for (const id of allIds) {
                        const old = before.get(id)
                        const cur = afterProviders[id]
                        if (!old || !cur) { needsRefresh = true; break }

                        const after = snapshotPageFields(cur)
                        if (old.hidden !== after.hidden ||
                            old.enable !== after.enable ||
                            old.require_auth !== after.require_auth ||
                            old.schema_ids !== after.schema_ids) {
                            needsRefresh = true
                            break
                        }
                    }

                    if (needsRefresh) {
                        Mino.Session = Math.random().toString(36).slice(2)
                        instance.server?.publish('provider.info', JSON.stringify(
                            wsObject('init', { session: Mino.Session })
                        ))
                        Logger.info(`[Admin] session refreshed, clients will reload`)
                    }

                    const reloaded = provider ? [provider] : Object.keys(Mino.Memory.Providers)
                    Logger.info(`[Admin] reloaded provider: ${reloaded.join(', ')}`)
                    return { success: true, providers: reloaded, refreshed: needsRefresh }
                } catch (err) {
                    Logger.error('[Admin] reload failed:', err)
                    return status(500, { error: err instanceof Error ? err.message : 'Unknown error' })
                }
            })
        )
        .ws('/mino', {
            open: async (ws) => {
                const ip = ws.data?.ip as string || 'unknown'

                if (!CursorData.canAddCursor(ip)) {
                    ws.subscribe('provider.info')
                    ws.subscribe('cursor')
                    ws.send(wsObject('init', { session: Mino.Session }))
                    ws.send(wsObject('cursor.init', { clientId: null, color: null }))
                    ws.send(wsObject('cursor.list', CursorData.getAll()))
                    ws.send(wsObject('provider.info', await Mino.Database.getProviderInfo()))
                    ws.send(wsObject('active.session', { value: await Mino.Memory.getTotalActiveRequests() }))
                    ws.send(wsObject('total.tokens', { value: await Mino.Database.getTotalProviderTokens() }))
                    if (MotdManager.currentHtml) {
                        ws.send(wsObject('motd.update', { html: MotdManager.currentHtml }))
                    }
                    return
                }

                const clientId = crypto.randomUUID()
                const color = CursorData.generateColor()
                const wsId = ws.id

                CursorData.wsClients.set(wsId, { clientId, color, ip })
                CursorData.incrIp(ip)
                ws.subscribe('provider.info')
                ws.subscribe('cursor')

                ws.send(wsObject('init', { session: Mino.Session }))
                ws.send(wsObject('cursor.init', { clientId, color }))
                ws.send(wsObject('cursor.list', CursorData.getAll()))
                ws.send(wsObject('provider.info', await Mino.Database.getProviderInfo()))
                ws.send(wsObject('active.session', { value: await Mino.Memory.getTotalActiveRequests() }))
                ws.send(wsObject('total.tokens', { value: await Mino.Database.getTotalProviderTokens() }))
                if (MotdManager.currentHtml) {
                    ws.send(wsObject('motd.update', { html: MotdManager.currentHtml }))
                }
            },
            message: async (ws, message) => {
                try {
                    const payload = typeof message === 'string' ? JSON.parse(message) : message
                    if (!payload.type || !payload.data) return

                    const client = CursorData.wsClients.get(ws.id)
                    if (!client) return

                    if (payload.type === 'cursor.move') {
                        const { x, y } = payload.data

                        CursorData.set(client.clientId, x, y, client.color)

                        instance.server?.publish('cursor', JSON.stringify(
                            wsObject('cursor.update', { clientId: client.clientId, x, y, color: client.color })
                        ))
                    }

                    if (payload.type === 'cursor.click') {
                        const { x, y } = payload.data

                        instance.server?.publish('cursor', JSON.stringify(
                            wsObject('cursor.click', { clientId: client.clientId, x, y, color: client.color })
                        ))
                    }
                } catch { }
            },
            close(ws) {
                const client = CursorData.wsClients.get(ws.id)
                if (client) {
                    CursorData.remove(client.clientId)
                    CursorData.wsClients.delete(ws.id)
                    CursorData.decrIp(client.ip)
                    instance.server?.publish('cursor', JSON.stringify(
                        wsObject('cursor.remove', { clientId: client.clientId })
                    ))
                }
                ws.unsubscribe('provider.info')
                ws.unsubscribe('cursor')
            }
        })

    instance.listen(serverPort, () => {
        Logger.info(`server is online. http://127.0.0.1:${serverPort}`)
    })

    await MotdManager.init()

    setInterval(async () => {
        if (await MotdManager.check()) {
            instance.server?.publish('provider.info', JSON.stringify(
                wsObject('motd.update', { html: MotdManager.currentHtml })
            ))
        }
    }, 5000)

    setInterval(() => {
        cleanupTempImages(24 * 60 * 60 * 1000).catch(() => { })
    }, 60 * 60 * 1000)

    return instance
}