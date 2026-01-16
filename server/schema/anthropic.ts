import { SchemaRequest } from './base'

export class AnthropicRequest extends SchemaRequest {
    override setProviderKey(key: string) {
        this.request.headers.set('x-api-key', key)
    }
}