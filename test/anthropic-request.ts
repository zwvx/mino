import Anthropic from "@anthropic-ai/sdk"

if (import.meta.main) {
    const url = Bun.argv[2]!
    const anthropic = new Anthropic({
        baseURL: url,
        apiKey: 'sk-test'
    })

    await anthropic.messages.create({
        model: 'test-model',
        messages: [
            {
                role: 'user',
                content: 'hello?'
            }
        ],
        max_tokens: 100
    })
}
