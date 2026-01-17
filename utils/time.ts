export function parseDuration(timeStr: string): number {
    const match = timeStr.trim().match(/^(\d+)\s*(ms|s|m|h|d|w|M|y)$/)

    if (!match) {
        throw new Error(`Invalid duration format "${timeStr}". Expected format: <number><unit> (e.g., "10m", "1h")`)
    }

    const value = parseInt(match[1]!, 10)
    const unit = match[2]!

    if (unit === 'ms') return value

    const unitMultipliers: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
        M: 30 * 24 * 60 * 60 * 1000,
        y: 365 * 24 * 60 * 60 * 1000
    }

    const multiplier = unitMultipliers[unit]
    if (multiplier) {
        return value * multiplier
    }

    return value
}

export function msToHuman(ms: number): string {
    if (ms < 1000) return `${ms}ms`

    const seconds = ms / 1000
    if (seconds < 60) {
        if (Number.isInteger(seconds)) return `${seconds} seconds`
        return `${seconds.toFixed(1)} seconds`
    }

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minutes`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hours`

    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} days`

    const months = Math.floor(days / 30)
    if (months < 12) return `${months} months`

    const years = Math.floor(months / 12)
    return `${years} years`
}