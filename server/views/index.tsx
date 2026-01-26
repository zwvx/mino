import { Html } from '@elysiajs/html'

export const Index = async () => {
    const styles = await Mino.buildStyles()
    if (!styles) {
        console.error('failed to build styles')
        return
    }

    const client = await Mino.buildClient()
    if (!client) {
        console.error('failed to build client script')
        return
    }

    const providers = Mino.Memory.Providers
    const base = Mino.Config.site.base_url

    return (
        <html lang="en">
            <head>
                <title>mino</title>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <style>{styles}</style>
            </head>
            <body class="bg-[#111] text-[#c0c0c0] font-serif p-6 max-w-2xl text-md">
                <h1 class="text-lg font-bold mb-4 tracking-tight">mino (wip)</h1>

                <div class="space-y-1">
                    {Object.entries(providers).map(([name, data]: [string, any]) => (
                        <details class="group">
                            <summary class="cursor-pointer hover:text-[#fff] select-none text-[#aaa] group-open:text-[#eee]">
                                {name}
                            </summary>

                            <div class="pl-4 py-1 space-y-0.5 font-mono text-sm text-[#888] overflow-x-auto whitespace-nowrap">
                                <div class="flex gap-4">
                                    <span class="w-16 text-[#555] shrink-0">auth</span>
                                    {data.require_auth ? <span class="text-[#d86060]">required</span> : <span class="text-[#60d860]">no</span>}
                                </div>
                                <div class="flex gap-4">
                                    <span class="w-16 text-[#555] shrink-0">endpoint</span>
                                    <span><a href={`${base}/x/${name}/`} target="_blank" rel="noopener noreferrer" class="text-[#6086d8]">{base}/x/{name}/</a></span>
                                </div>
                                {data.schema && data.schema.length > 0 && (
                                    <div class="flex gap-4">
                                        <span class="w-16 text-[#555] shrink-0">schemas</span>
                                        <span class="text-[#d8b060]">
                                            [{data.schema.map((s: any) => s.id).join(', ')}]
                                        </span>
                                    </div>
                                )}
                                <div class="flex gap-4">
                                    <span class="w-16 text-[#555] shrink-0">info</span>
                                    <span>keys: <span id={`keys:${name}`}>-</span> • total: <span id={`spent:${name}`}>-</span></span>
                                </div>
                            </div>
                        </details>
                    ))}
                </div>
                <script>{client}</script>
            </body>
        </html>
    )
}