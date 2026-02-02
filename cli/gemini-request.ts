import { GoogleGenAI } from '@google/genai'

if (import.meta.main) {
    const url = Bun.argv[2]!
    const model = Bun.argv[3]!
    const key = Bun.argv[4]!

    const ai = new GoogleGenAI({
        apiKey: key
    })

    const stream = await ai.models.generateContentStream({
        model: model,
        contents: [{
            role: 'user',
            parts: [{ text: 'hello?' }]
        }],
        config: {
            httpOptions: {
                baseUrl: url
            }
        }
    })

    for await (const chunk of stream) {
        process.stdout.write(chunk.text ?? '')
    }
}