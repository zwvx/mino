import type { Provider, PageFeature } from '@/types/provider'
import { parseDuration } from '@/utils/time'

export interface FeatureData {
    [key: string]: any
}

export abstract class ProviderFeature {
    readonly provider: Provider
    readonly options: PageFeature['options']

    constructor(provider: Provider, options?: PageFeature['options']) {
        this.provider = provider
        this.options = options ?? {}
    }

    abstract readonly id: string
    abstract readonly displayName: string

    getInterval(): number {
        if (this.options?.interval) {
            return parseDuration(this.options.interval)
        }
        return 0
    }

    abstract collect(): Promise<FeatureData>
    abstract render(data: FeatureData | null): JSX.Element
}
