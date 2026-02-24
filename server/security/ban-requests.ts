import { Logger } from '../utils/logger'

interface BanHeaderEntry {
    key: string
    type: 'exact' | 'regex'
    value: string
}

interface BanRule {
    mode: 'or' | 'and'
    headers: BanHeaderEntry[]
}

type HeaderMatchingConfig = Record<string, BanRule>

const regexCache = new Map<string, RegExp | null>()

function compileRegex(pattern: string): RegExp | null {
    const cached = regexCache.get(pattern)
    if (cached !== undefined) return cached

    try {
        let source = pattern
        let flags = ''

        const slashMatch = pattern.match(/^\/(.+)\/([gimsuy]*)$/)
        if (slashMatch) {
            source = slashMatch[1]!
            flags = slashMatch[2]!
        }

        const re = new RegExp(source, flags)
        regexCache.set(pattern, re)
        return re
    } catch (err) {
        Logger.warn(`[BanRequests] invalid regex pattern: "${pattern}"`, err)
        regexCache.set(pattern, null)
        return null
    }
}

function matchHeader(headerValue: string | null, entry: BanHeaderEntry): boolean {
    if (headerValue === null) return false

    if (entry.type === 'exact') {
        return headerValue === entry.value
    }

    if (entry.type === 'regex') {
        const re = compileRegex(entry.value)
        if (!re) return false
        return re.test(headerValue)
    }

    return false
}

export function checkBanHeaders(headers: Headers): { banned: boolean; rule?: string } {
    const config = (Mino.Config as any).ban_requests?.header_matching as HeaderMatchingConfig | undefined

    if (!config) return { banned: false }

    for (const [ruleName, rule] of Object.entries(config)) {
        if (!rule.headers || !Array.isArray(rule.headers) || rule.headers.length === 0) continue

        const mode = (rule.mode || 'or').toLowerCase()
        const results = rule.headers.map((entry) => matchHeader(headers.get(entry.key), entry))

        let matched: boolean
        if (mode === 'and') {
            matched = results.every(Boolean)
        } else {
            matched = results.some(Boolean)
        }

        if (matched) {
            return { banned: true, rule: ruleName }
        }
    }

    return { banned: false }
}
