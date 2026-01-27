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
                                    {data.require_auth ? <span class="text-[#d86060]">required</span> : <span class="text-[#60d860]">no auth</span>}
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

                    <div class="mt-8 pt-4 border-t border-dashed border-[#222] font-mono text-xs text-[#666] whitespace-nowrap">
                        <div class="flex gap-4">
                            <span class="w-9 shrink-0 text-[#444] select-none">build</span>
                            <span title={Mino.GitHash} class="cursor-help hover:text-[#888] transition-colors">{Mino.GitHash.slice(0, 7)}</span>
                        </div>
                        <div class="flex gap-4">
                            <span class="w-9 shrink-0 text-[#444] select-none">source</span>
                            <a href="https://github.com/zwvx/mino" target="_blank" rel="noopener noreferrer" class="hover:text-[#888] transition-colors">github.com/zwvx/mino</a>
                        </div>
                    </div>
                </div>
                <script>{client}</script>
            </body>
        </html>
    )
}