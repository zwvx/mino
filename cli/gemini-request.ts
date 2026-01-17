import { GoogleGenAI } from '@google/genai'

if (import.meta.main) {
    const url = Bun.argv[2]!
    const ai = new GoogleGenAI({
        apiKey: 'sk-test'
    })

    await ai.models.generateContent({
        model: 'test-model',
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
}