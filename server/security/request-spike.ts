interface RequestSpikeConfig {
    perIpWindowMs: number
    perIpMaxRequests: number
    globalWindowMs: number
    globalMaxRequests: number
    spikeModeDuration: number
}

const config: RequestSpikeConfig = {
    perIpWindowMs: 10_000,
    perIpMaxRequests: 30,
    globalWindowMs: 5_000,
    globalMaxRequests: 100,
    spikeModeDuration: 30 * 60_000
}

function pruneTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
    const cutoff = now - windowMs
    return timestamps.filter((t) => t > cutoff)
}

function checkSpikeExpiry(): boolean {
    const { spikeMode } = Mino.Memory.Security

    if (spikeMode.active && Date.now() > spikeMode.expiresAt) {
        spikeMode.active = false
        spikeMode.activatedAt = 0
        spikeMode.expiresAt = 0
        console.log('spike mode expired')
        return false
    }

    return spikeMode.active
}

function activateSpikeMode(reason: string): void {
    const now = Date.now()
    Mino.Memory.Security.spikeMode = {
        active: true,
        activatedAt: now,
        expiresAt: now + config.spikeModeDuration
    }
    console.warn(`spike mode activated: ${reason}`)
}

export function checkRequestSpike(ip: string): boolean {
    if (checkSpikeExpiry()) {
        return true
    }

    const now = Date.now()
    const { perIpTracking, globalTracking } = Mino.Memory.Security

    let ipTimestamps = perIpTracking.get(ip) || []
    ipTimestamps = pruneTimestamps(ipTimestamps, config.perIpWindowMs, now)
    ipTimestamps.push(now)
    perIpTracking.set(ip, ipTimestamps)

    const prunedGlobal = pruneTimestamps(globalTracking, config.globalWindowMs, now)
    prunedGlobal.push(now)
    Mino.Memory.Security.globalTracking = prunedGlobal

    if (ipTimestamps.length > config.perIpMaxRequests) {
        activateSpikeMode(`per-ip threshold exceeded by ${ip}`)
        return true
    }

    if (prunedGlobal.length > config.globalMaxRequests) {
        activateSpikeMode(`global threshold exceeded (${prunedGlobal.length} requests)`)
        return true
    }

    return false
}

export function isSpikeMode(): boolean {
    return checkSpikeExpiry()
}

export function resetSpikeMode(): void {
    Mino.Memory.Security.spikeMode = {
        active: false,
        activatedAt: 0,
        expiresAt: 0
    }
    Mino.Memory.Security.perIpTracking.clear()
    Mino.Memory.Security.globalTracking = []
}
