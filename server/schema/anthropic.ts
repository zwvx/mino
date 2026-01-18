import { SchemaRequest } from './base'
import { estimateTokenCount } from 'tokenx'

export class AnthropicRequest extends SchemaRequest {
    override additionalStripHeaders = ['authorization']

    override setProviderKey(key: string) {
        this.request.headers.set('x-api-key', key)
    }

    override isChatCompletionEndpoint() {
        return this.request.url.endsWith('/v1/messages')
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
                if (json.content && Array.isArray(json.content)) {
                    for (const part of json.content) {
                        if (part.type === 'text') {
                            result += (part.text || '')
                        }
                    }
                }
            } else {
                const lines = content.split('\n')
                for (const line of lines) {
                    if (line.trim() === 'data: [DONE]') continue
                    if (line.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(line.slice(6))
                            if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                                result += (json.delta.text || '')
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
            created_at: new Date().toISOString(),
            display_name: modelId,
            type: 'model'
        }
    }

    override getObjectModels(modelIds: string[]) {
        return {
            data: modelIds.map((m) => this.getObjectModel(m)),
            first_id: modelIds[0],
            last_id: modelIds[modelIds.length - 1],
            has_more: false
        }
    }
}