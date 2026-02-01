import tailwind from 'bun-plugin-tailwind'

import { MinoMemory } from './core/memory'
import { MinoDatabase } from './core/database'
import { MinoServices } from './core/services'

import { startServer, wsObject } from './server'
import { extendConsoleLog } from '@/utils/logging'

import * as config from '@/data/config.yml'

export class Mino {
    readonly Session = Math.random().toString(36).slice(2)
    readonly isProduction = Bun.env.NODE_ENV === 'production'
    readonly Config = config

    GitHash = ''

    Memory = new MinoMemory()
    Database = new MinoDatabase()
    Services = new MinoServices()

    Elysia!: Awaited<ReturnType<typeof startServer>>

    async init() {
        console.log(`server production mode:`, this.isProduction)

        await this.Memory.init()
        await this.Database.init()

        await this.Memory.loadBlockedCIDR()
        await this.Memory.loadProviderModels()
        await this.initFeatures()

        this.Memory.checkAllProviders()
        this.scheduler()

        this.overrideRejections()
        await this.getRepositoryHash()

        this.Elysia = await startServer()
    }

    private overrideRejections() {
        process.on('unhandledRejection', console.error)
        process.on('uncaughtException', console.error)
    }

    private async getRepositoryHash() {
        const hash = await Bun.$`git rev-parse HEAD`.text()
        this.GitHash = hash.trim()
    }

    async buildStyles() {
        return (await Bun.build({
            entrypoints: ['server/views/styles/global.css'],
            plugins: [tailwind],
            minify: true
        })).outputs[0]?.text()
    }

    async buildClient() {
        return (await Bun.build({
            entrypoints: ['server/client.ts'],
            minify: true,
            target: 'browser',
            format: 'iife'
        })).outputs[0]?.text()
    }

    private scheduler() {
        setInterval(() => {
            this.Memory.checkAllProviders()
        }, 30 * 60 * 1000)

        setInterval(async () => {
            this.Elysia.server?.publish('provider.info', JSON.stringify(
                wsObject('provider.info', await this.Database.getProviderInfo())
            ))
        }, 5 * 1000)
    }

    private async initFeatures() {
        const { loadFeature } = await import('./scripts/features')

        for (const [providerId, provider] of Object.entries(this.Memory.Providers)) {
            if (!provider.page?.features) continue

            for (const cfg of provider.page.features) {
                const FeatureClass = await loadFeature(cfg.id)
                if (!FeatureClass) continue

                const feature = new FeatureClass(provider, cfg.options)
                const interval = feature.getInterval()

                await this.runFeatureCollect(feature, providerId)

                if (interval > 0) {
                    setInterval(() => this.runFeatureCollect(feature, providerId), interval)
                    console.log(`scheduled feature <${cfg.id}> for <${providerId}> every ${interval}ms`)
                }
            }
        }
    }

    private async runFeatureCollect(feature: InstanceType<typeof import('./scripts/features').ProviderFeature>, providerId: string) {
        try {
            const data = await feature.collect()
            this.Memory.setFeatureData(providerId, feature.id, data)
            console.log(`collected feature <${feature.id}> for <${providerId}>`)
        } catch (err) {
            console.error(`failed to collect feature <${feature.id}> for <${providerId}>:`, err)
        }
    }
}

if (import.meta.main) {
    extendConsoleLog('Mino')

    global.Mino = new Mino()
    await global.Mino.init()
}