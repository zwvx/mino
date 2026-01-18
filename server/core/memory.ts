import type { NonNullableKeyData } from './database'
import type { ProviderConfig, Provider } from '@/types/provider'

interface AllocatedKey {
    key: NonNullableKeyData
    usageCount: number
}

interface IdentitySession {
    activeRequests: number
    cooldowns: Map<string, number>
    allocatedKeys: Map<string, AllocatedKey>
    lastActivity: number
}

export class MinoMemory {
    Sessions = new Map<string, IdentitySession>()
    KeyConcurrency = new Map<string, { providerKeysId: string; count: number }>()
    Providers: Record<string, Provider> = {}
    ProviderModels = new Map<string, string[]>()

    private cleanupInterval: Timer | null = null

    async init() {
        await this.loadProvider()

        this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 60_000)

        console.log('memory successfully loaded')
    }

    async loadProviderModels() {
        for (const [providerId, provider] of Object.entries(this.Providers)) {
            if (!provider.enable) continue

            try {
                const keyData = await Mino.Database.getRandomProviderKey(provider.keys_id, [])
                if (!keyData) {
                    console.warn(`no key available for ${providerId}, skipping model cache`)
                    continue
                }

                const models = await Mino.Services.fetchProviderModels(provider, keyData.key)
                this.setProviderModels(providerId, models)

                console.log(`cached ${models.length} models for ${providerId}`)
            } catch (err) {
                console.error(`failed to cache models for ${providerId}:`, err)
            }
        }
    }

    getProviderModels(providerId: string): string[] | undefined {
        return this.ProviderModels.get(providerId)
    }

    setProviderModels(providerId: string, models: string[]): void {
        this.ProviderModels.set(providerId, models)
    }

    async loadProvider(name?: string) {
        if (!name) {
            const files = await Array.fromAsync(new Bun.Glob('data/providers/*.yml').scan())
            if (!files.length) return

            const loaded = await Promise.all(
                files.map(async (path) => {
                    const provider = await this.parse(path)
                    this.Providers[provider.id] = provider
                    return provider.id
                })
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

    private cleanupStaleSessions() {
        const now = Date.now()
        const staleThreshold = 10 * 60 * 1000

        for (const [identity, session] of this.Sessions) {
            if (now - session.lastActivity > staleThreshold && session.activeRequests === 0) {
                this.Sessions.delete(identity)
            }
        }
    }

    getSession(identity: string): IdentitySession | undefined {
        return this.Sessions.get(identity)
    }

    getOrCreateSession(identity: string): IdentitySession {
        let session = this.Sessions.get(identity)
        if (!session) {
            session = {
                activeRequests: 0,
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
        return this.getSession(identity)?.activeRequests || 0
    }

    incrActiveRequests(identity: string): number {
        const session = this.getOrCreateSession(identity)
        session.activeRequests++
        return session.activeRequests
    }

    decrActiveRequests(identity: string): number {
        const session = this.getSession(identity)
        if (!session) return 0
        if (session.activeRequests > 0) session.activeRequests--
        return session.activeRequests
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
        const keyData = await Mino.Database.getRandomProviderKey(providerKeysId, saturatedKeys)
        if (!keyData) {
            throw new Error(`no key available for <${provider.id}>`)
        }

        this.setAllocatedKey(identity, providerKeysId, keyData)
        this.incrKeyConcurrency(keyData.key, providerKeysId)

        if (maxUsage > 1) {
            console.log(`allocated key for <${identity}> to <${keyData.key.slice(0, 12)}...>`)
        }

        return keyData
    }
}