import { mkdirSync, existsSync, appendFileSync } from 'fs'
import { join } from 'path'

type LogFormat = 'pipe' | 'json'

const LOGS_DIR = 'logs'

export class FileLogger {
    private static instances = new Map<string, FileLogger>()
    private filePath: string
    private format: LogFormat
    private dirReady = false

    constructor(name: string, format: LogFormat = 'pipe') {
        this.filePath = join(LOGS_DIR, `${name}.log`)
        this.format = format
    }

    static get(name: string, format: LogFormat = 'pipe'): FileLogger {
        const key = `${name}:${format}`
        let instance = this.instances.get(key)
        if (!instance) {
            instance = new FileLogger(name, format)
            this.instances.set(key, instance)
        }
        return instance
    }

    private ensureDir() {
        if (this.dirReady) return
        if (!existsSync(LOGS_DIR)) {
            mkdirSync(LOGS_DIR, { recursive: true })
        }
        this.dirReady = true
    }

    private formatTimestamp(): string {
        const now = new Date()
        const pad = (n: number) => n.toString().padStart(2, '0')
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    }

    append(entry: Record<string, any>): void {
        try {
            this.ensureDir()

            let line: string
            if (this.format === 'json') {
                line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry })
            } else {
                const ts = this.formatTimestamp()
                const values = Object.values(entry)
                line = `${ts} | ${values.join(' | ')}`
            }

            appendFileSync(this.filePath, line + '\n')
        } catch (err) {
            console.error(`[FileLogger] failed to write to ${this.filePath}:`, err)
        }
    }
}
