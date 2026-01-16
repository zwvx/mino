import { SchemaRequest } from './base'

export class GeminiRequest extends SchemaRequest {
    override setProviderKey(key: string) {
        this.request.headers.set('x-goog-api-key', key)
    }
}