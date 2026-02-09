import { OpenAI } from 'openai'

if (import.meta.main) {
    const url = Bun.argv[2]
    const model = Bun.argv[3]
    const prompt = Bun.argv[4]
    const size = Bun.argv[5] || '1248x1824'

    if (!url || !model || !prompt) {
        console.error('Usage: bun cli/image-request.ts <url> <model> <prompt> [size]')
        process.exit(1)
    }

    const openai = new OpenAI({
        baseURL: url,
        apiKey: 'dummy'
    })

    console.log('models:', (await openai.models.list()).data)

    console.log(`\nGenerating image with prompt: "${prompt}", size: ${size}`)

    const response = await openai.images.generate({
        model, prompt,
        n: 1,
        size: size as any,
        response_format: 'b64_json'
    })

    //console.log('Response:', JSON.stringify(response, null, 2))

    if (response.data?.[0]?.b64_json) {
        const buffer = Buffer.from(response.data[0].b64_json, 'base64')
        const filename = `temp/generated_${Date.now()}.png`
        await Bun.write(filename, buffer)
        console.log(`\nImage saved to: ${filename}`)
    }
}
