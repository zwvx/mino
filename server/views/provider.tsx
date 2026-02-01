import { Html } from '@elysiajs/html'
import type { Provider } from '@/types/provider'
import { loadFeature } from '@/server/scripts/features'

interface Props {
    provider: Provider
}

export const ProviderView = async ({ provider }: Props) => {
    const styles = await Mino.buildStyles()
    if (!styles) return

    const featureElements: JSX.Element[] = []

    if (provider.page?.features) {
        for (const cfg of provider.page.features) {
            const FeatureClass = await loadFeature(cfg.id)
            if (!FeatureClass) continue

            const feature = new FeatureClass(provider, cfg.options)
            const data = Mino.Memory.getFeatureData(provider.id, cfg.id)

            featureElements.push(
                <div class="mt-6 pt-4 border-t border-dashed border-[#222]">
                    <div class="text-[#555] text-xs mb-2 select-none">{feature.displayName}</div>
                    {feature.render(data)}
                </div>
            )
        }
    }

    return (
        <html lang="en">
            <head>
                <title>mino</title>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <style>{styles}</style>
            </head>
            <body class="bg-[#111] text-[#c0c0c0] font-serif p-6 max-w-2xl text-md">
                {provider.page?.message && (
                    <p class="text-[#888] text-sm mb-4">{provider.page.message}</p>
                )}

                {featureElements}
            </body>
        </html>
    )
}
