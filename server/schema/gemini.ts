import { SchemaRequest } from './base'

export class GeminiRequest extends SchemaRequest {
    override setProviderKey(key: string) {
        this.request.headers.set('x-goog-api-key', key)
    }

    override isChatCompletionEndpoint() {
        const url = new URL(this.request.url)
        const validPath = [':generateContent', ':generateContentBatch', ':streamGenerateContent']
        return validPath.some((path) => decodeURIComponent(url.pathname).endsWith(path))
    }
}