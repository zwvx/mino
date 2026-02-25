import { Html } from '@elysiajs/html'

export const Verify = async ({ ip }: { ip: string | null }) => {
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

    const siteKey = Mino.isProduction
        ? Mino.Config.cloudflare.turnstile.site_key
        : '1x00000000000000000000AA'

    return (
        <html lang="en">
            <head>
                <title>mino</title>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
                <style>{styles}</style>
            </head>
            <body class="bg-[#111] text-[#c0c0c0] font-mono p-6 max-w-2xl text-md">
                <div class="space-y-4">
                    {Mino.Memory.Security.spikeMode.active ? (
                        <>
                            <div id="verify-status" class="text-[#888]">gazing into the void...</div>
                            <div class="text-[#888] text-sm mb-4">
                                <p>Current IP: <span class="text-[#c0c0c0]">{ip ?? 'Unknown'}</span></p>
                                <p class="mt-2 text-[#f87171]">Disclaimer: Verification is tied strictly to this specific IP. If you switch networks or your address changes (e.g., from IPv4 to IPv6), you will need to verify again with your new IP.</p>
                            </div>
                            <div
                                class="cf-turnstile"
                                data-sitekey={siteKey}
                                data-callback="onTurnstileVerify"
                                data-theme="dark"
                            ></div>
                            <script>{client}</script>
                        </>
                    ) : (
                        <div id="verify-status" class="text-[#888]">nothing to see here</div>
                    )}
                </div>
            </body>
        </html>
    )
}
