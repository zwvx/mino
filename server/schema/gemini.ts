import { SchemaRequest } from './base'
import { estimateTokenCount } from 'tokenx'

export class GeminiRequest extends SchemaRequest {
    override setProviderKey(key: string) {
        this.request.headers.set('x-goog-api-key', key)
    }

    override isChatCompletionEndpoint() {
        const url = new URL(this.request.url)
        const validPath = [':generateContent', ':generateContentBatch', ':streamGenerateContent']
        return validPath.some((path) => decodeURIComponent(url.pathname).endsWith(path))
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
}