import { MinoMemory } from './core/memory'
import { MinoDatabase } from './core/database'
import { MinoServices } from './core/services'

import { startServer } from './server'
import { extendConsoleLog } from '@/utils/logging'

import * as config from '@/data/config.yml'

export class Mino {
    readonly isProduction = Bun.env.NODE_ENV === 'production'
    readonly Config = config

    Memory = new MinoMemory()
    Database = new MinoDatabase()
    Services = new MinoServices()

    async init() {
        console.log(`server production mode:`, this.isProduction)

        await this.Memory.init()
        await this.Database.init()

        await this.Memory.loadBlockedCIDR()
        await this.Memory.loadProviderModels()

        this.overrideRejections()
    }

    private overrideRejections() {
        process.on('unhandledRejection', console.error)
        process.on('uncaughtException', console.error)
    }
}

if (import.meta.main) {
    extendConsoleLog('Mino')

    global.Mino = new Mino()
    await global.Mino.init()

    await startServer()
}