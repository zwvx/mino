import { Logger } from '../utils/logger'
import { watch } from 'fs'

class BlockIpManager {
    private static blockedIps: Set<string> = new Set()
    private static isInitialized = false
    private static filePath = 'data/block_ip.txt'

    static async init() {
        if (this.isInitialized) return
        this.isInitialized = true

        await this.loadIps()

        try {
            watch(this.filePath, async (event, filename) => {
                if (event === 'change') {
                    Logger.info('[BlockIP] Reloading blocked IPs...')
                    await this.loadIps()
                }
            })
        } catch (err) {
            Logger.warn('[BlockIP] Failed to watch block_ip.txt:', err)
        }
    }

    private static async loadIps() {
        try {
            const file = Bun.file(this.filePath)
            if (!await file.exists()) {
                this.blockedIps.clear()
                return
            }

            const text = await file.text()
            const ips = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('#'))

            this.blockedIps = new Set(ips)
            Logger.info(`[BlockIP] Loaded ${this.blockedIps.size} blocked IPs`)
        } catch (err) {
            Logger.error('[BlockIP] Failed to load blocked IPs:', err)
        }
    }

    static isBlocked(ip: string): boolean {
        return this.blockedIps.has(ip)
    }
}

export { BlockIpManager }
