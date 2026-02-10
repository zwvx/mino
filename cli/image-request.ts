if (import.meta.main) {
    const url = Bun.argv[2]
    const model = Bun.argv[3]
    const prompt = Bun.argv[4]
    const size = Bun.argv[5] || '1248x1824'

    if (!url || !model || !prompt) {
        console.error('Usage: bun cli/image-request.ts <url> <model> <prompt> [size]')
        process.exit(1)
    }

    const baseUrl = url.endsWith('/') ? url : url + '/'

    console.log(`models:`, await fetch(`${baseUrl}models`, {
        headers: { 'Authorization': 'Bearer dummy' }
    }).then(r => r.json()).then(r => r.data))

    console.log(`\nGenerating image with prompt: "${prompt}", size: ${size}`)

    const response = await fetch(`${baseUrl}images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer dummy'
        },
        body: JSON.stringify({
            model, prompt,
            n: 1,
            size,
            response_format: 'b64_json'
        })
    })

    console.log(`[fetch] status: ${response.status}`)

    if (!response.ok) {
        console.log(`[fetch] error:`, await response.text())
        process.exit(1)
    }

    const data = await response.json() as { data?: { b64_json?: string }[] }

    if (data.data?.[0]?.b64_json) {
        const buffer = Buffer.from(data.data[0].b64_json, 'base64')
        const filename = `temp/generated_${Date.now()}.png`
        await Bun.write(filename, buffer)
        console.log(`\nImage saved to: ${filename}`)
    }
}
