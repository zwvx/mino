import type { NonNullableKeyData } from './database'
import type { ProviderConfig, Provider } from '@/types/provider'

import * as ipdaddr from 'ipaddr.js'

interface AllocatedKey {
    key: NonNullableKeyData
    usageCount: number
}

interface ActiveRequest {
    requestId: string
    startedAt: number
    allocatedKeyId: string | null
}

interface IdentitySession {
    activeRequests: Map<string, ActiveRequest>
    cooldowns: Map<string, number>
    allocatedKeys: Map<string, AllocatedKey>
    lastActivity: number
}

type BlockedCIDR = Array<[ipdaddr.IPv4 | ipdaddr.IPv6, number]>

export class MinoMemory {
    Sessions = new Map<string, IdentitySession>()
    KeyConcurrency = new Map<string, { providerKeysId: string; count: number }>()
    Providers: Record<string, Provider> = {}
    ProviderModels = new Map<string, string[]>()
    ProviderModelLatency = new Map<string, Map<string, number[]>>()
    FeatureData = new Map<string, Map<string, any>>()

    recordModelLatency(providerId: string, modelId: string, latency: number) {
        if (!latency || latency <= 0) return

        let providerMap = this.ProviderModelLatency.get(providerId)
        if (!providerMap) {
            providerMap = new Map()
            this.ProviderModelLatency.set(providerId, providerMap)
        }

        let latencies = providerMap.get(modelId)
        if (!latencies) {
            latencies = []
            providerMap.set(modelId, latencies)
        }

        latencies.push(latency)
        if (latencies.length > 50) {
            latencies.shift()
        }
    }

    getModelLatencyStats(providerId: string) {
        const providerMap = this.ProviderModelLatency.get(providerId)
        if (!providerMap) return {}

        const stats: Record<string, { avg: number, min: number, max: number, count: number }> = {}

        for (const [modelId, latencies] of providerMap) {
            if (latencies.length === 0) continue

            const sum = latencies.reduce((a, b) => a + b, 0)
            const avg = Math.round(sum / latencies.length)
            const min = Math.min(...latencies)
            const max = Math.max(...latencies)

            stats[modelId] = { avg, min: Math.round(min), max: Math.round(max), count: latencies.length }
        }

        return stats
    }

    BlockedCIDR: BlockedCIDR = []

    Security = {
        spikeMode: {
            active: false,
            activatedAt: 0,
            expiresAt: 0
        },
        perIpTracking: new Map<string, number[]>(),
        globalTracking: [] as number[],
        verifiedIps: new Map<string, number>()
    }

    private cleanupInterval: Timer | null = null

