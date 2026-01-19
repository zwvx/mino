import { Html } from '@elysiajs/html'
import tailwind from 'bun-plugin-tailwind'

export const Index = async () => {
    const styles = await Bun.build({
        entrypoints: ['server/views/styles/global.css'],
        plugins: [tailwind],
        minify: true
    })

    const stylesText = await styles.outputs[0]?.text()
    if (!stylesText) {
        console.error('failed to build styles')
        return
    }

    return (
        <html lang="en">
            <head>
                <title>mino</title>
                <style>{stylesText}</style>
            </head>
            <body class="flex flex-col items-center justify-center h-screen">
                <h3 class="text-2xl">wip</h3>
            </body>
        </html>
    )
}