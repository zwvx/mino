import { MinoMemory } from './core/memory'
import { MinoDatabase } from './core/database'

import { startServer } from './server'
import { extendConsoleLog } from '@/utils/logging'

export class Mino {
    readonly isProduction = Bun.env.NODE_ENV === 'production'

    Memory = new MinoMemory()
    Database = new MinoDatabase()

    async init() {
        console.log(`server production mode:`, this.isProduction)

        await this.Memory.init()
        await this.Database.init()

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