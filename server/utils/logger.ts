const C = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bgBlue: '\x1b[44;37m',
    bgGreen: '\x1b[42;37m',
    bgRed: '\x1b[41;37m'
}

export class Logger {
    static info(msg: string, ...args: any[]) {
        console.log(msg, ...args)
    }

    static warn(msg: string, ...args: any[]) {
        console.warn(msg, ...args)
    }

    static error(msg: string, ...args: any[]) {
        console.error(msg, ...args)
    }

    static debug(msg: string, ...args: any[]) {
        console.debug(msg, ...args)
    }

    static entry(key: string, schema: string, provider: string, endpoint: string, extra?: string) {
        console.log(`${C.bgBlue}[${key}]${C.reset} [${schema}] [${provider}] [${endpoint}]${extra ? ' ' + extra : ''}`)
    }

    static completion(key: string, schema: string, path: string, duration: string, outputTokens?: number) {
        const extra = outputTokens ? ` (${outputTokens} tokens)` : ''
        console.log(`${C.bgGreen}[${key}]${C.reset} [${schema}] ${path} took ${duration}${extra}`)
    }

    static completionSimple(key: string, schema: string, path: string, duration: string) {
        console.log(`[${key}] [${schema}] ${path} took ${duration}`)
    }

    static spike(key: string) {
        console.log(`${C.bgRed}[${key}]${C.reset} ${C.red}request spike detected, blocking${C.reset}`)
    }

    static retry(key: string, count: number, max: number) {
        console.log(`${C.cyan}[${key}] retrying request (${count}/${max})${C.reset}`)
    }

    static debugKey(key: string, msg: string) {
        console.debug(`${C.cyan}[${key}] ${msg}${C.reset}`)
    }

    static fail(key: string, msg: string, ...args: any[]) {
        console.log(`${C.red}[${key}] ${msg}${C.reset}`, ...args)
    }

    static warnKey(key: string, msg: string, ...args: any[]) {
        console.warn(`${C.yellow}[${key}]${C.reset} ${msg}`, ...args)
    }
}
