import { Html } from '@elysiajs/html'

export const FallbackView = async () => {
    const styles = await Mino.buildStyles()
    if (!styles) {
        console.error('failed to build styles')
        return
    }

    const content = await Bun.file('data/fallback.txt').text()

    return (
        <html lang="en">
            <head>
                <title>mino</title>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <style>{styles}</style>
            </head>
            <body class="bg-[#111] text-[#c0c0c0] font-mono p-6 max-w-2xl text-xs">
                <div class="space-y-4">
                    <pre class="tracking-normal m-0 font-mono whitespace-pre">{content}</pre>
                </div>
            </body>
        </html>
    )
}