import { SchemaRequest } from './base'

export class AnthropicRequest extends SchemaRequest {
    override setProviderKey(key: string) {
        this.request.headers.set('x-api-key', key)
    }

    override isChatCompletionEndpoint() {
        return this.request.url.endsWith('/v1/messages')
    }
}