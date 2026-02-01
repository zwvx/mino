const yellow = '\x1b[33m'
const reset = '\x1b[0m'

export function extendConsoleLog(title: string) {
    const log = console.log
    const warn = console.warn
    const error = console.error

    console.log = (...args) => {
        log(`[${title}]`, ...args)
    }

    console.warn = (...args) => {
        warn(`${yellow}[${title}]${reset}`, ...args)
    }

    console.error = (...args) => {
        error(`[${title}]`, ...args)
    }

    console.debug = (...args) => {
        if (!Mino || !Mino.isDebug) return
        log(`[${title}]`, '[DEBUG]', ...args)
    }
}