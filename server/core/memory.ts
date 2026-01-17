import { CacheableMemory } from 'cacheable'

import type { KeyData } from './database'
import type { ProviderConfig, Provider } from '@/types/provider'

export class MinoMemory {
    Client = new CacheableMemory({ ttl: '10m' })
    Providers: Record<string, Provider> = {}

    async init() {
        await this.loadProvider()
        console.log('memory successfully loaded')
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

    allocatedKey = {
        get: (identity: string, provider: string) => {
            const keyId = `ak|${identity}|${provider}`
            const usedId = `ak_used|${identity}|${provider}`

            const key = this.Client.get<KeyData>(keyId)
            const used = this.Client.get<number>(usedId)

            return { key, used }
        },
        updateKey: (identity: string, provider: string, key: KeyData) => {
            const id = `ak|${identity}|${provider}`
            this.Client.set(id, key)
        },
        incrUsed: (identity: string, provider: string) => {
            const id = `ak_used|${identity}|${provider}`

            const used = this.Client.get<number>(id)
            if (!used) return this.Client.set(id, 1)

            this.Client.set(id, used + 1)
        },
        invalidate: (identity: string, provider: string) => {
            const id = `ak|${identity}|${provider}`
            const usedId = `ak_used|${identity}|${provider}`

            this.Client.delete(id)
            this.Client.delete(usedId)
        }
    }
}