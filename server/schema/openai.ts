import { SchemaRequest } from './base'
import { estimateTokenCount } from 'tokenx'

export class OpenAIRequest extends SchemaRequest {
    override setProviderKey(key: string) {
        this.request.headers.set('authorization', `Bearer ${key}`)
    }

    override isChatCompletionEndpoint() {
        return this.request.url.endsWith('/chat/completions')
    }

    override isModelListEndpoint(): boolean {
        return this.request.url.endsWith('/models')
    }

    override getRequestToken(bodyBuffer: ArrayBuffer) {
        try {
            const decoder = new TextDecoder()
            const body = decoder.decode(bodyBuffer)
            const json = JSON.parse(body)

            let text = ''
            if (json.messages && Array.isArray(json.messages)) {
                for (const message of json.messages) {
                    text += (message.role || '') + ' '
                    if (typeof message.content === 'string') {
                        text += message.content + ' '
                    } else if (Array.isArray(message.content)) {
                        for (const part of message.content) {
                            if (part.type === 'text') {
                                text += (part.text || '') + ' '
                            }
                        }
                    }
                }
            }

            return estimateTokenCount(text)
        } catch {
            return 0
        }
    }

    override parseSSEChatResponse(content: string) {
        try {
            let result = ''

            if (content.trim().startsWith('{')) {
                const json = JSON.parse(content)
                if (json.choices && Array.isArray(json.choices)) {
                    for (const choice of json.choices) {
                        result += (choice.message?.content || '')
                    }
                }
            } else {
                const lines = content.split('\n')
                for (const line of lines) {
                    if (line.trim() === 'data: [DONE]') continue
                    if (line.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(line.slice(6))
                            if (json.choices && Array.isArray(json.choices)) {
                                for (const choice of json.choices) {
                                    result += (choice.delta?.content || '')
                                }
                            }
                        } catch { }
                    }
                }
            }

            return {
                content: result,
                tokenCount: estimateTokenCount(result)
            }
        } catch {
            return {
                content: '',
                tokenCount: 0
            }
        }
    }

    override getObjectModel(modelId: string): Record<string, any> {
        return {
            id: modelId,
            object: 'model',
            created: Date.now(),
            owned_by: 'mino'
        }
    }
}