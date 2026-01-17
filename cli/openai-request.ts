import { OpenAI } from 'openai'

if (import.meta.main) {
    const url = Bun.argv[2]!
    const model = Bun.argv[3]!

    const openai = new OpenAI({
        baseURL: url,
        apiKey: 'sk-test'
    })

    console.log(`models:`, (await openai.models.list()).data)

    const stream = await openai.chat.completions.create({
        model: model,
        messages: [
            {
                role: 'user',
                content: 'hello?'
            }
        ],
        stream: true,
        max_completion_tokens: 100
    })

    for await (const chunk of stream) {
        process.stdout.write(chunk.choices[0]?.delta?.content || '')
    }
    process.stdout.write('\n')
}