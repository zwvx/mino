import { Html } from '@elysiajs/html'
import { marked } from 'marked'
import type { Provider } from '@/types/provider'
import { loadFeature } from '@/server/scripts/features'

interface Props {
    provider: Provider
}

export const ProviderView = async ({ provider }: Props) => {
    const styles = await Mino.buildStyles()
    if (!styles) return

    const featureElements: JSX.Element[] = []

    let messageHtml = ''
    if (provider.page?.message) {
        try {
            messageHtml = await marked.parse(provider.page.message, { async: true, breaks: true })
        } catch (e) { }
    }

    if (provider.page?.features) {
        for (const cfg of provider.page.features) {
            const FeatureClass = await loadFeature(cfg.id)
            if (!FeatureClass) continue

            const feature = new FeatureClass(provider, cfg.options)
            const interval = feature.getInterval()
            let data = null

            if (interval > 0) {
                data = Mino.Memory.getFeatureData(provider.id, cfg.id)
            } else {
                data = await feature.collect()
            }

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
                {messageHtml && (
                    <div class="text-[#888] text-sm mb-4 [&_p]:m-0 [&_p]:mb-1 [&:last-child]:mb-0 [&_strong]:text-[#ccc] [&_a]:text-[#6086d8] [&_a:hover]:text-[#8aa6e8]">
                        {messageHtml as 'safe'}
                    </div>
                )}

                {featureElements}
            </body>
        </html>
    )
}
