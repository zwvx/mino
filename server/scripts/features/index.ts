import { ProviderFeature, type FeatureData } from './abstract'
import type { Provider, PageFeature } from '@/types/provider'

export { ProviderFeature, type FeatureData }

type FeatureClass = new (provider: Provider, options?: PageFeature['options']) => ProviderFeature

const registry: Record<string, string> = {
    'model_ttft_health': './model_ttft_health.tsx'
}

export async function loadFeature(featureId: string): Promise<FeatureClass | null> {
    const path = registry[featureId]
    if (!path) {
        console.warn(`feature <${featureId}> not found in registry`)
        return null
    }

    try {
        const mod = await import(path)
        return mod.default
    } catch (err) {
        console.error(`failed to load feature <${featureId}>:`, err)
        return null
    }
}

export function getFeatureIds(): string[] {
    return Object.keys(registry)
}