    async init() {
        await this.loadProvider()

        this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), Mino.Config.memory.cleanup_interval_ms)

        console.log('memory successfully loaded')
    }

    async loadProviderModels(targetProviderId?: string) {
        const MAX_RETRIES = Mino.Config.memory.max_model_fetch_retries

        const entries = targetProviderId
            ? [[targetProviderId, this.Providers[targetProviderId]] as const].filter(([, p]) => p)
            : Object.entries(this.Providers)

        for (const [providerId, provider] of entries) {
            if (!providerId || !provider) {
                console.warn(`invalid providerId or provider, skipping`, providerId, provider)
                continue
            }

            if (!provider.enable) continue

            if (provider.override && provider.override.models.length > 0) {
                let models = provider.override.models as string[]

                if (provider.remap_models) {
                    const reverseMap = Object.fromEntries(
                        Object.entries(provider.remap_models).map(([client, upstream]) => [upstream, client])
                    )
                    models = models.map((id) => reverseMap[id] ?? id)
                }

                this.setProviderModels(providerId, models)
                console.log(`cached ${models.length} models for ${providerId} (override)`)
                continue
            }

            const failedKeys: string[] = []
            let success = false

            for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
                const keyData = await Mino.Database.getRandomProviderKey(provider.keys_id, failedKeys, provider.keys_metadata)
                if (!keyData) {
                    console.warn(`no key available for ${providerId}, skipping model cache`)
                    break
                }

                try {
                    const models = await Mino.Services.fetchProviderModels(provider, keyData.key)
                    this.setProviderModels(providerId, models)

                    console.log(`cached ${models.length} models for ${providerId}`)
                    success = true
                } catch (err) {
                    failedKeys.push(keyData.key)

                    if (attempt < MAX_RETRIES - 1) {
                        console.warn(`attempt ${attempt + 1}/${MAX_RETRIES} failed for ${providerId}, retrying with another key...`)
                    } else {
                        console.error(`failed to cache models for ${providerId} after ${MAX_RETRIES} attempts:`, err)
                    }
                }
            }
        }
    }

    getProviderModels(providerId: string): string[] | undefined {
        return this.ProviderModels.get(providerId)
    }

    setProviderModels(providerId: string, models: string[]): void {
        this.ProviderModels.set(providerId, models)
    }

    setFeatureData(providerId: string, featureId: string, data: any): void {
        let features = this.FeatureData.get(providerId)
        if (!features) {
            features = new Map()
            this.FeatureData.set(providerId, features)
        }
        features.set(featureId, data)
    }

    getFeatureData(providerId: string, featureId: string): any | null {
        return this.FeatureData.get(providerId)?.get(featureId) ?? null
    }

    async loadProvider(name?: string) {
        if (!name) {
            const files = await Array.fromAsync(new Bun.Glob('data/providers/*.yml').scan())
            if (!files.length) return

            const loaded = await Promise.all(
                files.sort().map(async (path) => {
                    const provider = await this.parse(path)
                    this.Providers[provider.id] = provider
                    return provider.id
                })
            )

            this.Providers = Object.fromEntries(
                Object.entries(this.Providers).sort((a, b) => a[1].id.localeCompare(b[1].id))
            )

            console.log(`provider loaded:`, loaded.join(', '))
        } else {
            const path = `data/providers/${name}.yml`
            if (!await Bun.file(path).exists()) {
                throw new Error(`provider ${name} not found`)
            }

            const provider = await this.parse(path)
            this.Providers[provider.id] = provider
            console.log(`provider ${name} loaded`)
        }
    }

    private async parse(path: string) {
        const raw = await Bun.file(path).text()
        const { provider } = Bun.YAML.parse(raw) as ProviderConfig
        return provider
    }

    async loadBlockedCIDR() {
        const files = await Array.fromAsync(new Bun.Glob('data/blocked_cidr/*.txt').scan())
        if (!files.length) return

        for await (const file of files) {
            const cidr = await Bun.file(file).text()

            const ranges = cidr.split('\n')
                .map((l) => l.trim())
                .filter((l) => l && !l.startsWith('#'))

            let count = 0
            for await (const range of ranges) {
                const parsed = ipdaddr.parseCIDR(range)
                if (!parsed) {
                    throw new Error(`failed to parse cidr: ${range}`)
                }

                this.BlockedCIDR.push(parsed)
                count++
            }

            console.log(`loaded blocked cidr ${file}: ${count}`)
        }
    }

    async isSubnetBlocked(ip: string) {
        try {
            const parsed = ipdaddr.parse(ip)
            if (!parsed) {
                throw new Error(`failed to parse ip: ${ip}`)
            }

            const matched = ipdaddr.subnetMatch(parsed, { blocked: this.BlockedCIDR }, 'allowed')
            if (matched && matched === 'blocked') {
                return true
            }

            return false
        } catch (err) {
            throw new Error(`failed to check if subnet is blocked: ${err}`)
        }
    }

    private cleanupStaleSessions() {
        const now = Date.now()
        const staleSessionThreshold = Mino.Config.memory.stale_session_threshold_ms
        const staleRequestThreshold = Mino.Config.memory.stale_request_threshold_ms

        let forcedCleanups = 0

        for (const [identity, session] of this.Sessions) {
            for (const [requestId, request] of session.activeRequests) {
                if (now - request.startedAt > staleRequestThreshold) {
                    console.warn(`\x1b[33m[${identity}] force cleaning stale request ${requestId} (started ${Math.round((now - request.startedAt) / 1000)}s ago)\x1b[0m`)

                    if (request.allocatedKeyId) {
                        this.decrKeyConcurrency(request.allocatedKeyId)
                    }

                    session.activeRequests.delete(requestId)
                    forcedCleanups++
                }
            }

            if (now - session.lastActivity > staleSessionThreshold && session.activeRequests.size === 0) {
                this.Sessions.delete(identity)
            }
        }

        if (forcedCleanups > 0) {
            console.warn(`\x1b[33m[memory] force cleaned ${forcedCleanups} stale request(s)\x1b[0m`)
        }
    }

    getSession(identity: string): IdentitySession | undefined {
        return this.Sessions.get(identity)
    }

    getOrCreateSession(identity: string): IdentitySession {
        let session = this.Sessions.get(identity)
        if (!session) {
            session = {
                activeRequests: new Map(),
                cooldowns: new Map(),
                allocatedKeys: new Map(),
                lastActivity: Date.now()
            }
            this.Sessions.set(identity, session)
        }
        session.lastActivity = Date.now()
        return session
    }

    getActiveRequests(identity: string): number {
        return this.getSession(identity)?.activeRequests.size || 0
    }

    tryRegisterRequest(identity: string, limit: number): string | null {
        const session = this.getOrCreateSession(identity)
        if (session.activeRequests.size >= limit) {
            return null
        }
        const requestId = crypto.randomUUID()
        session.activeRequests.set(requestId, {
            requestId,
            startedAt: Date.now(),
            allocatedKeyId: null
        })
        return requestId
    }

    setRequestAllocatedKey(identity: string, requestId: string, keyId: string): void {
        const request = this.getSession(identity)?.activeRequests.get(requestId)
        if (request) {
            request.allocatedKeyId = keyId
        }
    }

    clearRequestAllocatedKey(identity: string, requestId: string): void {
        const request = this.getSession(identity)?.activeRequests.get(requestId)
        if (request) {
            request.allocatedKeyId = null
        }
    }

    unregisterRequest(identity: string, requestId: string): number {
        const session = this.getSession(identity)
        if (!session) return 0
        session.activeRequests.delete(requestId)
        return session.activeRequests.size
    }

    getCooldown(identity: string, type: string = 'default'): number {
        return this.getSession(identity)?.cooldowns.get(type) || 0
    }

    setCooldown(identity: string, type: string, expiresAt: number): void {
        this.getOrCreateSession(identity).cooldowns.set(type, expiresAt)
    }

    getAllocatedKey(identity: string, providerKeysId: string): AllocatedKey | undefined {
        return this.getSession(identity)?.allocatedKeys.get(providerKeysId)
    }

    setAllocatedKey(identity: string, providerKeysId: string, key: NonNullableKeyData): void {
        this.getOrCreateSession(identity).allocatedKeys.set(providerKeysId, {
            key,
            usageCount: 0
        })
    }

    incrKeyUsage(identity: string, providerKeysId: string): void {
        const allocated = this.getAllocatedKey(identity, providerKeysId)
        if (allocated) allocated.usageCount++
    }

    invalidateKey(identity: string, providerKeysId: string): void {
        this.getSession(identity)?.allocatedKeys.delete(providerKeysId)
    }

    getKeyConcurrency(keyId: string): number {
        return this.KeyConcurrency.get(keyId)?.count || 0
    }

    incrKeyConcurrency(keyId: string, providerKeysId: string): number {
        const existing = this.KeyConcurrency.get(keyId)
        if (existing) {
            existing.count++
            return existing.count
        }
        this.KeyConcurrency.set(keyId, { providerKeysId, count: 1 })
        return 1
    }

    decrKeyConcurrency(keyId: string): number {
        const existing = this.KeyConcurrency.get(keyId)
        if (!existing) return 0
        if (existing.count <= 1) {
            this.KeyConcurrency.delete(keyId)
            return 0
        }
        existing.count--
        return existing.count
    }

    getSaturatedKeyIds(providerKeysId: string, maxConcurrency: number): string[] {
        const saturated: string[] = []
        for (const [keyId, data] of this.KeyConcurrency) {
            if (data.providerKeysId === providerKeysId && data.count >= maxConcurrency) {
                saturated.push(keyId)
            }
        }
        return saturated
    }

    async allocateKey(identity: string, provider: Provider): Promise<NonNullableKeyData> {
        const providerKeysId = provider.keys_id
        const maxUsage = provider.concurrency.keys.max_usage_same_key
        const sameKeyConcurrency = provider.concurrency.keys.same_key

        if (maxUsage > 1) {
            const existing = this.getAllocatedKey(identity, providerKeysId)
            if (existing?.key && existing.usageCount < maxUsage) {
                console.log(`re-using allocated key for <${identity}> to <${existing.key.key.slice(0, 12)}...> (${existing.usageCount + 1}/${maxUsage})`)
                return existing.key
            }
        }

        const saturatedKeys = this.getSaturatedKeyIds(providerKeysId, sameKeyConcurrency)
        console.debug(`[allocateKey] provider=${provider.id}, keysId=${providerKeysId}, sameKeyConcurrency=${sameKeyConcurrency}, saturatedKeys=[${saturatedKeys.map(k => `${k.slice(0, 8)}...(${this.getKeyConcurrency(k)})`).join(', ')}]`)
        const keyData = await Mino.Database.getRandomProviderKey(providerKeysId, saturatedKeys, provider.keys_metadata)
        if (!keyData) {
            console.error(`[allocateKey] all keys saturated. KeyConcurrency dump:`)
            for (const [keyId, data] of this.KeyConcurrency) {
                if (data.providerKeysId === providerKeysId) {
                    console.error(`  - ${keyId.slice(0, 12)}...: count=${data.count}`)
                }
            }
            throw new Error(`no key available for <${provider.id}>`)
        }

        this.setAllocatedKey(identity, providerKeysId, keyData)
        this.incrKeyConcurrency(keyData.key, providerKeysId)

        if (maxUsage > 1) {
            console.log(`allocated key for <${identity}> to <${keyData.key.slice(0, 12)}...>`)
        }

        return keyData
    }

    async checkAllProviders() {
        const checkedProviderKeyId: string[] = []
        for await (const provider of Object.values(this.Providers)) {
            if (checkedProviderKeyId.includes(provider.keys_id)) {
                console.log(`provider key id <${provider.keys_id}> (${provider.id}) has already been checked. skipping`)
                continue
            }

            await Mino.Services.checkProviderKeys(provider)
            checkedProviderKeyId.push(provider.keys_id)
        }
    }

    async getTotalActiveRequests() {
        let count = 0
        for await (const session of this.Sessions.values()) {
            count += session.activeRequests.size
        }
        return count
    }
}