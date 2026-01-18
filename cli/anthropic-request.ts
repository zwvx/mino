import Anthropic from "@anthropic-ai/sdk"

if (import.meta.main) {
    const url = Bun.argv[2]!
    const model = Bun.argv[3]!
    const key = Bun.argv[4]!

    const anthropic = new Anthropic({
        baseURL: url,
        apiKey: key
    })

    console.log(`models:`, (await anthropic.models.list()).data)

    await anthropic.messages.stream({
        model: model,
        messages: [
            {
                role: 'user',
                content: 'hello?'
            }
        ],
        max_tokens: 100
    }).on('text', (textDelta) => process.stdout.write(textDelta)).on('end', () => process.stdout.write('\n'))
}
