export function extendConsoleLog(title: string) {
    const log = console.log
    const warn = console.warn
    const error = console.error

    console.log = (...args) => {
        log(`[${title}]`, ...args)
    }

    console.warn = (...args) => {
        warn(`[${title}]`, ...args)
    }

    console.error = (...args) => {
        error(`[${title}]`, ...args)
    }
}