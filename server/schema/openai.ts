import { SchemaRequest } from './base'

export class OpenAIRequest extends SchemaRequest {
    override setProviderKey(key: string) {
        this.request.headers.set('authorization', `Bearer ${key}`)
    }

    override isChatCompletionEndpoint() {
        return this.request.url.endsWith('/chat/completions')
    }
}