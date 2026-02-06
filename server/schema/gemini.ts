import { SchemaRequest } from './base'
import { estimateTokenCount } from 'tokenx'

export class GeminiRequest extends SchemaRequest {
    protected override endpointPatterns = {
        chat_completion: [':generateContent', ':generateContentBatch', ':streamGenerateContent']
    }

    override setProviderKey(key: string) {
        this.request.headers.set('x-goog-api-key', key)
    }

    override isChatCompletionEndpoint() {
        const url = new URL(this.request.url)
        const validPath = [':generateContent', ':generateContentBatch', ':streamGenerateContent']
        return validPath.some((path) => decodeURIComponent(url.pathname).endsWith(path))
    }

    override getModelId(bodyBuffer: ArrayBuffer): string | null {
        const url = new URL(this.request.url)
        const decodedPath = decodeURIComponent(url.pathname)

        const match = decodedPath.match(/\/models\/([^:]+):/)
        if (match && match[1]) {
            return match[1]
        }
        return null
    }

    override getMaxTokens(bodyBuffer: ArrayBuffer): number | null {
        try {
            const decoder = new TextDecoder()
            const body = decoder.decode(bodyBuffer)
            const json = JSON.parse(body)
            return json.generationConfig?.maxOutputTokens ?? null
        } catch {
            return null
        }
    }

    override isModelListEndpoint(): boolean {
        const url = new URL(this.request.url)
        return url.pathname.endsWith('/models') || url.pathname.endsWith('/models/')
    }

    override getRequestToken(bodyBuffer: ArrayBuffer) {
        try {
            const decoder = new TextDecoder()
            const body = decoder.decode(bodyBuffer)
            const json = JSON.parse(body)

            let text = ''
            if (json.contents && Array.isArray(json.contents)) {
                for (const content of json.contents) {
                    text += (content.role || '') + ' '
                    if (content.parts && Array.isArray(content.parts)) {
                        for (const part of content.parts) {
                            if (part.text) {
                                text += part.text + ' '
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
                if (json.candidates && Array.isArray(json.candidates)) {
                    for (const candidate of json.candidates) {
                        if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
                            for (const part of candidate.content.parts) {
                                if (part.text) {
                                    result += part.text
                                }
                            }
                        }
                    }
                }
            } else {
                const lines = content.split('\n')
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(line.slice(6))
                            if (json.candidates && Array.isArray(json.candidates)) {
                                for (const candidate of json.candidates) {
                                    if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
                                        for (const part of candidate.content.parts) {
                                            if (part.text) {
                                                result += part.text
                                            }
                                        }
                                    }
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
            name: `models/${modelId}`,
            version: '001',
            displayName: modelId,
            description: `mino`,
            inputTokenLimit: 1048576,
            outputTokenLimit: 65536,
            supportedGenerationMethods: ['generateContent', 'countTokens']
        }
    }

    override getObjectModels(modelIds: string[]): Record<string, any> {
        return {
            models: modelIds.map((m) => this.getObjectModel(m))
        }
    }

    override parseModelsResponse(data: Record<string, any>): string[] {
        if (data.models && Array.isArray(data.models)) {
            return data.models.map((m: { name: string }) => {
                return m.name.replace(/^models\//, '')
            })
        }
        return []
    }

    override rewriteModelInBody(bodyBuffer: ArrayBuffer, newModelId: string): ArrayBuffer {
        // todo.
        return bodyBuffer
    }

    override distillQuery(searchParams: URLSearchParams): URLSearchParams {
        searchParams.delete('key')
        return searchParams
    }
}